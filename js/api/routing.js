/**
 * Routing API service using OSRM (Open Source Routing Machine)
 * Fetches driving distances and durations between coordinates
 */

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

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
