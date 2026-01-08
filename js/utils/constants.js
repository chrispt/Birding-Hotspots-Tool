/**
 * Application configuration constants
 */
export const CONFIG = {
    // eBird API
    EBIRD_API_BASE: 'https://api.ebird.org/v2',

    // Geocoding
    NOMINATIM_BASE: 'https://nominatim.openstreetmap.org',

    // Static Maps
    GEOAPIFY_BASE: 'https://maps.geoapify.com/v1',

    // Search parameters
    DEFAULT_SEARCH_RADIUS: 50,  // km (max for eBird)
    DEFAULT_DAYS_BACK: 30,
    MAX_HOTSPOTS: 10,

    // Rate limiting
    NOMINATIM_RATE_LIMIT: 1100,  // ms between requests (slightly over 1s to be safe)

    // App identification for Nominatim
    APP_USER_AGENT: 'BirdingHotspotsTool/1.0 (https://github.com/birding-hotspots-tool)',

    // Local storage keys
    STORAGE_KEYS: {
        API_KEY: 'birding_ebird_api_key',
        FAVORITES: 'birding_favorite_locations',
        GEOAPIFY_KEY: 'birding_geoapify_key'
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
    [ErrorTypes.NO_HOTSPOTS]: 'No birding hotspots found within 31 miles of this location.',
    [ErrorTypes.INVALID_COORDINATES]: 'Invalid coordinates. Latitude must be -90 to 90, longitude must be -180 to 180.',
    [ErrorTypes.LOCATION_DENIED]: 'Location access was denied. Please enter your location manually.'
};
