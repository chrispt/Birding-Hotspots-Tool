/**
 * Local storage management for API keys and favorites
 * API keys are obfuscated using base64 + simple XOR to avoid plain text storage
 */
import { CONFIG } from '../utils/constants.js';

const { STORAGE_KEYS } = CONFIG;

// Simple obfuscation key (not cryptographically secure, but prevents casual viewing)
const OBFUSCATION_KEY = 'BirdingHotspots2024';

/**
 * Obfuscate a string using XOR + base64
 * Note: This is obfuscation, not encryption. It prevents casual viewing but
 * is not secure against determined attackers. For true security, use a backend.
 */
function obfuscate(text) {
    if (!text) return '';
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(
            text.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)
        );
    }
    return btoa(result);
}

/**
 * Deobfuscate a string
 */
function deobfuscate(encoded) {
    if (!encoded) return null;
    try {
        const decoded = atob(encoded);
        let result = '';
        for (let i = 0; i < decoded.length; i++) {
            result += String.fromCharCode(
                decoded.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)
            );
        }
        return result;
    } catch (e) {
        // If decoding fails, the stored value might be in old plain text format
        return null;
    }
}

export const storage = {
    /**
     * Get saved eBird API key (handles both obfuscated and legacy plain text)
     * @returns {string|null} The saved API key or null
     */
    getApiKey() {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.API_KEY);
            if (!stored) return null;

            // Try to deobfuscate first
            const deobfuscated = deobfuscate(stored);
            if (deobfuscated && /^[a-zA-Z0-9]+$/.test(deobfuscated)) {
                return deobfuscated;
            }

            // Fall back to plain text (legacy) and migrate to obfuscated
            if (/^[a-zA-Z0-9]+$/.test(stored)) {
                // Migrate old plain text key to obfuscated format
                this.setApiKey(stored);
                return stored;
            }

            return null;
        } catch (e) {
            console.warn('Could not access localStorage:', e);
            return null;
        }
    },

    /**
     * Save eBird API key (obfuscated)
     * @param {string} key - The API key to save
     */
    setApiKey(key) {
        try {
            localStorage.setItem(STORAGE_KEYS.API_KEY, obfuscate(key));
        } catch (e) {
            console.warn('Could not save to localStorage:', e);
        }
    },

    /**
     * Remove saved API key
     */
    clearApiKey() {
        try {
            localStorage.removeItem(STORAGE_KEYS.API_KEY);
        } catch (e) {
            console.warn('Could not clear localStorage:', e);
        }
    },

    /**
     * Get all saved favorite locations
     * @returns {Array} Array of favorite location objects
     */
    getFavorites() {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.FAVORITES);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.warn('Could not read favorites from localStorage:', e);
            return [];
        }
    },

    /**
     * Add a new favorite location
     * @param {Object} location - Location object with name, address, lat, lng
     * @returns {Object} The saved favorite with generated ID
     */
    addFavorite(location) {
        try {
            const favorites = this.getFavorites();
            const newFavorite = {
                id: Date.now(),
                name: location.name,
                address: location.address || '',
                lat: location.lat,
                lng: location.lng,
                createdAt: new Date().toISOString()
            };
            favorites.push(newFavorite);
            localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
            return newFavorite;
        } catch (e) {
            console.warn('Could not save favorite to localStorage:', e);
            return null;
        }
    },

    /**
     * Remove a favorite location by ID
     * @param {number} id - The favorite ID to remove
     * @returns {boolean} True if removed successfully
     */
    removeFavorite(id) {
        try {
            const favorites = this.getFavorites().filter(f => f.id !== id);
            localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
            return true;
        } catch (e) {
            console.warn('Could not remove favorite from localStorage:', e);
            return false;
        }
    },

    /**
     * Check if storage is available
     * @returns {boolean} True if localStorage is available
     */
    isAvailable() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    },

    /**
     * Get temperature unit preference
     * @returns {string} 'F' for Fahrenheit, 'C' for Celsius
     */
    getTemperatureUnit() {
        try {
            return localStorage.getItem('birding_temp_unit') || 'F';
        } catch (e) {
            return 'F';
        }
    },

    /**
     * Set temperature unit preference
     * @param {string} unit - 'F' or 'C'
     */
    setTemperatureUnit(unit) {
        try {
            localStorage.setItem('birding_temp_unit', unit === 'C' ? 'C' : 'F');
        } catch (e) {
            console.warn('Could not save temperature unit:', e);
        }
    },

    // ==================== Recent Searches ====================

    /**
     * Get recent searches
     * @returns {Array} Array of recent search objects
     */
    getRecentSearches() {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.RECENT_SEARCHES);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.warn('Could not read recent searches from localStorage:', e);
            return [];
        }
    },

    /**
     * Add a recent search (maintains max 5, dedupes by coordinates)
     * @param {Object} search - Search object with displayName, lat, lng
     */
    addRecentSearch(search) {
        try {
            let searches = this.getRecentSearches();

            // Remove duplicate (same coordinates within 0.001 degrees)
            searches = searches.filter(s =>
                Math.abs(s.lat - search.lat) > 0.001 ||
                Math.abs(s.lng - search.lng) > 0.001
            );

            // Add new search at the beginning
            searches.unshift({
                displayName: search.displayName,
                lat: search.lat,
                lng: search.lng,
                timestamp: Date.now()
            });

            // Keep only last 5
            searches = searches.slice(0, 5);

            localStorage.setItem(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(searches));
        } catch (e) {
            console.warn('Could not save recent search to localStorage:', e);
        }
    },

    /**
     * Clear all recent searches
     */
    clearRecentSearches() {
        try {
            localStorage.removeItem(STORAGE_KEYS.RECENT_SEARCHES);
        } catch (e) {
            console.warn('Could not clear recent searches:', e);
        }
    },

    // ==================== Favorite Hotspots ====================

    /**
     * Get all favorite hotspots
     * @returns {Array} Array of favorite hotspot objects
     */
    getFavoriteHotspots() {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.FAVORITE_HOTSPOTS);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.warn('Could not read favorite hotspots from localStorage:', e);
            return [];
        }
    },

    /**
     * Check if a hotspot is favorited
     * @param {string} locId - eBird location ID
     * @returns {boolean}
     */
    isFavoriteHotspot(locId) {
        const favorites = this.getFavoriteHotspots();
        return favorites.some(f => f.locId === locId);
    },

    /**
     * Add a hotspot to favorites
     * @param {Object} hotspot - Hotspot object with locId, name, lat, lng
     * @returns {boolean} Success
     */
    addFavoriteHotspot(hotspot) {
        try {
            const favorites = this.getFavoriteHotspots();

            // Don't add if already exists
            if (favorites.some(f => f.locId === hotspot.locId)) {
                return false;
            }

            favorites.push({
                locId: hotspot.locId,
                name: hotspot.name || hotspot.locName,
                lat: hotspot.lat,
                lng: hotspot.lng,
                addedAt: Date.now()
            });

            localStorage.setItem(STORAGE_KEYS.FAVORITE_HOTSPOTS, JSON.stringify(favorites));
            return true;
        } catch (e) {
            console.warn('Could not save favorite hotspot to localStorage:', e);
            return false;
        }
    },

    /**
     * Remove a hotspot from favorites
     * @param {string} locId - eBird location ID
     * @returns {boolean} Success
     */
    removeFavoriteHotspot(locId) {
        try {
            const favorites = this.getFavoriteHotspots().filter(f => f.locId !== locId);
            localStorage.setItem(STORAGE_KEYS.FAVORITE_HOTSPOTS, JSON.stringify(favorites));
            return true;
        } catch (e) {
            console.warn('Could not remove favorite hotspot from localStorage:', e);
            return false;
        }
    },

    // ==================== Theme Preference ====================

    /**
     * Get theme preference
     * @returns {string|null} 'light', 'dark', or null (auto)
     */
    getTheme() {
        try {
            return localStorage.getItem(STORAGE_KEYS.THEME) || null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Set theme preference
     * @param {string|null} theme - 'light', 'dark', or null to clear (auto)
     */
    setTheme(theme) {
        try {
            if (theme) {
                localStorage.setItem(STORAGE_KEYS.THEME, theme);
            } else {
                localStorage.removeItem(STORAGE_KEYS.THEME);
            }
        } catch (e) {
            console.warn('Could not save theme preference:', e);
        }
    },

    /**
     * Toggle a hotspot's favorite status
     * @param {Object} hotspot - Hotspot object
     * @returns {boolean} New favorite state (true if now favorited)
     */
    toggleFavoriteHotspot(hotspot) {
        if (this.isFavoriteHotspot(hotspot.locId)) {
            this.removeFavoriteHotspot(hotspot.locId);
            return false;
        } else {
            this.addFavoriteHotspot(hotspot);
            return true;
        }
    }
};
