/**
 * Reverse geocoding module - Convert coordinates to addresses
 */
import { CONFIG, ErrorTypes, ErrorMessages } from '../utils/constants.js';

/**
 * Rate-limited request queue for Nominatim
 */
class RateLimitedQueue {
    constructor(minInterval) {
        this.minInterval = minInterval;
        this.lastCall = 0;
        this.queue = [];
        this.processing = false;
    }

    /**
     * Add a function to the queue and execute with rate limiting
     * @param {Function} fn - Async function to execute
     * @returns {Promise} Result of the function
     */
    async add(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;

        while (this.queue.length > 0) {
            const now = Date.now();
            const waitTime = Math.max(0, this.minInterval - (now - this.lastCall));

            if (waitTime > 0) {
                await new Promise(r => setTimeout(r, waitTime));
            }

            const { fn, resolve, reject } = this.queue.shift();
            this.lastCall = Date.now();

            try {
                const result = await fn();
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }

        this.processing = false;
    }
}

// Global queue instance for Nominatim requests
const nominatimQueue = new RateLimitedQueue(CONFIG.NOMINATIM_RATE_LIMIT);

/**
 * Reverse geocode coordinates to an address using Nominatim
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} Object with address information
 */
export async function reverseGeocode(lat, lng) {
    return nominatimQueue.add(async () => {
        const url = new URL(`${CONFIG.NOMINATIM_BASE}/reverse`);
        url.searchParams.set('lat', lat.toString());
        url.searchParams.set('lon', lng.toString());
        url.searchParams.set('format', 'json');
        url.searchParams.set('addressdetails', '1');

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': CONFIG.APP_USER_AGENT
                }
            });

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error(ErrorMessages[ErrorTypes.RATE_LIMITED]);
                }
                throw new Error('Reverse geocoding failed');
            }

            const data = await response.json();

            if (data.error) {
                return {
                    displayName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                    address: 'Address unavailable',
                    raw: null
                };
            }

            return {
                displayName: data.display_name,
                address: formatNavigationAddress(data.address),
                raw: data.address
            };
        } catch (error) {
            console.warn('Reverse geocoding error:', error);
            // Return a fallback with just coordinates
            return {
                displayName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                address: 'Address unavailable',
                raw: null
            };
        }
    });
}

/**
 * Batch reverse geocode multiple locations
 * Progress callback is called after each location is processed
 * @param {Array} locations - Array of {lat, lng} objects
 * @param {Function} onProgress - Progress callback (current, total)
 * @returns {Promise<Array>} Array of address results
 */
export async function batchReverseGeocode(locations, onProgress) {
    const results = [];

    for (let i = 0; i < locations.length; i++) {
        const loc = locations[i];
        const result = await reverseGeocode(loc.lat, loc.lng);
        results.push(result);

        if (onProgress) {
            onProgress(i + 1, locations.length);
        }
    }

    return results;
}

/**
 * Format address for GPS navigation use
 * @param {Object} address - Nominatim address object
 * @returns {string} Navigation-friendly address
 */
function formatNavigationAddress(address) {
    if (!address) return 'Address unavailable';

    const parts = [];

    // Street address
    if (address.house_number && address.road) {
        parts.push(`${address.house_number} ${address.road}`);
    } else if (address.road) {
        parts.push(address.road);
    } else if (address.hamlet || address.neighbourhood) {
        parts.push(address.hamlet || address.neighbourhood);
    }

    // City/Town
    const city = address.city || address.town || address.village || address.municipality;
    if (city) {
        parts.push(city);
    }

    // State/Province
    if (address.state) {
        parts.push(address.state);
    }

    // Postal code (useful for navigation)
    if (address.postcode) {
        parts.push(address.postcode);
    }

    // Country (only if nothing else is available or for international context)
    if (parts.length === 0 && address.country) {
        parts.push(address.country);
    }

    return parts.length > 0 ? parts.join(', ') : 'Address unavailable';
}
