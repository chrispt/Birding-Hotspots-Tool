/**
 * Reverse geocoding module - Convert coordinates to addresses
 * Uses LocationIQ REST API for geocoding
 */
import { CONFIG } from '../utils/constants.js';
import { storage } from '../services/storage.js';

// In-memory cache for reverse geocoding results for the current session.
// Keyed by 'lat,lng' string to avoid repeated API calls for the same coordinates.
const reverseGeocodeCache = new Map();

/**
 * Get the LocationIQ API key from storage, falling back to CONFIG
 * @returns {string} The API key (empty string if not configured)
 */
function getLocationIQKey() {
    return storage.getLocationIQKey() || CONFIG.LOCATIONIQ_API_KEY || '';
}

/**
 * Helper to build a stable cache key from coordinates.
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
function getCacheKey(lat, lng) {
    // Use fixed precision to avoid tiny floating point differences
    return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Reverse geocode coordinates to an address using LocationIQ API
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} Object with address information
 */
export async function reverseGeocode(lat, lng) {
    const cacheKey = getCacheKey(lat, lng);
    if (reverseGeocodeCache.has(cacheKey)) {
        return reverseGeocodeCache.get(cacheKey);
    }

    const fallback = {
        displayName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        address: 'Address unavailable',
        raw: null
    };

    const params = new URLSearchParams({
        key: getLocationIQKey(),
        lat: lat.toString(),
        lon: lng.toString(),
        format: 'json'
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.GEOCODE_TIMEOUT);

    try {
        const response = await fetch(
            `${CONFIG.LOCATIONIQ_BASE}/reverse?${params}`,
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`Reverse geocoding failed with status: ${response.status}`);
            return fallback;
        }

        const data = await response.json();

        if (!data || !data.display_name) {
            reverseGeocodeCache.set(cacheKey, fallback);
            return fallback;
        }

        const result = {
            displayName: data.display_name,
            address: formatNavigationAddress(data.address),
            raw: data.address
        };
        reverseGeocodeCache.set(cacheKey, result);
        return result;

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.warn('Reverse geocoding timed out');
        } else {
            console.warn('Reverse geocoding failed:', error);
        }
        reverseGeocodeCache.set(cacheKey, fallback);
        return fallback;
    }
}

/**
 * Internal helper to run async tasks with a concurrency limit and optional
 * minimum delay between task starts. This allows us to respect provider
 * rate limits while still achieving some parallelism.
 *
 * @param {Array<Function>} tasks - Array of functions that return Promises
 * @param {number} maxConcurrent - Maximum number of concurrent tasks
 * @param {number} minIntervalMs - Minimum delay between starting tasks
 * @returns {Promise<Array>} Resolved task results in the same order
 */
async function runWithConcurrencyLimit(tasks, maxConcurrent, minIntervalMs) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return [];
    }

    const results = new Array(tasks.length);
    let nextIndex = 0;
    let inFlight = 0;

    return new Promise((resolve, reject) => {
        const startNext = () => {
            // If all tasks have been scheduled and completed, resolve.
            if (nextIndex >= tasks.length && inFlight === 0) {
                resolve(results);
                return;
            }

            // Start new tasks while under concurrency limit.
            while (inFlight < maxConcurrent && nextIndex < tasks.length) {
                const currentIndex = nextIndex++;
                const task = tasks[currentIndex];
                inFlight++;

                // Enforce spacing between task starts.
                setTimeout(() => {
                    Promise.resolve()
                        .then(() => task())
                        .then((value) => {
                            results[currentIndex] = value;
                            inFlight--;
                            startNext();
                        })
                        .catch((error) => {
                            // Fail fast on error.
                            reject(error);
                        });
                }, currentIndex === 0 ? 0 : minIntervalMs);
            }
        };

        startNext();
    });
}

/**
 * Batch reverse geocode multiple locations with rate-limited concurrency.
 * Note: Rate limited to 2 req/sec on free tier, so we enforce both
 * a concurrency limit and minimum spacing between request starts.
 * @param {Array} locations - Array of {lat, lng} objects
 * @param {Function} onProgress - Progress callback (current, total)
 * @returns {Promise<Array>} Array of address results
 */
export async function batchReverseGeocode(locations, onProgress) {
    if (!Array.isArray(locations) || locations.length === 0) {
        return [];
    }

    const RATE_LIMIT_DELAY = 500; // 2 req/sec = 500ms between request starts
    const MAX_CONCURRENT = 2; // Align with rate limit for safety

    const total = locations.length;
    let completed = 0;

    const tasks = locations.map((loc) => async () => {
        const result = await reverseGeocode(loc.lat, loc.lng);
        completed++;
        if (onProgress) {
            onProgress(completed, total);
        }
        return result;
    });

    return runWithConcurrencyLimit(tasks, MAX_CONCURRENT, RATE_LIMIT_DELAY);
}

/**
 * Format address for GPS navigation use
 * @param {Object} addressObj - LocationIQ address object
 * @returns {string} Navigation-friendly address
 */
function formatNavigationAddress(addressObj) {
    if (!addressObj) {
        return 'Address unavailable';
    }

    const parts = [];

    // Street address
    if (addressObj.house_number && addressObj.road) {
        parts.push(`${addressObj.house_number} ${addressObj.road}`);
    } else if (addressObj.road) {
        parts.push(addressObj.road);
    } else if (addressObj.neighbourhood) {
        parts.push(addressObj.neighbourhood);
    }

    // City/Town
    const city = addressObj.city || addressObj.town || addressObj.village || addressObj.county;
    if (city) {
        parts.push(city);
    }

    // State/Province
    if (addressObj.state) {
        parts.push(addressObj.state);
    }

    // Postal code (useful for navigation)
    if (addressObj.postcode) {
        parts.push(addressObj.postcode);
    }

    // Country (only if nothing else is available)
    if (parts.length === 0 && addressObj.country) {
        parts.push(addressObj.country);
    }

    return parts.length > 0 ? parts.join(', ') : 'Address unavailable';
}
