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
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('origin', `${originLat},${originLng}`);
    url.searchParams.set('destination', `${destLat},${destLng}`);
    return url.toString();
}

/**
 * Generate a Google Maps directions URL with waypoints
 * @param {Array} stops - Array of stop objects with lat, lng properties
 * @returns {string} Google Maps URL with waypoints
 */
export function getGoogleMapsRouteUrl(stops) {
    if (!stops || stops.length < 2) return '';

    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');

    // First stop is origin
    const origin = stops[0];
    url.searchParams.set('origin', `${origin.lat},${origin.lng}`);

    // Last stop is destination
    const destination = stops[stops.length - 1];
    url.searchParams.set('destination', `${destination.lat},${destination.lng}`);

    // Middle stops are waypoints (max ~10 waypoints work reliably)
    if (stops.length > 2) {
        const waypoints = stops.slice(1, -1)
            .map(s => `${s.lat},${s.lng}`)
            .join('|');
        url.searchParams.set('waypoints', waypoints);
    }

    url.searchParams.set('travelmode', 'driving');
    return url.toString();
}

/**
 * Generate an eBird hotspot URL
 * @param {string} locId - eBird location ID
 * @returns {string} eBird hotspot URL
 */
export function getEbirdHotspotUrl(locId) {
    // Sanitize locId to prevent path injection (eBird IDs are alphanumeric with 'L' prefix)
    const sanitizedId = String(locId).replace(/[^a-zA-Z0-9]/g, '');
    return `https://ebird.org/hotspot/${encodeURIComponent(sanitizedId)}`;
}

/**
 * Generate a Google Maps search URL for a location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} Google Maps URL
 */
export function getGoogleMapsSearchUrl(lat, lng) {
    const url = new URL('https://www.google.com/maps/search/');
    url.searchParams.set('api', '1');
    url.searchParams.set('query', `${lat},${lng}`);
    return url.toString();
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

/**
 * Sample points along a route at regular intervals
 * @param {Array} coords - Route coordinates [[lng, lat], ...]
 * @param {number} intervalKm - Approximate interval between samples
 * @returns {Array<{lat, lng}>} Sample points
 */
export function sampleRoutePoints(coords, intervalKm) {
    const points = [];
    let accumulated = 0;

    // Always include start
    points.push({ lat: coords[0][1], lng: coords[0][0] });

    for (let i = 1; i < coords.length; i++) {
        const dist = calculateDistance(
            coords[i - 1][1], coords[i - 1][0],
            coords[i][1], coords[i][0]
        );
        accumulated += dist;

        if (accumulated >= intervalKm) {
            points.push({ lat: coords[i][1], lng: coords[i][0] });
            accumulated = 0;
        }
    }

    // Always include end
    const last = coords[coords.length - 1];
    if (points[points.length - 1].lat !== last[1] || points[points.length - 1].lng !== last[0]) {
        points.push({ lat: last[1], lng: last[0] });
    }

    return points;
}

/**
 * Calculate minimum distance from a point to a polyline (route)
 * @param {number} lat - Point latitude
 * @param {number} lng - Point longitude
 * @param {Array} routeCoords - Route coordinates [[lng, lat], ...]
 * @returns {number} Distance in km
 */
export function distanceToRouteLine(lat, lng, routeCoords) {
    let minDist = Infinity;

    for (let i = 0; i < routeCoords.length - 1; i++) {
        const segDist = pointToSegmentDistance(
            lat, lng,
            routeCoords[i][1], routeCoords[i][0],
            routeCoords[i + 1][1], routeCoords[i + 1][0]
        );
        minDist = Math.min(minDist, segDist);
    }

    return minDist;
}

/**
 * Calculate distance from a point to a line segment
 * @param {number} px - Point latitude
 * @param {number} py - Point longitude
 * @param {number} x1 - Segment start latitude
 * @param {number} y1 - Segment start longitude
 * @param {number} x2 - Segment end latitude
 * @param {number} y2 - Segment end longitude
 * @returns {number} Distance in km
 */
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;
    if (param < 0) {
        xx = x1; yy = y1;
    } else if (param > 1) {
        xx = x2; yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    return calculateDistance(px, py, xx, yy);
}
