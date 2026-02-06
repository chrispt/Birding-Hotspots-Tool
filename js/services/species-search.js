/**
 * Species Search Service
 * Handles taxonomy loading, caching, and species autocomplete
 */

const DB_NAME = 'birding_hotspots_db';
const DB_VERSION = 1;
const STORE_NAME = 'taxonomy';
const CACHE_EXPIRY_DAYS = 7;

/**
 * Open IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

/**
 * Get cached taxonomy from IndexedDB
 * @returns {Promise<Array|null>}
 */
async function getCachedTaxonomy() {
    let db = null;
    try {
        db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get('taxonomy');

            request.onerror = () => {
                db.close();
                reject(request.error);
            };
            request.onsuccess = () => {
                db.close();
                const result = request.result;
                if (!result) {
                    resolve(null);
                    return;
                }

                // Check if cache is expired
                const now = Date.now();
                const expiryTime = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
                if (now - result.timestamp > expiryTime) {
                    resolve(null);
                    return;
                }

                resolve(result.data);
            };
        });
    } catch (e) {
        if (db) db.close();
        console.warn('IndexedDB not available:', e);
        return null;
    }
}

/**
 * Save taxonomy to IndexedDB cache
 * @param {Array} taxonomy
 */
async function cacheTaxonomy(taxonomy) {
    let db = null;
    try {
        db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({
                id: 'taxonomy',
                data: taxonomy,
                timestamp: Date.now()
            });

            request.onerror = () => {
                db.close();
                reject(request.error);
            };
            request.onsuccess = () => {
                db.close();
                resolve();
            };
        });
    } catch (e) {
        if (db) db.close();
        console.warn('Could not cache taxonomy:', e);
    }
}

/**
 * Species Search class
 * Provides autocomplete functionality and species lookup
 */
export class SpeciesSearch {
    constructor(ebirdApi) {
        this.ebirdApi = ebirdApi;
        this.taxonomy = null;
        this._speciesIndex = null;
        this.isLoading = false;
        this.loadPromise = null;
    }

    /**
     * Load taxonomy (from cache or API)
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<void>}
     */
    async loadTaxonomy(onProgress = null) {
        // If already loaded, return immediately
        if (this.taxonomy) return;

        // If currently loading, wait for that to complete
        if (this.loadPromise) return this.loadPromise;

        this.isLoading = true;
        this.loadPromise = this._doLoadTaxonomy(onProgress);

        try {
            await this.loadPromise;
        } finally {
            this.isLoading = false;
            this.loadPromise = null;
        }
    }

    async _doLoadTaxonomy(onProgress) {
        // Try cache first
        if (onProgress) onProgress('Checking cached species data...');
        const cached = await getCachedTaxonomy();

        if (cached) {
            this.taxonomy = this._processTaxonomy(cached);
            this._speciesIndex = this._buildSpeciesIndex(this.taxonomy);
            if (onProgress) onProgress('Species data loaded from cache');
            return;
        }

        // Fetch from API
        if (onProgress) onProgress('Downloading species taxonomy...');
        try {
            const rawTaxonomy = await this.ebirdApi.getTaxonomy();
            this.taxonomy = this._processTaxonomy(rawTaxonomy);
            this._speciesIndex = this._buildSpeciesIndex(this.taxonomy);

            // Cache for later
            await cacheTaxonomy(rawTaxonomy);
            if (onProgress) onProgress('Species data loaded and cached');
        } catch (error) {
            console.error('Failed to load taxonomy:', error);
            throw error;
        }
    }

    /**
     * Process raw taxonomy into searchable format
     * @param {Array} rawTaxonomy
     * @returns {Array}
     */
    _processTaxonomy(rawTaxonomy) {
        // Filter to only species (not subspecies, hybrids, etc.)
        return rawTaxonomy
            .filter(t => t.category === 'species')
            .map(t => ({
                speciesCode: t.speciesCode,
                commonName: t.comName,
                scientificName: t.sciName,
                familyComName: t.familyComName || '',
                searchText: `${t.comName} ${t.sciName}`.toLowerCase()
            }));
    }

    /**
     * Build an index to speed up search operations.
     * The index maintains:
     * - A map from lowercased common name prefix to species array for quick prefix lookups.
     * - A reference to the full taxonomy for fallback substring searches.
     * @param {Array} taxonomy
     * @returns {Object}
     */
    _buildSpeciesIndex(taxonomy) {
        const prefixMap = new Map();

        for (const species of taxonomy) {
            const lowerName = species.commonName.toLowerCase();
            // Index first few characters of the common name to keep index size reasonable.
            const maxPrefixLength = Math.min(lowerName.length, 4);
            for (let len = 1; len <= maxPrefixLength; len++) {
                const prefix = lowerName.slice(0, len);
                if (!prefixMap.has(prefix)) {
                    prefixMap.set(prefix, []);
                }
                prefixMap.get(prefix).push(species);
            }
        }

        return {
            prefixMap,
            allSpecies: taxonomy
        };
    }

    /**
     * Search for species by name
     * @param {string} query - Search query
     * @param {number} limit - Maximum results
     * @returns {Array} Matching species
     */
    searchSpecies(query, limit = 10) {
        if (!this.taxonomy || query.length < 2) return [];

        const lowerQuery = query.toLowerCase();
        const results = [];

        // Ensure index is built (for backward compatibility if taxonomy was set manually).
        if (!this._speciesIndex) {
            this._speciesIndex = this._buildSpeciesIndex(this.taxonomy);
        }

        const index = this._speciesIndex;

        // First pass: look up by prefix in the index using up to 4 characters.
        const prefixKey = lowerQuery.slice(0, Math.min(lowerQuery.length, 4));
        const prefixCandidates = index.prefixMap.get(prefixKey) || [];
        for (const species of prefixCandidates) {
            if (results.length >= limit) break;
            if (species.commonName.toLowerCase().startsWith(lowerQuery) && !results.includes(species)) {
                results.push(species);
            }
        }

        // Second pass: fallback to contains query across all species, reusing existing searchText.
        if (results.length < limit) {
            for (const species of index.allSpecies) {
                if (results.length >= limit) break;
                if (!results.includes(species) && species.searchText.includes(lowerQuery)) {
                    results.push(species);
                }
            }
        }

        return results;
    }

    /**
     * Get species by code
     * @param {string} speciesCode
     * @returns {Object|null}
     */
    getSpeciesByCode(speciesCode) {
        if (!this.taxonomy) return null;
        return this.taxonomy.find(s => s.speciesCode === speciesCode) || null;
    }

    /**
     * Find hotspots where a species has been recently observed
     * @param {string} speciesCode - eBird species code
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} radius - Search radius in km
     * @param {number} daysBack - Days to look back
     * @returns {Promise<Array>} Hotspots with species sightings
     */
    async findSpeciesHotspots(speciesCode, lat, lng, radius, daysBack = 30) {
        const observations = await this.ebirdApi.getRecentSpeciesObservations(
            speciesCode, lat, lng, radius, daysBack
        );

        // Group by location
        const locationMap = new Map();

        for (const obs of observations) {
            const locId = obs.locId;

            if (!locationMap.has(locId)) {
                locationMap.set(locId, {
                    locId,
                    name: obs.locName,
                    lat: obs.lat,
                    lng: obs.lng,
                    isHotspot: obs.locationPrivate === false,
                    lastSeen: obs.obsDt,
                    observationCount: 1,
                    highestCount: obs.howMany || 1,
                    observations: [obs]
                });
            } else {
                const loc = locationMap.get(locId);
                loc.observationCount++;
                loc.highestCount = Math.max(loc.highestCount, obs.howMany || 1);
                if (obs.obsDt > loc.lastSeen) {
                    loc.lastSeen = obs.obsDt;
                }
                loc.observations.push(obs);
            }
        }

        // Convert to array and sort by most recent sighting
        return Array.from(locationMap.values())
            .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
    }

    /**
     * Check if taxonomy is loaded
     * @returns {boolean}
     */
    isReady() {
        return this.taxonomy !== null;
    }

    /**
     * Get total species count
     * @returns {number}
     */
    getSpeciesCount() {
        return this.taxonomy ? this.taxonomy.length : 0;
    }
}
