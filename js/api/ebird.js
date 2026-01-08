/**
 * eBird API client module
 */
import { CONFIG, ErrorTypes, ErrorMessages } from '../utils/constants.js';

/**
 * eBird API client class
 */
export class EBirdAPI {
    /**
     * Create an eBird API client
     * @param {string} apiKey - The eBird API key
     */
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = CONFIG.EBIRD_API_BASE;
    }

    /**
     * Make an authenticated request to the eBird API
     * @param {string} endpoint - API endpoint
     * @param {Object} params - Query parameters
     * @returns {Promise<any>} API response data
     */
    async fetchWithAuth(endpoint, params = {}) {
        const url = new URL(`${this.baseUrl}${endpoint}`);

        // Add query parameters
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, value.toString());
            }
        });

        try {
            const response = await fetch(url, {
                headers: {
                    'x-ebirdapitoken': this.apiKey
                }
            });

            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error(ErrorMessages[ErrorTypes.INVALID_API_KEY]);
                }
                if (response.status === 429) {
                    throw new Error(ErrorMessages[ErrorTypes.RATE_LIMITED]);
                }
                throw new Error(`eBird API error: ${response.status} ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            if (error.message.includes('fetch') || error.message.includes('network')) {
                throw new Error(ErrorMessages[ErrorTypes.NETWORK_ERROR]);
            }
            throw error;
        }
    }

    /**
     * Get nearby hotspots
     * @param {number} lat - Latitude (decimal, -90 to 90)
     * @param {number} lng - Longitude (decimal, -180 to 180)
     * @param {number} dist - Search radius in km (max 50)
     * @returns {Promise<Array>} Array of hotspot objects
     */
    async getNearbyHotspots(lat, lng, dist = 50, back = 30) {
        // eBird API wants 2 decimal places for coordinates
        const data = await this.fetchWithAuth('/ref/hotspot/geo', {
            lat: lat.toFixed(2),
            lng: lng.toFixed(2),
            dist: Math.min(dist, 50),
            back: Math.min(Math.max(back, 1), 30),
            fmt: 'json'
        });

        return data || [];
    }

    /**
     * Get recent observations at a specific hotspot
     * @param {string} locId - eBird location ID (e.g., L123456)
     * @param {number} back - Days back to search (1-30)
     * @returns {Promise<Array>} Array of observation objects
     */
    async getRecentObservations(locId, back = 30) {
        const data = await this.fetchWithAuth(`/data/obs/${locId}/recent`, {
            back: Math.min(Math.max(back, 1), 30)
        });

        return data || [];
    }

    /**
     * Get notable/rare observations near a location
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} dist - Search radius in km (max 50)
     * @param {number} back - Days back to search (1-30)
     * @returns {Promise<Array>} Array of notable observation objects
     */
    async getNotableObservationsNearby(lat, lng, dist = 50, back = 30) {
        const data = await this.fetchWithAuth('/data/obs/geo/recent/notable', {
            lat: lat.toFixed(2),
            lng: lng.toFixed(2),
            dist: Math.min(dist, 50),
            back: Math.min(Math.max(back, 1), 30)
        });

        return data || [];
    }

    /**
     * Get recent observations near a location
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} dist - Search radius in km (max 50)
     * @param {number} back - Days back to search (1-30)
     * @returns {Promise<Array>} Array of observation objects
     */
    async getRecentObservationsNearby(lat, lng, dist = 50, back = 30) {
        const data = await this.fetchWithAuth('/data/obs/geo/recent', {
            lat: lat.toFixed(2),
            lng: lng.toFixed(2),
            dist: Math.min(dist, 50),
            back: Math.min(Math.max(back, 1), 30)
        });

        return data || [];
    }

    /**
     * Test if the API key is valid
     * Makes a minimal request to verify authentication
     * @returns {Promise<boolean>} True if API key is valid
     */
    async testApiKey() {
        try {
            // Use a simple hotspot query to test the key
            await this.fetchWithAuth('/ref/hotspot/geo', {
                lat: '40.00',
                lng: '-74.00',
                dist: 1,
                fmt: 'json'
            });
            return true;
        } catch (error) {
            if (error.message.includes('Invalid')) {
                return false;
            }
            throw error;
        }
    }
}

/**
 * Process observations to get unique species with counts
 * @param {Array} observations - Raw observation array from eBird
 * @param {Set} notableSpeciesCodes - Set of species codes that are notable
 * @returns {Array} Processed bird list
 */
export function processObservations(observations, notableSpeciesCodes = new Set()) {
    const birdMap = new Map();

    for (const obs of observations) {
        const code = obs.speciesCode;

        if (!birdMap.has(code)) {
            birdMap.set(code, {
                speciesCode: code,
                comName: obs.comName,
                sciName: obs.sciName,
                count: obs.howMany || 1,
                lastSeen: obs.obsDt,
                isNotable: notableSpeciesCodes.has(code)
            });
        } else {
            const existing = birdMap.get(code);
            // Keep the highest count and most recent date
            existing.count = Math.max(existing.count, obs.howMany || 1);
            if (obs.obsDt > existing.lastSeen) {
                existing.lastSeen = obs.obsDt;
            }
        }
    }

    // Sort: notable species first, then alphabetically
    return Array.from(birdMap.values()).sort((a, b) => {
        if (a.isNotable && !b.isNotable) return -1;
        if (!a.isNotable && b.isNotable) return 1;
        return a.comName.localeCompare(b.comName);
    });
}
