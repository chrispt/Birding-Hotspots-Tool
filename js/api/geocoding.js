/**
 * Geocoding module - Convert addresses to coordinates
 */
import { CONFIG, ErrorTypes, ErrorMessages } from '../utils/constants.js';

/**
 * Convert an address to coordinates using OpenStreetMap Nominatim
 * @param {string} address - The address to geocode
 * @returns {Promise<Object>} Object with lat and lng properties
 * @throws {Error} If geocoding fails
 */
export async function geocodeAddress(address) {
    const url = new URL(`${CONFIG.NOMINATIM_BASE}/search`);
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
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
            throw new Error(ErrorMessages[ErrorTypes.NETWORK_ERROR]);
        }

        const data = await response.json();

        if (!data || data.length === 0) {
            throw new Error(ErrorMessages[ErrorTypes.GEOCODING_FAILED]);
        }

        const result = data[0];
        return {
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lon),
            displayName: result.display_name,
            address: formatAddressFromResult(result)
        };
    } catch (error) {
        if (error.message.includes('fetch')) {
            throw new Error(ErrorMessages[ErrorTypes.NETWORK_ERROR]);
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

/**
 * Format address from Nominatim result
 * @param {Object} result - Nominatim result object
 * @returns {string} Formatted address string
 */
function formatAddressFromResult(result) {
    if (!result.address) {
        return result.display_name || '';
    }

    const addr = result.address;
    const parts = [];

    // Build a concise address
    if (addr.house_number && addr.road) {
        parts.push(`${addr.house_number} ${addr.road}`);
    } else if (addr.road) {
        parts.push(addr.road);
    }

    const city = addr.city || addr.town || addr.village || addr.hamlet;
    if (city) {
        parts.push(city);
    }

    if (addr.state) {
        parts.push(addr.state);
    }

    if (addr.postcode) {
        parts.push(addr.postcode);
    }

    return parts.join(', ') || result.display_name || '';
}
