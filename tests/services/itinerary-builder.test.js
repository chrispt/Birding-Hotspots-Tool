import { assert } from '../run-tests.js';
import { selectHotspots, canShowGenericItineraryButton, buildItinerary, toSavedItineraryStops, reviveSavedItinerary } from '../../js/services/itinerary-builder.js';

/**
 * Mocks global fetch with a single successful OSRM Trip API response for a
 * round trip through one hotspot: start -> hotspot -> back to start, with a
 * 600-second (10 min) leg each way.
 */
function installOptimizedTripMock() {
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            code: 'Ok',
            trips: [{
                distance: 20000,
                duration: 1200,
                legs: [{ distance: 10000, duration: 600 }, { distance: 10000, duration: 600 }],
                geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1], [0, 0]] }
            }],
            waypoints: [
                { waypoint_index: 0, location: [0, 0] },
                { waypoint_index: 1, location: [1, 1] }
            ]
        })
    });
}

function roundTripArgs() {
    const start = { lat: 0, lng: 0, address: 'Start' };
    const hotspots = [{ locId: 'h1', name: 'Hotspot One', lat: 1, lng: 1, speciesCount: 5, distance: 0 }];
    return { start, end: start, hotspots };
}

export async function testSelectHotspotsReturnsAllWhenUnderCap() {
    const hotspots = [
        { locId: 'a', speciesCount: 10, distance: 5 },
        { locId: 'b', speciesCount: 20, distance: 2 }
    ];

    const selected = selectHotspots(hotspots, 5, 'balanced');
    assert(selected.length === 2, `Expected both hotspots returned unchanged, got ${selected.length}`);
}

export async function testSelectHotspotsPicksTopScoredWhenOverCap() {
    const hotspots = [
        { locId: 'richFar', speciesCount: 100, distance: 50 },
        { locId: 'poorNear', speciesCount: 10, distance: 1 },
        { locId: 'richNear', speciesCount: 90, distance: 2 }
    ];

    const selected = selectHotspots(hotspots, 2, 'species');
    const ids = selected.map(h => h.locId);

    assert(selected.length === 2, `Expected exactly 2 hotspots, got ${selected.length}`);
    assert(ids.includes('richNear'), 'Rich, nearby hotspot should be selected under species priority');
    assert(ids.includes('richFar'), 'Rich, distant hotspot should still outscore the poor nearby one under species priority');
    assert(!ids.includes('poorNear'), 'Low-species hotspot should be dropped when over the cap');
}

export async function testSelectHotspotsRespectsDistancePriority() {
    const hotspots = [
        { locId: 'richFar', speciesCount: 100, distance: 50 },
        { locId: 'poorNear', speciesCount: 10, distance: 1 },
        { locId: 'midMid', speciesCount: 50, distance: 25 }
    ];

    const selected = selectHotspots(hotspots, 1, 'distance');
    assert(selected[0].locId === 'poorNear', 'Distance priority should favor the nearest hotspot even with low species count');
}

export async function testCanShowGenericItineraryButtonOnlyForLocationHotspotMode() {
    assert(canShowGenericItineraryButton('location', 'hotspot') === true, 'location+hotspot should show the button');
    assert(canShowGenericItineraryButton('route', 'hotspot') === false, 'route mode should hide the button');
    assert(canShowGenericItineraryButton('location', 'species') === false, 'species sub-mode should hide the button');
    assert(canShowGenericItineraryButton('route', 'species') === false, 'route+species should hide the button');
}

export async function testBuildItineraryDefaultsStartTimeToSevenAM() {
    installOptimizedTripMock();
    const { start, end, hotspots } = roundTripArgs();

    const itinerary = await buildItinerary(start, end, hotspots, { maxStops: 5 });
    const startStop = itinerary.stops[0];

    assert(startStop.departureTime.getHours() === 7 && startStop.departureTime.getMinutes() === 0,
        `Expected default departure at 7:00 AM, got ${startStop.departureTime.toTimeString()}`);
}

export async function testBuildItineraryHonorsCustomStartTime() {
    installOptimizedTripMock();
    const { start, end, hotspots } = roundTripArgs();

    const itinerary = await buildItinerary(start, end, hotspots, { maxStops: 5, startTime: '09:15' });
    const startStop = itinerary.stops[0];

    assert(startStop.departureTime.getHours() === 9 && startStop.departureTime.getMinutes() === 15,
        `Expected departure at 9:15 AM, got ${startStop.departureTime.toTimeString()}`);
}

export async function testBuildItineraryArrivalTimeIncludesTravelFromPreviousStop() {
    installOptimizedTripMock();
    const { start, end, hotspots } = roundTripArgs();

    // 9:15 start + a 10-minute (600s) leg to the hotspot should arrive at 9:25,
    // not 9:15 (regression guard for arrival time being captured before travel
    // time was added).
    const itinerary = await buildItinerary(start, end, hotspots, { maxStops: 5, startTime: '09:15' });
    const hotspotStop = itinerary.stops.find(s => s.type === 'hotspot');

    assert(hotspotStop.arrivalTime.getHours() === 9 && hotspotStop.arrivalTime.getMinutes() === 25,
        `Expected hotspot arrival at 9:25 AM (9:15 start + 10 min travel), got ${hotspotStop.arrivalTime.toTimeString()}`);
}

export async function testToSavedItineraryStopsStripsHeavyFieldsAndSerializesDates() {
    const arrival = new Date('2026-09-04T13:30:00Z');
    const lean = toSavedItineraryStops([
        { type: 'start', name: 'Start', lat: 0, lng: 0, address: 'Home', stopNumber: 1, arrivalTime: null },
        { type: 'hotspot', name: 'Marsh', locId: 'L1', lat: 1, lng: 1, speciesCount: 12, stopNumber: 2,
          suggestedVisitTime: 32, arrivalTime: arrival, birds: [{}], weather: {}, recentObservations: [{}], legToNext: {} }
    ]);
    assert(lean.length === 2, 'All stops are kept');
    assert(lean[1].birds === undefined && lean[1].weather === undefined && lean[1].recentObservations === undefined,
        'Heavy per-stop fields must be dropped');
    assert(lean[1].legToNext === undefined, 'legToNext must be dropped');
    assert(lean[1].arrivalTime === arrival.toISOString(), 'arrivalTime is serialised to ISO');
    assert(lean[0].arrivalTime === null, 'Null arrival stays null');
    assert(lean[1].locId === 'L1' && lean[1].speciesCount === 12, 'Identity fields are kept');
}

export async function testReviveSavedItineraryRestoresDatesAndDefaults() {
    // Legacy record: no summary, no legs, no isRoundTrip
    const legacy = {
        name: 'Old trip',
        totalDistance: 5000,
        stops: [
            { type: 'start', name: 'Start', lat: 0, lng: 0 },
            { type: 'hotspot', name: 'A', lat: 1, lng: 1, speciesCount: 10, suggestedVisitTime: 31, arrivalTime: '2026-09-04T13:30:00.000Z' },
            { type: 'hotspot', name: 'B', lat: 2, lng: 2, speciesCount: 20, suggestedVisitTime: 32, arrivalTime: '2026-09-04T14:30:00.000Z' }
        ]
    };
    const it = reviveSavedItinerary(legacy);
    assert(Array.isArray(it.legs) && it.legs.length === 0, 'legs defaults to an empty array');
    assert(it.geometry === null, 'geometry is null for a saved itinerary');
    assert(it.summary.totalStops === 2, `totalStops should count hotspot stops, got ${it.summary.totalStops}`);
    assert(it.summary.totalDistance === 5000, 'totalDistance falls back to the legacy field');
    assert(it.summary.totalVisitTime === 63, `totalVisitTime should sum visits, got ${it.summary.totalVisitTime}`);
    assert(it.stops[1].arrivalTime instanceof Date, 'arrivalTime is revived to a Date');
    assert(it.stops[0].stopNumber === 1 && it.stops[2].stopNumber === 3, 'stopNumber is filled in');
    assert(it.isRoundTrip === true, 'No end stop means round trip');
    assert(it.origin.lat === 0 && it.origin.lng === 0, 'Origin falls back to the first stop');
}

export async function testReviveSavedItineraryUsesStoredSummaryAndLegs() {
    const saved = {
        name: 'New trip',
        stops: [
            { type: 'start', name: 'Start', lat: 0, lng: 0 },
            { type: 'hotspot', name: 'A', lat: 1, lng: 1, speciesCount: 10, suggestedVisitTime: 31 },
            { type: 'end', name: 'End', lat: 3, lng: 3 }
        ],
        legs: [{ distance: 1000, duration: 600 }, { distance: 2000, duration: 900 }],
        summary: { totalStops: 1, totalDistance: 3000, totalTravelTime: 25, totalVisitTime: 31, totalTripTime: 56,
            estimatedEndTime: '2026-09-04T15:00:00.000Z' },
        origin: { lat: 0, lng: 0, address: 'Hotel' },
        isRoundTrip: false
    };
    const it = reviveSavedItinerary(saved);
    assert(it.legs.length === 2 && it.legs[1].duration === 900, 'Stored legs are used');
    assert(it.summary.totalTripTime === 56, 'Stored summary is used');
    assert(it.summary.estimatedEndTime instanceof Date, 'estimatedEndTime is revived');
    assert(it.isRoundTrip === false, 'Stored isRoundTrip wins');
    assert(it.origin.address === 'Hotel', 'Stored origin wins');
}
