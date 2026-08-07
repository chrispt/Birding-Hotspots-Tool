import { assert } from '../run-tests.js';
import { generateGPX, generateHotspotsGPX } from '../../js/services/gpx-generator.js';

function sampleItinerary() {
    return {
        stops: [
            { type: 'start', name: 'Start', address: '123 Main St', lat: 10, lng: 20 },
            { type: 'hotspot', name: 'Marsh Overlook', speciesCount: 42, lat: 11, lng: 21 },
            { type: 'end', name: 'End', address: '456 Oak Ave', lat: 12, lng: 22 }
        ],
        geometry: { coordinates: [[20, 10], [21, 11], [22, 12]] }
    };
}

export async function testGenerateGPXIncludesWaypointsRouteAndTrack() {
    const gpx = generateGPX(sampleItinerary());

    assert(gpx.includes('<wpt lat="10" lon="20">'), 'Should include a waypoint for the start stop');
    assert(gpx.includes('<rte>'), 'Should include a <rte> route element');
    assert(gpx.includes('<trk>'), 'Should include a <trk> track element when geometry is present');
    assert((gpx.match(/<wpt /g) || []).length === 3, 'Should include one waypoint per stop');
}

export async function testGenerateGPXOmitsTrackWithoutGeometry() {
    const itinerary = { stops: sampleItinerary().stops };
    const gpx = generateGPX(itinerary);
    assert(!gpx.includes('<trk>'), 'Should omit <trk> when no route geometry is available');
}

export async function testGenerateHotspotsGPXOmitsRouteAndTrack() {
    const hotspots = [
        { locId: 'a', name: 'Lakeside Park', speciesCount: 30, lat: 1, lng: 2 },
        { locId: 'b', name: 'Forest Trail', speciesCount: 18, lat: 3, lng: 4 }
    ];

    const gpx = generateHotspotsGPX({ lat: 0, lng: 0, address: 'Home' }, hotspots);

    assert(!gpx.includes('<rte>'), 'A plain hotspot list has no defined order, so <rte> should be omitted');
    assert(!gpx.includes('<trk>'), 'A plain hotspot list has no route geometry, so <trk> should be omitted');
    assert(gpx.includes('Lakeside Park'), 'Should include the first hotspot name');
    assert(gpx.includes('Forest Trail'), 'Should include the second hotspot name');
}

export async function testGenerateHotspotsGPXIncludesOriginWaypointWhenProvided() {
    const gpx = generateHotspotsGPX({ lat: 5, lng: 6, address: 'My House' }, []);
    assert(gpx.includes('<wpt lat="5" lon="6">'), 'Should include a waypoint for the search origin');
    assert(gpx.includes('My House'), 'Should include the origin address in the waypoint description');
}

export async function testGenerateHotspotsGPXSkipsOriginWaypointWhenMissing() {
    const hotspots = [{ locId: 'a', name: 'Lakeside Park', speciesCount: 30, lat: 1, lng: 2 }];
    const gpx = generateHotspotsGPX(null, hotspots);
    assert((gpx.match(/<wpt /g) || []).length === 1, 'Should only include one waypoint (the hotspot) when origin is omitted');
}

export async function testGenerateHotspotsGPXEscapesXmlSpecialCharacters() {
    const hotspots = [{ locId: 'a', name: 'Tom & Jerry\'s <Reserve>', speciesCount: 5, lat: 1, lng: 2 }];
    const gpx = generateHotspotsGPX(null, hotspots);
    assert(!gpx.includes('<Reserve>'), 'Special characters in hotspot names must be XML-escaped');
    assert(gpx.includes('&amp;'), 'Ampersands must be escaped as &amp;');
}
