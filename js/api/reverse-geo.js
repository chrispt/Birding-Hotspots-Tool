/**
 * Reverse geocoding module - Convert coordinates to addresses
 * Uses Google Maps JavaScript API for geocoding
 */

// Singleton geocoder instance
let geocoder = null;

// Timeout duration for geocoding requests (ms)
const GEOCODE_TIMEOUT = 10000;

/**
 * Wrap a promise with a timeout that resolves with a fallback value
 * @param {Promise} promise - The promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {*} fallbackValue - Value to resolve with if timeout occurs
 * @returns {Promise} Promise that resolves with fallback if timeout exceeded
 */
function withTimeoutFallback(promise, ms, fallbackValue) {
    const timeout = new Promise((resolve) => {
        setTimeout(() => resolve(fallbackValue), ms);
    });
    return Promise.race([promise, timeout]);
}

/**
 * Get or create the Google Geocoder instance
 * @returns {google.maps.Geocoder|null}
 */
function getGeocoder() {
    if (!geocoder && window.google && window.google.maps) {
        geocoder = new google.maps.Geocoder();
    }
    return geocoder;
}

/**
 * Reverse geocode coordinates to an address using Google Geocoding API
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

    const geo = getGeocoder();
    if (!geo) {
        // Return fallback if Google Maps not loaded
        return fallback;
    }

    const geocodePromise = new Promise((resolve) => {
        geo.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === 'OK' && results.length > 0) {
                const result = results[0];
                resolve({
                    displayName: result.formatted_address,
                    address: formatNavigationAddress(result.address_components),
                    raw: result.address_components
                });
            } else {
                // Return fallback on any error
                resolve(fallback);
            }
        });
    });

    // Add timeout to prevent hanging - resolve with fallback instead of rejecting
    return withTimeoutFallback(geocodePromise, GEOCODE_TIMEOUT, fallback);
}

/**
 * Batch reverse geocode multiple locations
 * No rate limiting needed with Google (3,000 QPS allowed)
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
 * @param {Array} addressComponents - Google Maps address components array
 * @returns {string} Navigation-friendly address
 */
function formatNavigationAddress(addressComponents) {
    if (!addressComponents || addressComponents.length === 0) {
        return 'Address unavailable';
    }

    // Create a lookup map for address components
    const components = {};
    addressComponents.forEach(comp => {
        comp.types.forEach(type => {
            components[type] = comp.long_name;
        });
    });

    const parts = [];

    // Street address
    if (components.street_number && components.route) {
        parts.push(`${components.street_number} ${components.route}`);
    } else if (components.route) {
        parts.push(components.route);
    } else if (components.neighborhood || components.sublocality) {
        parts.push(components.neighborhood || components.sublocality);
    }

    // City/Town
    const city = components.locality || components.sublocality_level_1 || components.administrative_area_level_2;
    if (city) {
        parts.push(city);
    }

    // State/Province
    if (components.administrative_area_level_1) {
        parts.push(components.administrative_area_level_1);
    }

    // Postal code (useful for navigation)
    if (components.postal_code) {
        parts.push(components.postal_code);
    }

    // Country (only if nothing else is available)
    if (parts.length === 0 && components.country) {
        parts.push(components.country);
    }

    return parts.length > 0 ? parts.join(', ') : 'Address unavailable';
}
