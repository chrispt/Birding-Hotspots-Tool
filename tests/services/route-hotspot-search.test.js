import { assert } from '../run-tests.js';
import {
    buildRouteSamplePoints,
    dedupeHotspotsById,
    filterHotspotsByRouteDistance,
    rankHotspotsForEnrichment,
    sortEnrichedRouteHotspots
} from '../../js/services/route-hotspot-search.js';

// Helper: build a straight north-south route of `lengthKm` starting at (40, -75),
// with vertices every ~5km — real OSRM polylines have many vertices, and
// sampleRoutePoints only ever emits existing vertices (no interpolation), so a
// bare 2-point route can't be meaningfully subdivided by the sampler.
function straightRoute(lengthKm, stepKm = 5) {
    const totalDegreesLat = lengthKm / 111; // ~111km per degree of latitude
    const steps = Math.max(2, Math.ceil(lengthKm / stepKm) + 1);
    const coords = [];
    for (let i = 0; i < steps; i++) {
        const frac = i / (steps - 1);
        coords.push([-75, 40 + totalDegreesLat * frac]);
    }
    return coords;
}

export async function testBuildRouteSamplePointsFullCoverageForModerateRoute() {
    const routeCoords = straightRoute(150);
    const { points, isPartialCoverage } = buildRouteSamplePoints(routeCoords, 150, 8, 70);

    assert(isPartialCoverage === false, 'A 150km route should get full guaranteed coverage');
    assert(points.length <= 8, `Expected at most 8 points, got ${points.length}`);
    assert(points[0].lat === 40, 'First point should be route start');
}

export async function testBuildRouteSamplePointsCapsPointsForVeryLongRoute() {
    const routeCoords = straightRoute(2000);
    const { points } = buildRouteSamplePoints(routeCoords, 2000, 8, 70);

    assert(points.length <= 8, `Expected point count capped at 8, got ${points.length}`);
    assert(points[0].lat === 40, 'First point should equal route start');
    const last = points[points.length - 1];
    const expectedEndLat = 40 + 2000 / 111;
    assert(Math.abs(last.lat - expectedEndLat) < 0.01, 'Last point should equal route end');
}

export async function testBuildRouteSamplePointsFlagsPartialCoverageBeyondSafeBound() {
    // Force many more naive points than the cap, so effective interval widens
    // past the ~87.7km safe bound (2*sqrt(50^2 - 24^2))
    const routeCoords = straightRoute(2000);
    const { isPartialCoverage } = buildRouteSamplePoints(routeCoords, 2000, 8, 70);

    assert(isPartialCoverage === true, 'A 2000km route with only 8 sample points should flag partial coverage');
}

export async function testBuildRouteSamplePointsNoPartialCoverageWithinSafeBound() {
    // 400km route with 8 points -> naivePoints = ceil(400/70)+1 = 7 <= 8, full coverage path
    const routeCoords = straightRoute(400);
    const { isPartialCoverage } = buildRouteSamplePoints(routeCoords, 400, 8, 70);

    assert(isPartialCoverage === false, 'A 400km route should still get full guaranteed coverage with 8 points');
}

export async function testDedupeHotspotsByIdMergesAcrossSamplePoints() {
    const fromPointA = [{ locId: 'L1', locName: 'A' }, { locId: 'L2', locName: 'B' }];
    const fromPointB = [{ locId: 'L2', locName: 'B-duplicate' }, { locId: 'L3', locName: 'C' }];

    const merged = dedupeHotspotsById([fromPointA, fromPointB]);
    const ids = merged.map(h => h.locId).sort();

    assert(merged.length === 3, `Expected 3 unique hotspots, got ${merged.length}`);
    assert(ids.join(',') === 'L1,L2,L3', `Unexpected ids: ${ids.join(',')}`);
    // First-seen wins
    assert(merged.find(h => h.locId === 'L2').locName === 'B', 'First-seen hotspot data should win on duplicate');
}

export async function testFilterHotspotsByRouteDistanceUsesPolylineNotEllipse() {
    // An L-shaped (bent) route: north from (40,-75) to (41,-75), then east to (41,-74)
    const routeCoords = [[-75, 40], [-75, 41], [-74, 41]];

    // This hotspot sits close to the actual bent path (near the corner, offset east)
    // but far from the straight line between the true endpoints (40,-75) -> (41,-74),
    // which the old ellipse approximation used as its implicit reference.
    const nearBendHotspot = { locId: 'bend', lat: 41, lng: -74.5 };

    const filtered = filterHotspotsByRouteDistance([nearBendHotspot], routeCoords, 20);

    assert(filtered.length === 1, 'Hotspot near the bend of the actual route should be kept');
    assert(filtered[0].distance < 20, `Expected distance under 20km, got ${filtered[0].distance}`);

    // A hotspot far from every segment of the actual polyline should be excluded
    const farHotspot = { locId: 'far', lat: 45, lng: -80 };
    const filteredOut = filterHotspotsByRouteDistance([farHotspot], routeCoords, 20);
    assert(filteredOut.length === 0, 'Hotspot far from the route polyline should be excluded');
}

export async function testRankHotspotsForEnrichmentPrefersHigherAllTimeSpeciesCount() {
    const hotspots = [
        { locId: 'low', numSpeciesAllTime: 50, distance: 1 },
        { locId: 'high', numSpeciesAllTime: 300, distance: 5 },
        { locId: 'mid', numSpeciesAllTime: 150, distance: 2 }
    ];

    const ranked = rankHotspotsForEnrichment(hotspots, 2);

    assert(ranked.length === 2, `Expected 2 hotspots, got ${ranked.length}`);
    assert(ranked[0].locId === 'high', 'Richest hotspot by numSpeciesAllTime should rank first');
    assert(ranked[1].locId === 'mid', 'Second-richest hotspot should be kept over the low one');
}

export async function testRankHotspotsForEnrichmentTreatsMissingCountAsZero() {
    const hotspots = [
        { locId: 'unknown', distance: 1 },
        { locId: 'known', numSpeciesAllTime: 10, distance: 1 }
    ];

    const ranked = rankHotspotsForEnrichment(hotspots, 2);
    assert(ranked[0].locId === 'known', 'A hotspot with a known species count should outrank one with none');
}

export async function testSortEnrichedRouteHotspotsOrdersBySpeciesCountDescending() {
    const hotspots = [
        { locId: 'a', speciesCount: 10, distance: 1 },
        { locId: 'b', speciesCount: 40, distance: 3 },
        { locId: 'c', speciesCount: 25, distance: 2 }
    ];

    const sorted = sortEnrichedRouteHotspots(hotspots);
    assert(sorted.map(h => h.locId).join(',') === 'b,c,a', `Unexpected order: ${sorted.map(h => h.locId).join(',')}`);
    // Original array should not be mutated
    assert(hotspots[0].locId === 'a', 'sortEnrichedRouteHotspots should not mutate the input array');
}

export async function testSortEnrichedRouteHotspotsBreaksTiesByDistance() {
    const hotspots = [
        { locId: 'far', speciesCount: 20, distance: 10 },
        { locId: 'near', speciesCount: 20, distance: 2 }
    ];

    const sorted = sortEnrichedRouteHotspots(hotspots);
    assert(sorted[0].locId === 'near', 'On a species-count tie, the closer hotspot should rank first');
}
