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
    }
};
