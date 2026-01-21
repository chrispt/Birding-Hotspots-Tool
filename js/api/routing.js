/**
 * Routing API service using OSRM (Open Source Routing Machine)
 * Fetches driving distances and durations between coordinates
 */

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';
const OSRM_TRIP_URL = 'https://router.project-osrm.org/trip/v1/driving';

/**
 * Get driving route information between two points
 * @param {number} originLat - Origin latitude
 * @param {number} originLng - Origin longitude
 * @param {number} destLat - Destination latitude
 * @param {number} destLng - Destination longitude
 * @returns {Promise<{distance: number, duration: number}|null>} Distance in km, duration in seconds, or null if failed
 */
export async function getDrivingRoute(originLat, originLng, destLat, destLng) {
    try {
        // OSRM expects coordinates as lng,lat
        const url = `${OSRM_BASE_URL}/${originLng},${originLat};${destLng},${destLat}?overview=false`;

        const response = await fetch(url);

        if (!response.ok) {
            return null;
        }

        const data = await response.json();

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            return null;
        }

        const route = data.routes[0];
        return {
            distance: route.distance / 1000, // Convert meters to km
            duration: route.duration // Already in seconds
        };
    } catch (error) {
        console.warn('Routing API error:', error.message);
        return null;
    }
}

/**
 * Get driving routes for multiple destinations from a single origin
 * @param {number} originLat - Origin latitude
 * @param {number} originLng - Origin longitude
 * @param {Array<{lat: number, lng: number}>} destinations - Array of destination coordinates
 * @returns {Promise<Array<{distance: number, duration: number}|null>>} Array of route info or null for failed routes
 */
export async function getDrivingRoutes(originLat, originLng, destinations) {
    // Fetch routes in parallel with small batches to avoid overwhelming the API
    const BATCH_SIZE = 5;
    const results = [];

    for (let i = 0; i < destinations.length; i += BATCH_SIZE) {
        const batch = destinations.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(dest =>
            getDrivingRoute(originLat, originLng, dest.lat, dest.lng)
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Small delay between batches to be respectful to the free API
        if (i + BATCH_SIZE < destinations.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return results;
}

/**
 * Get optimized trip route through multiple waypoints using OSRM Trip service
 * This solves the traveling salesman problem to find the optimal order
 * @param {Array<{lat: number, lng: number, name?: string}>} waypoints - Array of waypoint coordinates
 * @param {Object} options - Options for the trip
 * @param {boolean} options.roundtrip - Whether to return to start (default: false)
 * @param {string} options.source - 'first' to fix first waypoint (default: 'first')
 * @param {string} options.destination - 'last' to fix last waypoint (default: 'last')
 * @returns {Promise<Object|null>} Optimized trip data or null if failed
 */
export async function getOptimizedTrip(waypoints, options = {}) {
    if (!waypoints || waypoints.length < 2) {
        return null;
    }

    const {
        roundtrip = false,
        source = 'first',
        destination = 'last'
    } = options;

    try {
        // Build coordinates string (lng,lat format for OSRM)
        const coordsStr = waypoints
            .map(wp => `${wp.lng},${wp.lat}`)
            .join(';');

        const params = new URLSearchParams({
            roundtrip: roundtrip.toString(),
            source,
            destination,
            geometries: 'geojson',
            overview: 'full',
            annotations: 'duration,distance'
        });

        const url = `${OSRM_TRIP_URL}/${coordsStr}?${params}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.warn('OSRM Trip API error:', response.status);
            return null;
        }

        const data = await response.json();

        if (data.code !== 'Ok' || !data.trips || data.trips.length === 0) {
            console.warn('OSRM Trip response error:', data.code);
            return null;
        }

        const trip = data.trips[0];
        const orderedWaypoints = data.waypoints;

        // Build result with optimized order
        const optimizedStops = orderedWaypoints.map((wp, index) => {
            const originalWp = waypoints[wp.waypoint_index];
            return {
                ...originalWp,
                optimizedOrder: index,
                originalIndex: wp.waypoint_index,
                snappedLocation: {
                    lat: wp.location[1],
                    lng: wp.location[0]
                }
            };
        });

        // Calculate leg-by-leg details
        const legs = trip.legs.map((leg, index) => ({
            fromIndex: index,
            toIndex: index + 1,
            distance: leg.distance / 1000, // meters to km
            duration: leg.duration // seconds
        }));

        return {
            totalDistance: trip.distance / 1000, // meters to km
            totalDuration: trip.duration, // seconds
            stops: optimizedStops,
            legs,
            geometry: trip.geometry // GeoJSON LineString
        };
    } catch (error) {
        console.warn('OSRM Trip API error:', error.message);
        return null;
    }
}

/**
 * Get a simple route through waypoints in order (not optimized)
 * @param {Array<{lat: number, lng: number}>} waypoints - Array of waypoint coordinates
 * @returns {Promise<Object|null>} Route data or null if failed
 */
export async function getRouteThrough(waypoints) {
    if (!waypoints || waypoints.length < 2) {
        return null;
    }

    try {
        // Build coordinates string (lng,lat format for OSRM)
        const coordsStr = waypoints
            .map(wp => `${wp.lng},${wp.lat}`)
            .join(';');

        const url = `${OSRM_BASE_URL}/${coordsStr}?overview=full&geometries=geojson&annotations=duration,distance`;
        const response = await fetch(url);

        if (!response.ok) {
            return null;
        }

        const data = await response.json();

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            return null;
        }

        const route = data.routes[0];

        const legs = route.legs.map((leg, index) => ({
            fromIndex: index,
            toIndex: index + 1,
            distance: leg.distance / 1000, // meters to km
            duration: leg.duration // seconds
        }));

        return {
            totalDistance: route.distance / 1000,
            totalDuration: route.duration,
            legs,
            geometry: route.geometry
        };
    } catch (error) {
        console.warn('Routing API error:', error.message);
        return null;
    }
}
