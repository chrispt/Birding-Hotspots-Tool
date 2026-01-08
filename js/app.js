/**
 * Birding Hotspots Finder - Main Application
 */

import { CONFIG, ErrorMessages, ErrorTypes } from './utils/constants.js';
import { validateCoordinates, validateApiKey, validateAddress, validateFavoriteName } from './utils/validators.js';
import { calculateDistance, formatDistance } from './utils/formatters.js';
import { storage } from './services/storage.js';
import { geocodeAddress, getCurrentPosition } from './api/geocoding.js';
import { reverseGeocode } from './api/reverse-geo.js';
import { EBirdAPI, processObservations } from './api/ebird.js';
import { generatePDFReport, downloadPDF } from './services/pdf-generator.js';

/**
 * Main application class
 */
class BirdingHotspotsApp {
    constructor() {
        this.ebirdApi = null;
        this.currentLocation = null;
        this.isProcessing = false;

        // Cache DOM elements
        this.elements = {
            // Input mode
            inputModeRadios: document.querySelectorAll('[name="inputMode"]'),
            addressInput: document.getElementById('addressInput'),
            gpsInput: document.getElementById('gpsInput'),
            address: document.getElementById('address'),
            latitude: document.getElementById('latitude'),
            longitude: document.getElementById('longitude'),
            useCurrentLocation: document.getElementById('useCurrentLocation'),

            // API key
            apiKey: document.getElementById('apiKey'),
            toggleApiKey: document.getElementById('toggleApiKey'),
            eyeIcon: document.getElementById('eyeIcon'),
            rememberKey: document.getElementById('rememberKey'),

            // Sort options
            sortMethodRadios: document.querySelectorAll('[name="sortMethod"]'),

            // Favorites
            favoritesList: document.getElementById('favoritesList'),
            saveFavorite: document.getElementById('saveFavorite'),
            saveFavoriteModal: document.getElementById('saveFavoriteModal'),
            favoriteName: document.getElementById('favoriteName'),
            cancelSaveFavorite: document.getElementById('cancelSaveFavorite'),
            confirmSaveFavorite: document.getElementById('confirmSaveFavorite'),

            // Generate
            generateReport: document.getElementById('generateReport'),
            errorMessage: document.getElementById('errorMessage'),

            // Loading
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingStatus: document.getElementById('loadingStatus'),
            progressFill: document.getElementById('progressFill')
        };

        this.initializeEventListeners();
        this.loadSavedData();
    }

    /**
     * Set up all event listeners
     */
    initializeEventListeners() {
        // Input mode toggle
        this.elements.inputModeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.toggleInputMode(radio.value));
        });

        // Current location button
        this.elements.useCurrentLocation.addEventListener('click', () => this.handleUseCurrentLocation());

        // API key toggle visibility
        this.elements.toggleApiKey.addEventListener('click', () => this.toggleApiKeyVisibility());

        // Remember API key checkbox
        this.elements.rememberKey.addEventListener('change', (e) => this.handleRememberKeyChange(e.target.checked));

        // Favorites
        this.elements.saveFavorite.addEventListener('click', () => this.showSaveFavoriteModal());
        this.elements.cancelSaveFavorite.addEventListener('click', () => this.hideSaveFavoriteModal());
        this.elements.confirmSaveFavorite.addEventListener('click', () => this.handleSaveFavorite());
        this.elements.saveFavoriteModal.querySelector('.modal-backdrop').addEventListener('click', () => this.hideSaveFavoriteModal());

        // Generate report
        this.elements.generateReport.addEventListener('click', () => this.handleGenerateReport());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideSaveFavoriteModal();
            }
            if (e.key === 'Enter' && !this.elements.saveFavoriteModal.classList.contains('hidden')) {
                this.handleSaveFavorite();
            }
        });
    }

    /**
     * Load saved data from localStorage
     */
    loadSavedData() {
        // Load saved API key
        const savedKey = storage.getApiKey();
        if (savedKey) {
            this.elements.apiKey.value = savedKey;
            this.elements.rememberKey.checked = true;
        }

        // Load favorites
        this.renderFavorites();
    }

    /**
     * Toggle between address and GPS input modes
     */
    toggleInputMode(mode) {
        if (mode === 'address') {
            this.elements.addressInput.classList.remove('hidden');
            this.elements.gpsInput.classList.add('hidden');
        } else {
            this.elements.addressInput.classList.add('hidden');
            this.elements.gpsInput.classList.remove('hidden');
        }
    }

    /**
     * Toggle API key visibility
     */
    toggleApiKeyVisibility() {
        const isPassword = this.elements.apiKey.type === 'password';
        this.elements.apiKey.type = isPassword ? 'text' : 'password';

        // Update icon
        const eyePath = isPassword
            ? 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z'
            : 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z';

        this.elements.eyeIcon.innerHTML = `<path fill="currentColor" d="${eyePath}"/>`;
    }

    /**
     * Handle remember API key toggle
     */
    handleRememberKeyChange(remember) {
        if (remember) {
            const key = this.elements.apiKey.value.trim();
            if (key) {
                storage.setApiKey(key);
            }
        } else {
            storage.clearApiKey();
        }
    }

    /**
     * Handle use current location button
     */
    async handleUseCurrentLocation() {
        this.elements.useCurrentLocation.disabled = true;
        this.elements.useCurrentLocation.textContent = 'Getting location...';

        try {
            const position = await getCurrentPosition();

            // Switch to GPS mode and fill in coordinates
            document.querySelector('[name="inputMode"][value="gps"]').checked = true;
            this.toggleInputMode('gps');

            this.elements.latitude.value = position.lat.toFixed(6);
            this.elements.longitude.value = position.lng.toFixed(6);

            this.currentLocation = position;

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.elements.useCurrentLocation.disabled = false;
            this.elements.useCurrentLocation.innerHTML = `
                <svg viewBox="0 0 24 24" width="18" height="18">
                    <path fill="currentColor" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                </svg>
                Use My Current Location
            `;
        }
    }

    /**
     * Show the save favorite modal
     */
    showSaveFavoriteModal() {
        this.elements.favoriteName.value = '';
        this.elements.saveFavoriteModal.classList.remove('hidden');
        this.elements.favoriteName.focus();
    }

    /**
     * Hide the save favorite modal
     */
    hideSaveFavoriteModal() {
        this.elements.saveFavoriteModal.classList.add('hidden');
    }

    /**
     * Handle saving a favorite location
     */
    async handleSaveFavorite() {
        const nameValidation = validateFavoriteName(this.elements.favoriteName.value);
        if (!nameValidation.valid) {
            this.showError(nameValidation.error);
            return;
        }

        try {
            const location = await this.getCoordinates();

            storage.addFavorite({
                name: nameValidation.name,
                address: location.address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
                lat: location.lat,
                lng: location.lng
            });

            this.renderFavorites();
            this.hideSaveFavoriteModal();
        } catch (error) {
            this.showError(error.message);
        }
    }

    /**
     * Render the favorites list
     */
    renderFavorites() {
        const favorites = storage.getFavorites();

        if (favorites.length === 0) {
            this.elements.favoritesList.innerHTML = '<p class="no-favorites">No saved locations yet</p>';
            return;
        }

        this.elements.favoritesList.innerHTML = favorites.map(fav => `
            <div class="favorite-item" data-id="${fav.id}">
                <div class="favorite-info" data-lat="${fav.lat}" data-lng="${fav.lng}" data-address="${fav.address || ''}">
                    <span class="favorite-name">${this.escapeHtml(fav.name)}</span>
                    <span class="favorite-address">${this.escapeHtml(fav.address || `${fav.lat.toFixed(4)}, ${fav.lng.toFixed(4)}`)}</span>
                </div>
                <button class="favorite-delete" title="Remove">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </div>
        `).join('');

        // Add click handlers
        this.elements.favoritesList.querySelectorAll('.favorite-item').forEach(item => {
            const info = item.querySelector('.favorite-info');
            const deleteBtn = item.querySelector('.favorite-delete');

            // Click on favorite to use it
            info.addEventListener('click', () => {
                const lat = parseFloat(info.dataset.lat);
                const lng = parseFloat(info.dataset.lng);

                document.querySelector('[name="inputMode"][value="gps"]').checked = true;
                this.toggleInputMode('gps');

                this.elements.latitude.value = lat.toFixed(6);
                this.elements.longitude.value = lng.toFixed(6);
            });

            // Delete button
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(item.dataset.id);
                storage.removeFavorite(id);
                this.renderFavorites();
            });
        });
    }

    /**
     * Get coordinates from current input
     */
    async getCoordinates() {
        const inputMode = document.querySelector('[name="inputMode"]:checked').value;

        if (inputMode === 'address') {
            const addressValidation = validateAddress(this.elements.address.value);
            if (!addressValidation.valid) {
                throw new Error(addressValidation.error);
            }

            const result = await geocodeAddress(addressValidation.address);
            return {
                lat: result.lat,
                lng: result.lng,
                address: result.address || addressValidation.address
            };
        } else {
            const coordsValidation = validateCoordinates(
                this.elements.latitude.value,
                this.elements.longitude.value
            );

            if (!coordsValidation.valid) {
                throw new Error(coordsValidation.error);
            }

            // Try to get address for GPS coordinates
            let address = `${coordsValidation.lat.toFixed(4)}, ${coordsValidation.lng.toFixed(4)}`;
            try {
                const reverseResult = await reverseGeocode(coordsValidation.lat, coordsValidation.lng);
                if (reverseResult.address && reverseResult.address !== 'Address unavailable') {
                    address = reverseResult.address;
                }
            } catch (e) {
                // Keep the coordinate string as address
            }

            return {
                lat: coordsValidation.lat,
                lng: coordsValidation.lng,
                address: address
            };
        }
    }

    /**
     * Main report generation handler
     */
    async handleGenerateReport() {
        if (this.isProcessing) return;

        this.hideError();
        this.isProcessing = true;

        try {
            // Validate API key
            const apiKeyValidation = validateApiKey(this.elements.apiKey.value);
            if (!apiKeyValidation.valid) {
                throw new Error(apiKeyValidation.error);
            }

            // Save API key if remember is checked
            if (this.elements.rememberKey.checked) {
                storage.setApiKey(apiKeyValidation.apiKey);
            }

            this.showLoading('Validating inputs...', 0);

            // Get coordinates
            this.updateLoading('Getting location...', 5);
            const origin = await this.getCoordinates();
            this.currentLocation = origin;

            // Initialize eBird API
            this.ebirdApi = new EBirdAPI(apiKeyValidation.apiKey);

            // Test API key
            this.updateLoading('Verifying API key...', 10);

            // Fetch nearby hotspots
            this.updateLoading('Fetching nearby hotspots...', 15);
            let hotspots = await this.ebirdApi.getNearbyHotspots(
                origin.lat,
                origin.lng,
                CONFIG.DEFAULT_SEARCH_RADIUS
            );

            if (!hotspots || hotspots.length === 0) {
                throw new Error(ErrorMessages[ErrorTypes.NO_HOTSPOTS]);
            }

            // Limit to configured max
            hotspots = hotspots.slice(0, CONFIG.MAX_HOTSPOTS);

            // Fetch notable species in the area
            this.updateLoading('Fetching notable species...', 25);
            let notableSpecies = new Set();
            try {
                const notable = await this.ebirdApi.getNotableObservationsNearby(
                    origin.lat,
                    origin.lng,
                    CONFIG.DEFAULT_SEARCH_RADIUS,
                    CONFIG.DEFAULT_DAYS_BACK
                );
                notableSpecies = new Set(notable.map(o => o.speciesCode));
            } catch (e) {
                console.warn('Could not fetch notable species:', e);
            }

            // Enrich hotspot data
            this.updateLoading('Loading hotspot details...', 30);
            const enrichedHotspots = await this.enrichHotspots(hotspots, origin, notableSpecies);

            // Sort based on user selection
            const sortMethod = document.querySelector('[name="sortMethod"]:checked').value;
            const sortedHotspots = this.sortHotspots(enrichedHotspots, sortMethod, origin);

            // Generate PDF
            this.updateLoading('Generating PDF report...', 85);
            const pdf = await generatePDFReport({
                origin,
                hotspots: sortedHotspots,
                sortMethod,
                generatedDate: new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })
            }, (message, percent) => {
                this.updateLoading(message, 85 + (percent * 0.15));
            });

            // Download PDF
            downloadPDF(pdf);

            this.hideLoading();

        } catch (error) {
            console.error('Report generation error:', error);
            this.hideLoading();
            this.showError(error.message || 'An unexpected error occurred');
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Enrich hotspots with additional data
     */
    async enrichHotspots(hotspots, origin, notableSpecies) {
        const enriched = [];

        for (let i = 0; i < hotspots.length; i++) {
            const hotspot = hotspots[i];
            const progress = 30 + ((i / hotspots.length) * 50);
            this.updateLoading(`Processing hotspot ${i + 1} of ${hotspots.length}...`, progress);

            // Get recent observations
            let observations = [];
            try {
                observations = await this.ebirdApi.getRecentObservations(
                    hotspot.locId,
                    CONFIG.DEFAULT_DAYS_BACK
                );
            } catch (e) {
                console.warn(`Could not fetch observations for ${hotspot.locId}:`, e);
            }

            // Get address via reverse geocoding
            let address = 'Address unavailable';
            try {
                const addrResult = await reverseGeocode(hotspot.lat, hotspot.lng);
                if (addrResult.address && addrResult.address !== 'Address unavailable') {
                    address = addrResult.address;
                }
            } catch (e) {
                console.warn('Reverse geocoding failed:', e);
            }

            // Calculate distance
            const distance = calculateDistance(origin.lat, origin.lng, hotspot.lat, hotspot.lng);

            // Process bird list
            const birds = processObservations(observations, notableSpecies);

            enriched.push({
                locId: hotspot.locId,
                name: hotspot.locName,
                lat: hotspot.lat,
                lng: hotspot.lng,
                speciesCount: birds.length,
                address,
                distance,
                birds
            });
        }

        return enriched;
    }

    /**
     * Sort hotspots based on method
     */
    sortHotspots(hotspots, method, origin) {
        if (method === 'species') {
            return [...hotspots].sort((a, b) => b.speciesCount - a.speciesCount);
        } else {
            return [...hotspots].sort((a, b) => a.distance - b.distance);
        }
    }

    /**
     * Show loading overlay
     */
    showLoading(message, percent) {
        this.elements.loadingOverlay.classList.remove('hidden');
        this.updateLoading(message, percent);
    }

    /**
     * Update loading status
     */
    updateLoading(message, percent) {
        this.elements.loadingStatus.textContent = message;
        this.elements.progressFill.style.width = `${percent}%`;
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        this.elements.loadingOverlay.classList.add('hidden');
    }

    /**
     * Show error message
     */
    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.classList.remove('hidden');

        // Scroll to error
        this.elements.errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /**
     * Hide error message
     */
    hideError() {
        this.elements.errorMessage.classList.add('hidden');
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new BirdingHotspotsApp();
});
