/**
 * DOM manipulation helper functions
 * Reduces code duplication for common DOM operations
 */

/**
 * Clear all children from an element efficiently
 * @param {HTMLElement} element - Element to clear
 */
export function clearElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

/**
 * Safely encode URL parameters
 * @param {Object} params - Key-value pairs to encode
 * @returns {string} Encoded query string (without leading ?)
 */
export function encodeURLParams(params) {
    return Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
}

/**
 * Build a URL with encoded query parameters
 * @param {string} baseUrl - Base URL
 * @param {Object} params - Query parameters
 * @returns {string} Complete URL with query string
 */
export function buildURL(baseUrl, params) {
    const queryString = encodeURLParams(params);
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}
