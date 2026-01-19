/**
 * Input validation utilities
 */

/**
 * Validate latitude and longitude coordinates
 * @param {string|number} lat - Latitude value
 * @param {string|number} lng - Longitude value
 * @returns {Object} Validation result with valid flag and parsed values or error
 */
export function validateCoordinates(lat, lng) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
        return {
            valid: false,
            error: 'Latitude must be a number between -90 and 90'
        };
    }

    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        return {
            valid: false,
            error: 'Longitude must be a number between -180 and 180'
        };
    }

    return {
        valid: true,
        lat: latNum,
        lng: lngNum
    };
}

/**
 * Validate eBird API key format
 * eBird API keys are typically alphanumeric strings
 * @param {string} apiKey - The API key to validate
 * @returns {Object} Validation result
 */
export function validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
        return {
            valid: false,
            error: 'API key is required'
        };
    }

    const trimmed = apiKey.trim();

    if (trimmed.length < 10) {
        return {
            valid: false,
            error: 'API key appears to be too short'
        };
    }

    // eBird API keys are alphanumeric
    if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
        return {
            valid: false,
            error: 'API key should only contain letters and numbers'
        };
    }

    return {
        valid: true,
        apiKey: trimmed
    };
}

/**
 * Validate and sanitize address input
 * Uses allowlist approach for better security
 * @param {string} address - The address to validate
 * @returns {Object} Validation result
 */
export function validateAddress(address) {
    if (!address || typeof address !== 'string') {
        return {
            valid: false,
            error: 'Address is required'
        };
    }

    const trimmed = address.trim();

    if (trimmed.length < 3) {
        return {
            valid: false,
            error: 'Please enter a more specific address'
        };
    }

    if (trimmed.length > 500) {
        return {
            valid: false,
            error: 'Address is too long'
        };
    }

    // Must contain at least one letter (not just numbers/symbols)
    if (!/[a-zA-Z]/.test(trimmed)) {
        return {
            valid: false,
            error: 'Please enter a valid address'
        };
    }

    // Allowlist approach: only permit safe characters for addresses
    // Letters, numbers, spaces, commas, periods, hyphens, apostrophes, # (apt numbers), slashes, &
    const allowedPattern = /^[a-zA-Z0-9\s,.'#\-&/()]+$/;
    if (!allowedPattern.test(trimmed)) {
        return {
            valid: false,
            error: 'Address contains invalid characters'
        };
    }

    return {
        valid: true,
        address: trimmed
    };
}

/**
 * Validate favorite location name
 * @param {string} name - The location name to validate
 * @returns {Object} Validation result
 */
export function validateFavoriteName(name) {
    if (!name || typeof name !== 'string') {
        return {
            valid: false,
            error: 'Location name is required'
        };
    }

    const trimmed = name.trim();

    if (trimmed.length < 1) {
        return {
            valid: false,
            error: 'Please enter a name for this location'
        };
    }

    if (trimmed.length > 50) {
        return {
            valid: false,
            error: 'Location name is too long (max 50 characters)'
        };
    }

    return {
        valid: true,
        name: trimmed
    };
}
