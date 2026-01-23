/**
 * Life List Service
 * Manages the user's personal bird life list for identifying potential lifers
 */
import { CONFIG } from '../utils/constants.js';

const { STORAGE_KEYS } = CONFIG;

export class LifeListService {
    constructor() {
        this.storageKey = STORAGE_KEYS.LIFE_LIST;
        this._cachedCodes = null;
        this._cachedNames = null;
    }

    /**
     * Get the full life list from storage
     * @returns {Array} Array of species objects
     */
    getLifeList() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.warn('Could not read life list from localStorage:', e);
            return [];
        }
    }

    /**
     * Get a Set of species codes for O(1) lookup
     * Results are cached until the list changes
     * @returns {Set<string>} Set of species codes
     */
    getLifeListCodes() {
        if (!this._cachedCodes) {
            this._buildCache();
        }
        return this._cachedCodes;
    }

    /**
     * Get a Set of common names (lowercase) for O(1) lookup
     * Results are cached until the list changes
     * @returns {Set<string>} Set of lowercase common names
     */
    getLifeListNames() {
        if (!this._cachedNames) {
            this._buildCache();
        }
        return this._cachedNames;
    }

    /**
     * Build both code and name caches
     */
    _buildCache() {
        const list = this.getLifeList();
        this._cachedCodes = new Set(list.map(s => s.speciesCode));
        this._cachedNames = new Set(list.map(s => s.comName?.toLowerCase()).filter(Boolean));
    }

    /**
     * Invalidate the cached codes (call after any list modification)
     */
    _invalidateCache() {
        this._cachedCodes = null;
        this._cachedNames = null;
    }

    /**
     * Save the life list to storage
     * @param {Array} list - Array of species objects
     */
    _saveList(list) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(list));
            this._invalidateCache();
        } catch (e) {
            console.warn('Could not save life list to localStorage:', e);
        }
    }

    /**
     * Import life list from eBird CSV export
     * Supports "My eBird Data" CSV format
     * @param {string} csvContent - Raw CSV content
     * @param {Array} taxonomy - eBird taxonomy array for resolving species codes
     * @returns {Object} Result with count and any errors
     */
    importFromCSV(csvContent, taxonomy = []) {
        const result = { imported: 0, errors: [], duplicates: 0, notMatched: [] };

        // Validate file size (max 5MB)
        const MAX_FILE_SIZE = 5 * 1024 * 1024;
        if (csvContent.length > MAX_FILE_SIZE) {
            result.errors.push('File too large (maximum 5MB)');
            return result;
        }

        // Validate row count (max 50,000 species)
        const MAX_ROWS = 50000;
        const roughRowCount = (csvContent.match(/\n/g) || []).length;
        if (roughRowCount > MAX_ROWS) {
            result.errors.push(`Too many rows (maximum ${MAX_ROWS.toLocaleString()})`);
            return result;
        }

        console.log(`[LifeList] Importing CSV with taxonomy size: ${taxonomy.length}`);

        // Build taxonomy lookup maps
        const taxonomyByCommonName = new Map();
        const taxonomyBySciName = new Map();
        for (const species of taxonomy) {
            if (species.comName) {
                taxonomyByCommonName.set(species.comName.toLowerCase(), species);
            }
            if (species.sciName) {
                taxonomyBySciName.set(species.sciName.toLowerCase(), species);
            }
        }

        console.log(`[LifeList] Built lookup maps - Common names: ${taxonomyByCommonName.size}, Scientific names: ${taxonomyBySciName.size}`);

        // Parse CSV
        const lines = csvContent.split(/\r?\n/);
        if (lines.length < 2) {
            result.errors.push('CSV file appears to be empty');
            return result;
        }

        // Parse header row
        const header = this._parseCSVLine(lines[0]);
        const commonNameIdx = header.findIndex(h =>
            h.toLowerCase().includes('common name') || h.toLowerCase() === 'species'
        );
        const sciNameIdx = header.findIndex(h =>
            h.toLowerCase().includes('scientific name') || h.toLowerCase() === 'sci. name'
        );

        if (commonNameIdx === -1 && sciNameIdx === -1) {
            result.errors.push('Could not find species name columns in CSV');
            return result;
        }

        console.log(`[LifeList] CSV columns detected - Header: ${JSON.stringify(header)}`);
        console.log(`[LifeList] Common name column index: ${commonNameIdx}, Scientific name column index: ${sciNameIdx}`);

        // Get existing life list to check for duplicates
        const existingCodes = this.getLifeListCodes();
        const newSpecies = [];

        // Process data rows
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = this._parseCSVLine(line);
            const commonName = commonNameIdx !== -1 ? values[commonNameIdx]?.trim() : null;
            const sciName = sciNameIdx !== -1 ? values[sciNameIdx]?.trim() : null;

            // Try to find species in taxonomy
            let species = null;
            if (commonName && taxonomyByCommonName.has(commonName.toLowerCase())) {
                species = taxonomyByCommonName.get(commonName.toLowerCase());
            } else if (sciName && taxonomyBySciName.has(sciName.toLowerCase())) {
                species = taxonomyBySciName.get(sciName.toLowerCase());
            }

            if (species) {
                if (existingCodes.has(species.speciesCode)) {
                    result.duplicates++;
                } else if (!newSpecies.some(s => s.speciesCode === species.speciesCode)) {
                    newSpecies.push({
                        speciesCode: species.speciesCode,
                        comName: species.comName,
                        sciName: species.sciName,
                        dateAdded: new Date().toISOString()
                    });
                    result.imported++;
                }
            } else if (commonName || sciName) {
                // Species not found in taxonomy - store with name only
                const fallbackCode = this._generateFallbackCode(commonName || sciName);
                console.warn(`[LifeList] Species not found in taxonomy: "${commonName}" / "${sciName}" - using fallback code: ${fallbackCode}`);
                result.notMatched.push(commonName || sciName);
                if (!existingCodes.has(fallbackCode) && !newSpecies.some(s => s.speciesCode === fallbackCode)) {
                    newSpecies.push({
                        speciesCode: fallbackCode,
                        comName: commonName || sciName,
                        sciName: sciName || '',
                        dateAdded: new Date().toISOString()
                    });
                    result.imported++;
                }
            }
        }

        if (result.notMatched.length > 0) {
            console.warn(`[LifeList] ${result.notMatched.length} species not matched to taxonomy:`, result.notMatched.slice(0, 10));
        }

        // Merge with existing list and save
        if (newSpecies.length > 0) {
            const existingList = this.getLifeList();
            const mergedList = [...existingList, ...newSpecies];
            this._saveList(mergedList);
        }

        return result;
    }

    /**
     * Parse a CSV line, handling quoted values
     * @param {string} line - CSV line
     * @returns {Array} Array of values
     */
    _parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);

        return values;
    }

    /**
     * Generate a fallback species code from a name
     * @param {string} name - Species name
     * @returns {string} Generated code
     */
    _generateFallbackCode(name) {
        return 'user_' + name.toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 20);
    }

    /**
     * Add a single species to the life list
     * @param {Object} species - Species object with speciesCode, comName, sciName
     * @returns {boolean} True if added, false if already exists
     */
    addSpecies(species) {
        if (!species.speciesCode) return false;

        const list = this.getLifeList();
        if (list.some(s => s.speciesCode === species.speciesCode)) {
            return false; // Already exists
        }

        list.push({
            speciesCode: species.speciesCode,
            comName: species.comName || species.speciesCode,
            sciName: species.sciName || '',
            dateAdded: new Date().toISOString()
        });

        this._saveList(list);
        return true;
    }

    /**
     * Remove a species from the life list
     * @param {string} speciesCode - Species code to remove
     * @returns {boolean} True if removed, false if not found
     */
    removeSpecies(speciesCode) {
        const list = this.getLifeList();
        const filtered = list.filter(s => s.speciesCode !== speciesCode);

        if (filtered.length === list.length) {
            return false; // Not found
        }

        this._saveList(filtered);
        return true;
    }

    /**
     * Check if a species is on the life list
     * @param {string} speciesCode - Species code to check
     * @returns {boolean} True if on life list
     */
    isOnLifeList(speciesCode) {
        return this.getLifeListCodes().has(speciesCode);
    }

    /**
     * Get the count of species on the life list
     * @returns {number} Number of species
     */
    getCount() {
        return this.getLifeList().length;
    }

    /**
     * Clear the entire life list
     */
    clear() {
        try {
            localStorage.removeItem(this.storageKey);
            this._invalidateCache();
        } catch (e) {
            console.warn('Could not clear life list from localStorage:', e);
        }
    }

    /**
     * Check if the life list has any species
     * @returns {boolean} True if list is not empty
     */
    hasLifeList() {
        return this.getCount() > 0;
    }

    /**
     * Debug: Print life list contents to console
     */
    debug() {
        const list = this.getLifeList();
        console.log(`[LifeList Debug] Total species: ${list.length}`);
        console.log('[LifeList Debug] First 20 entries:');
        list.slice(0, 20).forEach((s, i) => {
            console.log(`  ${i + 1}. ${s.comName} (code: ${s.speciesCode})`);
        });
        // Check for any user_ prefixed codes (fallback codes)
        const fallbackCodes = list.filter(s => s.speciesCode.startsWith('user_'));
        if (fallbackCodes.length > 0) {
            console.warn(`[LifeList Debug] ${fallbackCodes.length} species with fallback codes (not matched to taxonomy):`);
            fallbackCodes.slice(0, 10).forEach(s => {
                console.warn(`  - ${s.comName} (code: ${s.speciesCode})`);
            });
        }
        return { total: list.length, fallbackCount: fallbackCodes.length };
    }
}
