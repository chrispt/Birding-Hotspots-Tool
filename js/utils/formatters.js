/**
 * Data formatting utilities
 */

/**
 * Format a date for display
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Format distance in miles with appropriate precision
 * @param {number} distanceKm - Distance in kilometers
 * @returns {string} Formatted distance string in miles
 */
export function formatDistance(distanceKm) {
    const distanceMiles = distanceKm * 0.621371;
    if (distanceMiles < 0.1) {
        // Convert to feet for very short distances
        const feet = Math.round(distanceMiles * 5280);
        return `${feet} ft`;
    } else if (distanceMiles < 10) {
        return `${distanceMiles.toFixed(1)} mi`;
    } else {
        return `${Math.round(distanceMiles)} mi`;
    }
}

/**
 * Format duration in human-readable format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string (e.g., "15 min", "1 hr 23 min")
 */
export function formatDuration(seconds) {
    if (seconds == null) return '';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);

    if (hours === 0) {
        return `${minutes} min`;
    } else if (minutes === 0) {
        return `${hours} hr`;
    } else {
        return `${hours} hr ${minutes} min`;
    }
}

/**
 * Format coordinates for display
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} Formatted coordinate string
 */
export function formatCoordinates(lat, lng) {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format a number with commas for thousands
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(num) {
    return num.toLocaleString('en-US');
}

/**
 * Generate a Google Maps directions URL
 * @param {number} originLat - Origin latitude
 * @param {number} originLng - Origin longitude
 * @param {number} destLat - Destination latitude
 * @param {number} destLng - Destination longitude
 * @returns {string} Google Maps URL
 */
export function getGoogleMapsDirectionsUrl(originLat, originLng, destLat, destLng) {
    return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}`;
}

/**
 * Generate an eBird hotspot URL
 * @param {string} locId - eBird location ID
 * @returns {string} eBird hotspot URL
 */
export function getEbirdHotspotUrl(locId) {
    return `https://ebird.org/hotspot/${locId}`;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - First point latitude
 * @param {number} lng1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lng2 - Second point longitude
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Convert degrees to radians
 * @param {number} deg - Degrees
 * @returns {number} Radians
 */
function toRad(deg) {
    return deg * (Math.PI / 180);
}
