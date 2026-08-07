/**
 * Route Hotspot Search Service
 * Finds birding hotspots along a driving route by sampling multiple points
 * along the route polyline (rather than a single circle from the midpoint),
 * so coverage doesn't depend on how long the route is.
 */

import { distanceToRouteLine, sampleRoutePoints } from '../utils/formatters.js';

/**
 * Build sample points along a route, adapting spacing/count to route length.
 * Always includes the route's actual start and end points so coverage near
 * the endpoints doesn't depend on route length.
 * @param {Array} routeCoords - Route coordinates [[lng, lat], ...] (OSRM GeoJSON order)
 * @param {number} routeDistanceKm - Total route distance in km
 * @param {number} maxPoints - Maximum number of sample points (caps eBird API calls)
 * @param {number} targetIntervalKm - Desired spacing between sample points
 * @returns {{points: Array<{lat:number,lng:number}>, isPartialCoverage: boolean}}
 */
export function buildRouteSamplePoints(routeCoords, routeDistanceKm, maxPoints, targetIntervalKm) {
    const naivePoints = Math.ceil(routeDistanceKm / targetIntervalKm) + 1;

    if (naivePoints <= maxPoints) {
        return {
            points: sampleRoutePoints(routeCoords, targetIntervalKm),
            isPartialCoverage: false
        };
    }

    // Route is long enough that the target interval would need more than
    // maxPoints samples - spread maxPoints evenly across the whole route instead.
    const effectiveIntervalKm = routeDistanceKm / (maxPoints - 1);
    const points = sampleRoutePoints(routeCoords, effectiveIntervalKm);

    // Bound below which two adjacent 50km-radius circles are guaranteed to
    // jointly cover any point within MAX_DETOUR_SAFE_KM of the route line.
    const HOTSPOT_RADIUS_KM = 50;
    const MAX_DETOUR_SAFE_KM = 24;
    const safeIntervalBoundKm = 2 * Math.sqrt(
        HOTSPOT_RADIUS_KM * HOTSPOT_RADIUS_KM - MAX_DETOUR_SAFE_KM * MAX_DETOUR_SAFE_KM
    );

    return {
        points,
        isPartialCoverage: effectiveIntervalKm > safeIntervalBoundKm
    };
}

/**
 * Merge hotspot arrays from multiple sample points, deduping by locId.
 * @param {Array<Array>} hotspotArrays - One eBird hotspot array per sample point
 * @returns {Array} Deduped, flattened hotspot array
 */
export function dedupeHotspotsById(hotspotArrays) {
    const seen = new Map();
    for (const hotspots of hotspotArrays) {
        for (const hotspot of hotspots) {
            if (!seen.has(hotspot.locId)) {
                seen.set(hotspot.locId, hotspot);
            }
        }
    }
    return [...seen.values()];
}

/**
 * Filter hotspots to those within maxDetourKm of the actual route polyline,
 * attaching the computed distance to each surviving hotspot.
 * @param {Array} hotspots - Candidate hotspots with lat/lng
 * @param {Array} routeCoords - Route coordinates [[lng, lat], ...]
 * @param {number} maxDetourKm - Maximum allowed distance from the route line
 * @returns {Array} Filtered hotspots, each with a `.distance` field (km)
 */
export function filterHotspotsByRouteDistance(hotspots, routeCoords, maxDetourKm) {
    return hotspots
        .map(h => ({ ...h, distance: distanceToRouteLine(h.lat, h.lng, routeCoords) }))
        .filter(h => h.distance <= maxDetourKm);
}

/**
 * Rank hotspots before the expensive per-hotspot enrichment call, so the
 * ones chosen for enrichment are the most promising rather than whatever
 * order the eBird API happened to return. Hotspots known to have a
 * target-species sighting are ranked first so they survive the cap even
 * when their historical species count is low.
 * @param {Array} hotspots - Hotspots with `.distance` and optional `numSpeciesAllTime`
 * @param {number} maxCount - Number of hotspots to keep
 * @param {Set<string>} [targetLocIds] - locIds known to have a target species sighting
 * @returns {Array} Top-ranked hotspots, capped to maxCount
 */
export function rankHotspotsForEnrichment(hotspots, maxCount, targetLocIds = new Set()) {
    const ranked = [...hotspots].sort((a, b) => {
        const aTarget = targetLocIds.has(a.locId);
        const bTarget = targetLocIds.has(b.locId);
        if (aTarget !== bTarget) return aTarget ? -1 : 1;

        const speciesDiff = (b.numSpeciesAllTime ?? 0) - (a.numSpeciesAllTime ?? 0);
        if (speciesDiff !== 0) return speciesDiff;
        return a.distance - b.distance;
    });
    return ranked.slice(0, maxCount);
}

/**
 * Final sort of enriched route hotspots for display: hotspots with a target
 * species first, then (optionally) hotspots with a potential lifer, then
 * richest observed species count, with closest-to-route as tiebreak.
 * @param {Array} hotspots - Enriched hotspots with `.speciesCount`, `.distance`, and optional `.birds`
 * @param {Object} [options]
 * @param {Set<string>} [options.targetLocIds] - locIds known to have a target species sighting
 * @param {boolean} [options.boostLifers] - When true, hotspots with a potential lifer sort ahead of others
 * @returns {Array} Sorted hotspots (new array, does not mutate input)
 */
export function sortEnrichedRouteHotspots(hotspots, { targetLocIds = new Set(), boostLifers = false } = {}) {
    return [...hotspots].sort((a, b) => {
        const aTarget = targetLocIds.has(a.locId);
        const bTarget = targetLocIds.has(b.locId);
        if (aTarget !== bTarget) return aTarget ? -1 : 1;

        if (boostLifers) {
            const aLifer = (a.birds || []).some(bird => bird.isLifer) ? 1 : 0;
            const bLifer = (b.birds || []).some(bird => bird.isLifer) ? 1 : 0;
            if (aLifer !== bLifer) return bLifer - aLifer;
        }

        const speciesDiff = b.speciesCount - a.speciesCount;
        if (speciesDiff !== 0) return speciesDiff;
        return a.distance - b.distance;
    });
}
