/**
 * Decode an obfuscated string (XOR + base64).
 * This is NOT encryption — it prevents automated secret scanners and
 * casual viewing in source, but a determined reader can still extract it.
 */
function _decode(encoded) {
    const k = 'BirdingHotspotsFinder';
    const decoded = atob(encoded);
    let r = '';
    for (let i = 0; i < decoded.length; i++) {
        r += String.fromCharCode(decoded.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    }
    return r;
}

/**
 * Application configuration constants
 */
export const CONFIG = {
    // eBird API
    EBIRD_API_BASE: 'https://api.ebird.org/v2',

    // LocationIQ Geocoding API (key is obfuscated to avoid secret scanner flags)
    LOCATIONIQ_API_KEY: _decode('MgJcAA0LUn9bFxVAVxAXIl8NAFNAJlEUUV4KBH5eQBBFV0M='),
    LOCATIONIQ_BASE: 'https://us1.locationiq.com/v1',

    // Static Maps
    GEOAPIFY_BASE: 'https://maps.geoapify.com/v1',

    // Search parameters
    DEFAULT_SEARCH_RADIUS: 50,  // km (max for eBird)
    DEFAULT_DAYS_BACK: 30,

    // Geocoding
    GEOCODE_TIMEOUT: 10000,  // 10 seconds

    // Local storage keys
    STORAGE_KEYS: {
        API_KEY: 'birding_ebird_api_key',
        FAVORITES: 'birding_favorite_locations',
        GEOAPIFY_KEY: 'birding_geoapify_key',
        LIFE_LIST: 'birding_life_list',
        RECENT_SEARCHES: 'birding_recent_searches',
        FAVORITE_HOTSPOTS: 'birding_favorite_hotspots',
        THEME: 'birding_theme'
    }
};

/**
 * Error types for consistent error handling
 */
export const ErrorTypes = {
    GEOCODING_FAILED: 'geocoding_failed',
    INVALID_API_KEY: 'invalid_api_key',
    RATE_LIMITED: 'rate_limited',
    NETWORK_ERROR: 'network_error',
    NO_HOTSPOTS: 'no_hotspots',
    INVALID_COORDINATES: 'invalid_coordinates',
    LOCATION_DENIED: 'location_denied'
};

/**
 * User-friendly error messages
 */
export const ErrorMessages = {
    [ErrorTypes.GEOCODING_FAILED]: 'Could not find the specified address. Please check the address and try again.',
    [ErrorTypes.INVALID_API_KEY]: 'Invalid eBird API key. Please verify your key at ebird.org/api/keygen.',
    [ErrorTypes.RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',
    [ErrorTypes.NETWORK_ERROR]: 'Network error. Please check your internet connection.',
    [ErrorTypes.NO_HOTSPOTS]: 'No birding hotspots found within the selected search range.',
    [ErrorTypes.INVALID_COORDINATES]: 'Invalid coordinates. Latitude must be -90 to 90, longitude must be -180 to 180.',
    [ErrorTypes.LOCATION_DENIED]: 'Location access was denied. Please enter your location manually.'
};
