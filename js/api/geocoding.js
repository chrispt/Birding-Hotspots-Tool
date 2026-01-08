/**
 * Geocoding module - Convert addresses to coordinates
 * Uses LocationIQ REST API for geocoding
 */
import { CONFIG, ErrorTypes, ErrorMessages } from '../utils/constants.js';

// Cache for geocoding results (session-level for performance)
const geocodeCache = new Map();

/**
 * Convert an address to coordinates using LocationIQ API
 * @param {string} address - The address to geocode
 * @returns {Promise<Object>} Object with lat, lng, and address properties
 * @throws {Error} If geocoding fails or times out
 */
export async function geocodeAddress(address) {
    // Check cache first
    const cacheKey = address.toLowerCase().trim();
    if (geocodeCache.has(cacheKey)) {
        return geocodeCache.get(cacheKey);
    }

    const params = new URLSearchParams({
        key: CONFIG.LOCATIONIQ_API_KEY,
        q: address,
        format: 'json',
        limit: '1'
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.GEOCODE_TIMEOUT);

    try {
        const response = await fetch(
            `${CONFIG.LOCATIONIQ_BASE}/search?${params}`,
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error(ErrorMessages[ErrorTypes.RATE_LIMITED]);
            }
            if (response.status === 401 || response.status === 403) {
                throw new Error('LocationIQ API key is invalid. Please check your API key.');
            }
            throw new Error(ErrorMessages[ErrorTypes.GEOCODING_FAILED]);
        }

        const data = await response.json();

        if (!data || data.length === 0) {
            throw new Error(ErrorMessages[ErrorTypes.GEOCODING_FAILED]);
        }

        const result = data[0];
        const geocodeResult = {
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lon),
            address: result.display_name,
            precision: result.type
        };

        // Cache the result
        geocodeCache.set(cacheKey, geocodeResult);
        return geocodeResult;

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Geocoding request timed out. Please try again.');
        }
        throw error;
    }
}

/**
 * Get current position using browser geolocation
 * @returns {Promise<Object>} Object with lat and lng properties
 * @throws {Error} If geolocation fails or is denied
 */
export function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                let message;
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        message = ErrorMessages[ErrorTypes.LOCATION_DENIED];
                        break;
                    case error.POSITION_UNAVAILABLE:
                        message = 'Location information is unavailable.';
                        break;
                    case error.TIMEOUT:
                        message = 'Location request timed out.';
                        break;
                    default:
                        message = 'An unknown error occurred while getting location.';
                }
                reject(new Error(message));
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    });
}
