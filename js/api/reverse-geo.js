/**
 * Reverse geocoding module - Convert coordinates to addresses
 * Uses LocationIQ REST API for geocoding
 */
import { CONFIG } from '../utils/constants.js';

/**
 * Reverse geocode coordinates to an address using LocationIQ API
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} Object with address information
 */
export async function reverseGeocode(lat, lng) {
    const fallback = {
        displayName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        address: 'Address unavailable',
        raw: null
    };

    const params = new URLSearchParams({
        key: CONFIG.LOCATIONIQ_API_KEY,
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
            return fallback;
        }

        return {
            displayName: data.display_name,
            address: formatNavigationAddress(data.address),
            raw: data.address
        };

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.warn('Reverse geocoding timed out');
        } else {
            console.warn('Reverse geocoding failed:', error);
        }
        return fallback;
    }
}

/**
 * Batch reverse geocode multiple locations
 * Note: Rate limited to 2 req/sec on free tier, so we add delays
 * @param {Array} locations - Array of {lat, lng} objects
 * @param {Function} onProgress - Progress callback (current, total)
 * @returns {Promise<Array>} Array of address results
 */
export async function batchReverseGeocode(locations, onProgress) {
    const results = [];
    const RATE_LIMIT_DELAY = 500; // 2 req/sec = 500ms between requests

    for (let i = 0; i < locations.length; i++) {
        const loc = locations[i];
        const result = await reverseGeocode(loc.lat, loc.lng);
        results.push(result);

        if (onProgress) {
            onProgress(i + 1, locations.length);
        }

        // Rate limiting: wait between requests (except for last one)
        if (i < locations.length - 1) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
    }

    return results;
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
