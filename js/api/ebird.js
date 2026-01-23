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
        this.abortSignal = null;
    }

    /**
     * Set the abort signal for cancellable requests
     * @param {AbortSignal} signal - AbortController signal
     */
    setAbortSignal(signal) {
        this.abortSignal = signal;
    }

    /**
     * Make an authenticated request to the eBird API with exponential backoff
     * @param {string} endpoint - API endpoint
     * @param {Object} params - Query parameters
     * @param {number} retries - Number of retry attempts for rate limiting
     * @returns {Promise<any>} API response data
     */
    async fetchWithAuth(endpoint, params = {}, retries = 3) {
        const url = new URL(`${this.baseUrl}${endpoint}`);

        // Add query parameters
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, value.toString());
            }
        });

        let lastError;
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const fetchOptions = {
                    headers: {
                        'x-ebirdapitoken': this.apiKey
                    }
                };

                // Add abort signal if available
                if (this.abortSignal) {
                    fetchOptions.signal = this.abortSignal;
                }

                const response = await fetch(url, fetchOptions);

                if (!response.ok) {
                    if (response.status === 403) {
                        throw new Error(ErrorMessages[ErrorTypes.INVALID_API_KEY]);
                    }
                    if (response.status === 429) {
                        // Rate limited - apply exponential backoff and retry
                        if (attempt < retries - 1) {
                            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }
                        throw new Error(ErrorMessages[ErrorTypes.RATE_LIMITED]);
                    }
                    throw new Error(`eBird API error: ${response.status} ${response.statusText}`);
                }

                return response.json();
            } catch (error) {
                lastError = error;

                // Don't retry if request was aborted
                if (error.name === 'AbortError') {
                    throw error;
                }

                if (error.message.includes('fetch') || error.message.includes('network')) {
                    // Network error - retry with backoff
                    if (attempt < retries - 1) {
                        const delay = Math.pow(2, attempt) * 1000;
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    throw new Error(ErrorMessages[ErrorTypes.NETWORK_ERROR]);
                }
                throw error;
            }
        }
        throw lastError;
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

    /**
     * Get eBird taxonomy (species list)
     * @param {string} locale - Language code (default 'en')
     * @returns {Promise<Array>} Array of species objects
     */
    async getTaxonomy(locale = 'en') {
        const data = await this.fetchWithAuth('/ref/taxonomy/ebird', {
            fmt: 'json',
            locale
        });
        return data || [];
    }

    /**
     * Get recent observations of a specific species near a location
     * @param {string} speciesCode - eBird species code (e.g., 'blujay')
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} dist - Search radius in km (max 50)
     * @param {number} back - Days back to search (max 30)
     * @returns {Promise<Array>} Array of observation objects
     */
    async getRecentSpeciesObservations(speciesCode, lat, lng, dist = 50, back = 30) {
        const data = await this.fetchWithAuth(`/data/obs/geo/recent/${speciesCode}`, {
            lat: lat.toFixed(2),
            lng: lng.toFixed(2),
            dist: Math.min(dist, 50),
            back: Math.min(Math.max(back, 1), 30)
        });
        return data || [];
    }

    /**
     * Get nearest observations of a specific species
     * @param {string} speciesCode - eBird species code
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} back - Days back to search (max 30)
     * @param {number} maxResults - Maximum results to return
     * @returns {Promise<Array>} Array of observation objects
     */
    async getNearestSpeciesObservations(speciesCode, lat, lng, back = 30, maxResults = 20) {
        const data = await this.fetchWithAuth(`/data/nearest/geo/recent/${speciesCode}`, {
            lat: lat.toFixed(2),
            lng: lng.toFixed(2),
            back: Math.min(Math.max(back, 1), 30),
            maxResults
        });
        return data || [];
    }
}

/**
 * Process observations to get unique species with counts
 * @param {Array} observations - Raw observation array from eBird
 * @param {Set} notableSpeciesCodes - Set of species codes that are notable
 * @param {Set} lifeListCodes - Set of species codes on user's life list
 * @param {Set} lifeListNames - Set of lowercase common names on user's life list
 * @returns {Array} Processed bird list
 */
export function processObservations(observations, notableSpeciesCodes = new Set(), lifeListCodes = new Set(), lifeListNames = new Set()) {
    const birdMap = new Map();
    const hasLifeList = lifeListCodes.size > 0 || lifeListNames.size > 0;

    for (const obs of observations) {
        const code = obs.speciesCode;
        // Check if species is on life list by code OR by common name
        const onLifeList = lifeListCodes.has(code) ||
            (obs.comName && lifeListNames.has(obs.comName.toLowerCase()));

        if (!birdMap.has(code)) {
            birdMap.set(code, {
                speciesCode: code,
                comName: obs.comName,
                sciName: obs.sciName,
                count: obs.howMany || 1,
                lastSeen: obs.obsDt,
                isNotable: notableSpeciesCodes.has(code),
                isLifer: hasLifeList && !onLifeList
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

    // Sort: notable lifers first, then notable, then lifers, then alphabetically
    return Array.from(birdMap.values()).sort((a, b) => {
        // Priority score: notable+lifer = 3, notable = 2, lifer = 1, normal = 0
        const scoreA = (a.isNotable ? 2 : 0) + (a.isLifer ? 1 : 0);
        const scoreB = (b.isNotable ? 2 : 0) + (b.isLifer ? 1 : 0);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.comName.localeCompare(b.comName);
    });
}
