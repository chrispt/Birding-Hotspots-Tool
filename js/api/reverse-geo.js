/**
 * Reverse geocoding module - Convert coordinates to addresses
 * Uses LocationIQ REST API for geocoding
 */
import { CONFIG } from '../utils/constants.js';

// In-memory cache for reverse geocoding results for the current session.
// Keyed by 'lat,lng' string to avoid repeated API calls for the same coordinates.
const reverseGeocodeCache = new Map();

// localStorage key for the persisted reverse-geocode cache
const STORAGE_KEY = 'birding_rgeo_cache';
// Maximum number of entries to persist (prevents unbounded localStorage growth)
const MAX_PERSISTED_ENTRIES = 200;

/**
 * Load the persisted cache from localStorage into the in-memory Map on startup.
 * Uses 4-decimal-place keys (~11m precision) for cross-session matching.
 */
function loadPersistedCache() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const stored = JSON.parse(raw);
        for (const [key, value] of Object.entries(stored)) {
            reverseGeocodeCache.set(key, value);
        }
    } catch (_) {
        // Corrupt or unavailable — just start fresh
    }
}

/**
 * Persist an entry to localStorage. Uses the same 4-decimal-place key.
 * Evicts the oldest entry when the cap is reached.
 * @param {string} key
 * @param {Object} value
 */
function persistCacheEntry(key, value) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const stored = raw ? JSON.parse(raw) : {};
        const keys = Object.keys(stored);
        if (keys.length >= MAX_PERSISTED_ENTRIES) {
            // Evict the first (oldest) entry
            delete stored[keys[0]];
        }
        stored[key] = value;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (_) {
        // Storage full or unavailable — skip persistence, in-memory cache still works
    }
}

/**
 * Helper to build a stable cache key from coordinates.
 * Uses 4 decimal places (~11m precision) to maximise cross-session cache hits
 * while keeping distinct enough for practical birding use.
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
function getCacheKey(lat, lng) {
    return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

// Populate in-memory cache from localStorage on module load
loadPersistedCache();

/**
 * Reverse geocode coordinates to an address using LocationIQ API
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {AbortSignal} [signal] - Optional external abort signal (e.g. search cancel)
 * @returns {Promise<Object>} Object with address information
 */
export async function reverseGeocode(lat, lng, signal) {
    const cacheKey = getCacheKey(lat, lng);
    if (reverseGeocodeCache.has(cacheKey)) {
        return reverseGeocodeCache.get(cacheKey);
    }

    const fallback = {
        displayName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        address: 'Address unavailable',
        raw: null
    };

    // Bail early if the search was already cancelled
    if (signal?.aborted) return fallback;

    const params = new URLSearchParams({
        key: CONFIG.LOCATIONIQ_API_KEY,
        lat: lat.toString(),
        lon: lng.toString(),
        format: 'json'
    });

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), CONFIG.GEOCODE_TIMEOUT);

    // Combine the internal timeout with any external cancel signal
    const fetchSignal = (signal && typeof AbortSignal.any === 'function')
        ? AbortSignal.any([timeoutController.signal, signal])
        : timeoutController.signal;

    try {
        const response = await fetch(
            `${CONFIG.LOCATIONIQ_BASE}/reverse?${params}`,
            { signal: fetchSignal }
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`Reverse geocoding failed with status: ${response.status}`);
            return fallback;
        }

        const data = await response.json();

        if (!data || !data.display_name) {
            reverseGeocodeCache.set(cacheKey, fallback);
            persistCacheEntry(cacheKey, fallback);
            return fallback;
        }

        const result = {
            displayName: data.display_name,
            address: formatNavigationAddress(data.address),
            raw: data.address
        };
        reverseGeocodeCache.set(cacheKey, result);
        persistCacheEntry(cacheKey, result);
        return result;

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            if (signal?.aborted) {
                // External cancel — don't cache the fallback; let it retry on next search
                return fallback;
            }
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
 * @param {AbortSignal} [signal] - Optional external abort signal
 * @returns {Promise<Array>} Array of address results
 */
export async function batchReverseGeocode(locations, onProgress, signal) {
    if (!Array.isArray(locations) || locations.length === 0) {
        return [];
    }

    const RATE_LIMIT_DELAY = 500; // 2 req/sec = 500ms between request starts
    const MAX_CONCURRENT = 2; // Align with rate limit for safety

    const total = locations.length;
    let completed = 0;

    const fallbackResult = (loc) => ({
        displayName: `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`,
        address: 'Address unavailable',
        raw: null
    });

    const tasks = locations.map((loc) => async () => {
        // Skip remaining requests if the search was cancelled
        if (signal?.aborted) return fallbackResult(loc);
        const result = await reverseGeocode(loc.lat, loc.lng, signal);
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
