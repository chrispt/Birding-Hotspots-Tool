/**
 * Geocoding module - Convert addresses to coordinates
 * Uses Google Maps JavaScript API for geocoding
 */
import { ErrorTypes, ErrorMessages } from '../utils/constants.js';

// Singleton geocoder instance
let geocoder = null;

// Cache for geocoding results (session-level for performance)
const geocodeCache = new Map();

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
 * Convert an address to coordinates using Google Geocoding API
 * Uses session-level cache to avoid redundant API calls
 * @param {string} address - The address to geocode
 * @returns {Promise<Object>} Object with lat, lng, and address properties
 * @throws {Error} If geocoding fails
 */
export async function geocodeAddress(address) {
    // Check cache first
    const cacheKey = address.toLowerCase().trim();
    if (geocodeCache.has(cacheKey)) {
        return geocodeCache.get(cacheKey);
    }

    const geo = getGeocoder();
    if (!geo) {
        throw new Error('Google Maps API not loaded. Please refresh the page.');
    }

    return new Promise((resolve, reject) => {
        geo.geocode({ address }, (results, status) => {
            if (status === 'OK' && results.length > 0) {
                const result = results[0];
                const response = {
                    lat: result.geometry.location.lat(),
                    lng: result.geometry.location.lng(),
                    address: result.formatted_address,
                    precision: result.geometry.location_type
                };
                // Cache the result for future calls
                geocodeCache.set(cacheKey, response);
                resolve(response);
            } else if (status === 'ZERO_RESULTS') {
                reject(new Error(ErrorMessages[ErrorTypes.GEOCODING_FAILED]));
            } else if (status === 'OVER_QUERY_LIMIT') {
                reject(new Error(ErrorMessages[ErrorTypes.RATE_LIMITED]));
            } else if (status === 'REQUEST_DENIED') {
                reject(new Error('Google Maps API request denied. Please check the API key.'));
            } else {
                reject(new Error(ErrorMessages[ErrorTypes.GEOCODING_FAILED]));
            }
        });
    });
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
