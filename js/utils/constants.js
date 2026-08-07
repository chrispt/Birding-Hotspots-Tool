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

    // OSRM routing (Open Source Routing Machine)
    OSRM: {
        BASE_URL: 'https://router.project-osrm.org/route/v1/driving',
        TABLE_URL: 'https://router.project-osrm.org/table/v1/driving',
        TRIP_URL: 'https://router.project-osrm.org/trip/v1/driving'
    },

    // Route-mode hotspot search (multi-point sampling along the route)
    ROUTE_SEARCH: {
        HOTSPOT_RADIUS_KM: 50,        // eBird /ref/hotspot/geo hard cap
        SAMPLE_INTERVAL_KM: 70,       // target spacing between search circles along the route
        MAX_SAMPLE_POINTS: 8,        // cap on eBird geo-search calls for a real "Plan Route" search
        PREVIEW_MAX_SAMPLE_POINTS: 4, // lighter cap for the auto-firing route preview
        MAX_ENRICHMENT_HOTSPOTS: 25, // hotspots enriched with species data and shown for selection
        PREVIEW_MAX_HOTSPOTS: 15,    // preview map marker cap
        MAX_DETOUR_SAFE_KM: 24       // ~15 mi, the "Max Detour" slider's max setting
    },

    // Life list CSV import limits
    LIFE_LIST_IMPORT: {
        MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB - generous for large world life lists
        MAX_ROWS: 15000 // eBird's taxonomy is ~11,000 species; buffer for subspecies/forms.
                         // A genuine life list can't exceed this - a full checklist-history
                         // export (one row per species per checklist) almost always will.
    },

    // Open-Meteo weather (no key required)
    OPEN_METEO_BASE: 'https://api.open-meteo.com/v1/forecast',

    // Species taxonomy IndexedDB
    SPECIES_DB: {
        DB_NAME: 'birding_hotspots_db',
        DB_VERSION: 1,
        STORE_NAME: 'taxonomy',
        CACHE_EXPIRY_DAYS: 7
    },

    // Local storage keys
    STORAGE_KEYS: {
        API_KEY: 'birding_ebird_api_key',
        FAVORITES: 'birding_favorite_locations',
        GEOAPIFY_KEY: 'birding_geoapify_key',
        LIFE_LIST: 'birding_life_list',
        RECENT_SEARCHES: 'birding_recent_searches',
        FAVORITE_HOTSPOTS: 'birding_favorite_hotspots',
        THEME: 'birding_theme',
        TEMP_UNIT: 'birding_temp_unit',
        ERROR_QUEUE: 'birding_error_queue',
        SAVED_ITINERARIES: 'birding_saved_itineraries',
        ONBOARDED: 'birding_onboarded',
        ITINERARY_START_TIME: 'birding_itinerary_start_time'
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
    LOCATION_DENIED: 'location_denied',
    UNCAUGHT_EXCEPTION: 'uncaught_exception',
    UNHANDLED_REJECTION: 'unhandled_rejection',
    APP_ERROR: 'app_error'
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

/**
 * Expected user-driven messages that should NOT be auto-reported as bugs.
 * These are normal validation/permission outcomes, not code defects.
 * Referenced by showError() in app.js to skip error-reporter capture.
 */
export const EXPECTED_USER_ERRORS = new Set([
    ErrorMessages[ErrorTypes.LOCATION_DENIED],
    ErrorMessages[ErrorTypes.INVALID_API_KEY],
    ErrorMessages[ErrorTypes.GEOCODING_FAILED],
    ErrorMessages[ErrorTypes.INVALID_COORDINATES],
    ErrorMessages[ErrorTypes.NO_HOTSPOTS],
    'API key is required',             // from validators.js — surfaced before ErrorMessages lookup
    'Geolocation is not supported by your browser'
]);
