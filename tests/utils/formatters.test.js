import { assert } from '../run-tests.js';
import { formatDate, formatDistance, formatDuration, calculateDistance, sampleRoutePoints, distanceToRouteLine } from '../../js/utils/formatters.js';

export async function testFormatDateReturnsHumanReadableString() {
    // 2024-06-15 (mid-year, unambiguous)
    const result = formatDate('2024-06-15');
    assert(typeof result === 'string', 'formatDate should return a string');
    assert(result.length > 0, 'formatDate should return non-empty string');
    // Should contain the year
    assert(result.includes('2024'), `Expected '2024' in "${result}"`);
    // Should contain the month abbreviation
    assert(result.includes('Jun'), `Expected 'Jun' in "${result}"`);
}

export async function testFormatDateIsConsistentAcrossRepeatCalls() {
    // The hoisted Intl.DateTimeFormat instance should produce identical output
    // across multiple calls — verifies the singleton re-use doesn't corrupt state.
    const date = '2025-12-25';
    const first = formatDate(date);
    const second = formatDate(date);
    const third = formatDate(date);
    assert(first === second, 'Repeated calls should produce identical output');
    assert(second === third, 'Repeated calls should produce identical output');
}

export async function testFormatDateHandlesDateObject() {
    const d = new Date('2023-03-01T12:00:00Z');
    const result = formatDate(d);
    assert(typeof result === 'string' && result.length > 0, 'Should accept Date objects');
}

export async function testFormatDistanceMiles() {
    const result = formatDistance(1.6093); // ~1 mile
    assert(result.includes('mi') || result.includes('ft'), 'Should format in miles');
}

export async function testFormatDurationHoursMinutes() {
    const result = formatDuration(3661); // 1 hr 1 min
    assert(result.includes('hr'), 'Should include hours unit');
    assert(result.includes('min') || result.includes('1'), 'Should include minutes');
}

export async function testCalculateDistanceKnownPoints() {
    // Roughly 1 degree of latitude ~ 111 km
    const dist = calculateDistance(40, -75, 41, -75);
    assert(dist > 105 && dist < 115, `Expected ~111km, got ${dist}`);
}

export async function testCalculateDistanceSamePointIsZero() {
    const dist = calculateDistance(40, -75, 40, -75);
    assert(dist === 0, `Expected 0, got ${dist}`);
}

export async function testSampleRoutePointsAlwaysIncludesStartAndEnd() {
    // A straight ~100km north-south line, [lng, lat] pairs per OSRM GeoJSON order
    const coords = [[-75, 40], [-75, 40.45], [-75, 40.9]];
    const points = sampleRoutePoints(coords, 25);

    assert(points[0].lat === 40 && points[0].lng === -75, 'First point should be route start');
    const last = points[points.length - 1];
    assert(last.lat === 40.9 && last.lng === -75, 'Last point should be route end');
    assert(points.length >= 3, `Expected multiple sample points for a ~100km route, got ${points.length}`);
}

export async function testSampleRoutePointsHandlesShortRouteWithoutDuplicatingEnd() {
    const coords = [[-75, 40], [-75, 40.01]];
    const points = sampleRoutePoints(coords, 500); // interval far longer than route
    assert(points.length === 2, `Expected exactly start+end, got ${points.length}`);
}

export async function testDistanceToRouteLineIsZeroOnTheLine() {
    // Point exactly on a north-south segment
    const routeCoords = [[-75, 40], [-75, 41]];
    const dist = distanceToRouteLine(40.5, -75, routeCoords);
    assert(dist < 0.01, `Expected ~0km for a point on the line, got ${dist}`);
}

export async function testDistanceToRouteLineMeasuresPerpendicularOffset() {
    const routeCoords = [[-75, 40], [-75, 41]];
    // ~1 degree of longitude at 40.5N is roughly 84.5km; use a small known offset instead
    const offsetPoint = { lat: 40.5, lng: -75 + 0.1 };
    const dist = distanceToRouteLine(offsetPoint.lat, offsetPoint.lng, routeCoords);
    const directDist = calculateDistance(40.5, -75, offsetPoint.lat, offsetPoint.lng);
    assert(Math.abs(dist - directDist) < 0.5, `Expected perpendicular distance ~${directDist}, got ${dist}`);
}

export async function testDistanceToRouteLineUsesNearestEndpointBeyondSegment() {
    const routeCoords = [[-75, 40], [-75, 41]];
    // Point far north of the route's end, off to the side
    const point = { lat: 42, lng: -74.9 };
    const dist = distanceToRouteLine(point.lat, point.lng, routeCoords);
    const distToEnd = calculateDistance(41, -75, point.lat, point.lng);
    assert(Math.abs(dist - distToEnd) < 0.01, `Expected distance to nearest endpoint (~${distToEnd}), got ${dist}`);
}
