import { assert } from '../run-tests.js';
import { selectHotspots, canShowGenericItineraryButton } from '../../js/services/itinerary-builder.js';

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
