/**
 * Birding Hotspots Finder - Main Application
 */

import { CONFIG, ErrorMessages, ErrorTypes } from './utils/constants.js';
import { validateCoordinates, validateApiKey, validateAddress, validateFavoriteName } from './utils/validators.js';
import { calculateDistance, formatDistance, formatDuration, getGoogleMapsSearchUrl } from './utils/formatters.js';
import { createSVGIcon, ICONS } from './utils/icons.js';
import { clearElement } from './utils/dom-helpers.js';
import { storage } from './services/storage.js';
import { geocodeAddress, getCurrentPosition } from './api/geocoding.js';
import { reverseGeocode, batchReverseGeocode } from './api/reverse-geo.js';
import { EBirdAPI, processObservations } from './api/ebird.js';
import { generatePDFReport, downloadPDF } from './services/pdf-generator.js';
import { getDrivingRoutes } from './api/routing.js';
import { getWeatherForLocations, getOverallBirdingConditions, getBirdingConditionScore } from './api/weather.js';
import { SpeciesSearch } from './services/species-search.js';
import { getSeasonalInsights, getOptimalBirdingTimes, getCurrentSeason } from './services/seasonal-insights.js';
import { buildItinerary, formatItineraryDuration, formatItineraryTime } from './services/itinerary-builder.js';
import { generateGPX, downloadGPX } from './services/gpx-generator.js';

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

            // Search range
            searchRangeRadios: document.querySelectorAll('[name="searchRange"]'),

            // Hotspots count
            hotspotsCountRadios: document.querySelectorAll('[name="hotspotsCount"]'),

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
            progressFill: document.getElementById('progressFill'),
            cancelSearch: document.getElementById('cancelSearch'),

            // Map preview
            mapPreviewSection: document.getElementById('mapPreviewSection'),
            mapPreviewContainer: document.getElementById('mapPreviewContainer'),
            openInGoogleMaps: document.getElementById('openInGoogleMaps'),

            // Address error
            addressError: document.getElementById('addressError'),

            // Results section
            resultsSection: document.getElementById('resultsSection'),
            resultsMeta: document.getElementById('resultsMeta'),
            hotspotCards: document.getElementById('hotspotCards'),
            newSearchBtn: document.getElementById('newSearchBtn'),
            exportPdfBtn: document.getElementById('exportPdfBtn'),
            sortBySpecies: document.getElementById('sortBySpecies'),
            sortByDistance: document.getElementById('sortByDistance'),
            sortByDriving: document.getElementById('sortByDriving'),
            resultsMap: document.getElementById('resultsMap'),
            rareBirdAlert: document.getElementById('rareBirdAlert'),
            weatherSummary: document.getElementById('weatherSummary'),
            migrationAlert: document.getElementById('migrationAlert'),
            // Species search elements
            hotspotModeBtn: document.getElementById('hotspotModeBtn'),
            speciesModeBtn: document.getElementById('speciesModeBtn'),
            speciesSearchPanel: document.getElementById('speciesSearchPanel'),
            speciesSearchInput: document.getElementById('speciesSearchInput'),
            speciesDropdown: document.getElementById('speciesDropdown'),
            selectedSpecies: document.getElementById('selectedSpecies'),
            sortOptionsSection: document.getElementById('sortOptionsSection'),
            // Itinerary elements
            buildItineraryBtn: document.getElementById('buildItineraryBtn'),
            itineraryPanel: document.getElementById('itineraryPanel'),
            closeItineraryPanel: document.getElementById('closeItineraryPanel'),
            endLocationSelect: document.getElementById('endLocationSelect'),
            endLocationInputs: document.getElementById('endLocationInputs'),
            endAddress: document.getElementById('endAddress'),
            maxStops: document.getElementById('maxStops'),
            maxStopsValue: document.getElementById('maxStopsValue'),
            generateItinerary: document.getElementById('generateItinerary'),
            itineraryResults: document.getElementById('itineraryResults'),
            itinerarySummary: document.getElementById('itinerarySummary'),
            itineraryStops: document.getElementById('itineraryStops'),
            exportItineraryPdf: document.getElementById('exportItineraryPdf'),
            exportItineraryGpx: document.getElementById('exportItineraryGpx'),
            backToResults: document.getElementById('backToResults')
        };

        // Temperature unit preference (true = Fahrenheit, false = Celsius)
        this.useFahrenheit = storage.getTemperatureUnit() !== 'C';

        // Species search
        this.speciesSearch = null; // Initialized when API key is available
        this.selectedSpeciesData = null;
        this.searchMode = 'hotspot'; // 'hotspot' or 'species'
        this.speciesSearchDebounceTimer = null;

        // Debounce timer for address input
        this.addressDebounceTimer = null;

        // Store results for PDF export
        this.currentResults = null;
        this.currentSortMethod = null;

        // Store notable observations for rare bird alerts
        this.notableObservations = [];

        // Leaflet map instances
        this.previewMap = null;
        this.previewMarker = null;
        this.resultsMapInstance = null;
        this.resultsMarkers = [];

        // Track if address has been validated
        this.addressValidated = false;
        this.validatedCoords = null;

        // Track if search was cancelled
        this.searchCancelled = false;

        // Itinerary state
        this.currentItinerary = null;
        this.itineraryRouteLine = null;

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

        // Cancel search
        this.elements.cancelSearch.addEventListener('click', () => this.handleCancelSearch());

        // Results section buttons
        this.elements.newSearchBtn.addEventListener('click', () => this.handleNewSearch());
        this.elements.exportPdfBtn.addEventListener('click', () => this.handleExportPdf());

        // Sort toggle buttons
        this.elements.sortBySpecies.addEventListener('click', () => this.handleSortChange('species'));
        this.elements.sortByDistance.addEventListener('click', () => this.handleSortChange('distance'));
        this.elements.sortByDriving.addEventListener('click', () => this.handleSortChange('driving'));

        // Event delegation for species toggles
        this.elements.hotspotCards.addEventListener('click', (e) => {
            const toggle = e.target.closest('.species-toggle');
            if (toggle) {
                this.toggleSpeciesList(toggle);
            }
        });

        // Address input change - update map preview with debounce
        this.elements.address.addEventListener('input', () => this.handleAddressInputChange());
        this.elements.address.addEventListener('blur', () => this.handleAddressBlur());

        // Initialize event delegation for favorites (single listener, no memory leak)
        this.initializeFavoritesDelegation();

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideSaveFavoriteModal();
                this.hideSpeciesDropdown();
            }
            if (e.key === 'Enter' && !this.elements.saveFavoriteModal.classList.contains('hidden')) {
                this.handleSaveFavorite();
            }
        });

        // Search mode toggle
        this.elements.hotspotModeBtn.addEventListener('click', () => this.setSearchMode('hotspot'));
        this.elements.speciesModeBtn.addEventListener('click', () => this.setSearchMode('species'));

        // Species search input
        this.elements.speciesSearchInput.addEventListener('input', () => this.handleSpeciesSearchInput());
        this.elements.speciesSearchInput.addEventListener('focus', () => this.handleSpeciesSearchFocus());

        // Click outside to close species dropdown
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.species-search-container')) {
                this.hideSpeciesDropdown();
            }
        });

        // Event delegation for species dropdown items (avoids memory leak from individual listeners)
        this.elements.speciesDropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.species-option');
            if (option) {
                const species = {
                    speciesCode: option.dataset.code,
                    commonName: option.dataset.name,
                    scientificName: option.dataset.scientific
                };
                this.selectSpecies(species);
            }
        });

        // Itinerary builder events
        this.elements.buildItineraryBtn.addEventListener('click', () => this.toggleItineraryPanel());
        this.elements.closeItineraryPanel.addEventListener('click', () => this.hideItineraryPanel());
        this.elements.endLocationSelect.addEventListener('change', () => this.handleEndLocationChange());
        this.elements.maxStops.addEventListener('input', () => {
            this.elements.maxStopsValue.textContent = this.elements.maxStops.value;
        });
        this.elements.generateItinerary.addEventListener('click', () => this.handleGenerateItinerary());
        this.elements.exportItineraryPdf.addEventListener('click', () => this.handleExportItineraryPdf());
        this.elements.exportItineraryGpx.addEventListener('click', () => this.handleExportItineraryGpx());
        this.elements.backToResults.addEventListener('click', () => this.handleBackToResults());
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

        // Update icon using safe DOM manipulation
        const eyePath = isPassword
            ? 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z'
            : 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z';

        // Clear and rebuild SVG path safely
        const svg = this.elements.eyeIcon;
        clearElement(svg);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('d', eyePath);
        svg.appendChild(path);
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

            // Reverse geocode to get address
            this.elements.useCurrentLocation.textContent = 'Finding address...';
            let address = '';
            try {
                const reverseResult = await reverseGeocode(position.lat, position.lng);
                if (reverseResult.address && reverseResult.address !== 'Address unavailable') {
                    address = reverseResult.address;
                }
            } catch (e) {
                console.warn('Reverse geocoding failed:', e);
            }

            // Switch to Address mode and fill in the address
            document.querySelector('[name="inputMode"][value="address"]').checked = true;
            this.toggleInputMode('address');

            // Fill in the address field
            if (address) {
                this.elements.address.value = address;
            } else {
                // Fallback to coordinates if no address found
                this.elements.address.value = `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
            }

            this.currentLocation = {
                lat: position.lat,
                lng: position.lng,
                address: address
            };

            // Show map preview for verification
            this.showMapPreview(position.lat, position.lng);

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.elements.useCurrentLocation.disabled = false;
            this.resetLocationButton();
        }
    }

    /**
     * Reset the location button to its default state using safe DOM manipulation
     */
    resetLocationButton() {
        const btn = this.elements.useCurrentLocation;
        // Clear existing content safely
        clearElement(btn);
        btn.appendChild(createSVGIcon('myLocation', 18));
        btn.appendChild(document.createTextNode(' Use My Current Location'));
    }

    /**
     * Handle address input change with debounce
     */
    handleAddressInputChange() {
        // Clear any existing timer
        if (this.addressDebounceTimer) {
            clearTimeout(this.addressDebounceTimer);
        }

        // Clear validation state and error when user types
        this.addressValidated = false;
        this.validatedCoords = null;
        this.clearAddressError();
    }

    /**
     * Handle address input blur - geocode and show map
     */
    async handleAddressBlur() {
        const address = this.elements.address.value.trim();

        if (address.length < 3) {
            this.hideMapPreview();
            this.addressValidated = false;
            this.validatedCoords = null;
            return;
        }

        // Show "verifying" feedback
        this.elements.addressError.textContent = 'Verifying address...';
        this.elements.addressError.classList.remove('hidden');
        this.elements.addressError.style.color = 'var(--text-secondary)';
        this.elements.address.classList.remove('error');

        try {
            const result = await geocodeAddress(address);
            this.addressValidated = true;
            this.validatedCoords = { lat: result.lat, lng: result.lng };
            this.clearAddressError();
            this.showMapPreview(result.lat, result.lng);
        } catch (error) {
            // Show error on blur if geocoding fails
            this.addressValidated = false;
            this.validatedCoords = null;
            this.elements.addressError.style.color = ''; // Reset to default (error color)
            this.showAddressError('Could not find this address. Please check and try again.');
            this.hideMapPreview();
        }
    }

    /**
     * Show inline address error
     */
    showAddressError(message) {
        this.elements.addressError.textContent = message;
        this.elements.addressError.classList.remove('hidden');
        this.elements.address.classList.add('error');
    }

    /**
     * Clear inline address error
     */
    clearAddressError() {
        this.elements.addressError.textContent = '';
        this.elements.addressError.classList.add('hidden');
        this.elements.addressError.style.color = '';
        this.elements.address.classList.remove('error');
    }

    /**
     * Show the map preview with Leaflet/OpenStreetMap
     */
    showMapPreview(lat, lng) {
        // Show the map preview section first
        this.elements.mapPreviewSection.classList.remove('hidden');

        // Update "Open in Google Maps" link (using secure URL construction)
        this.elements.openInGoogleMaps.href = getGoogleMapsSearchUrl(lat, lng);

        // Initialize or update Leaflet map
        if (!this.previewMap) {
            // Create new map instance
            this.previewMap = L.map(this.elements.mapPreviewContainer).setView([lat, lng], 15);

            // Add OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(this.previewMap);

            // Add marker
            this.previewMarker = L.marker([lat, lng]).addTo(this.previewMap);
        } else {
            // Update existing map
            this.previewMap.setView([lat, lng], 15);

            // Update marker position
            if (this.previewMarker) {
                this.previewMarker.setLatLng([lat, lng]);
            } else {
                this.previewMarker = L.marker([lat, lng]).addTo(this.previewMap);
            }
        }

        // Force map to recalculate size (needed when container was hidden)
        setTimeout(() => {
            if (this.previewMap) {
                this.previewMap.invalidateSize();
            }
        }, 100);
    }

    /**
     * Hide the map preview and clean up resources
     */
    hideMapPreview() {
        this.elements.mapPreviewSection.classList.add('hidden');
        // Destroy map instance to free memory
        if (this.previewMap) {
            this.previewMap.remove();
            this.previewMap = null;
            this.previewMarker = null;
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
            this.showSuccessToast('Location saved!');
        } catch (error) {
            this.showError(error.message);
        }
    }

    /**
     * Initialize event delegation for favorites list (call once during setup)
     */
    initializeFavoritesDelegation() {
        this.elements.favoritesList.addEventListener('click', (e) => {
            const item = e.target.closest('.favorite-item');
            if (!item) return;

            const deleteBtn = e.target.closest('.favorite-delete');
            if (deleteBtn) {
                e.stopPropagation();
                const name = item.querySelector('.favorite-name')?.textContent || 'this location';
                if (confirm(`Delete "${name}" from saved locations?`)) {
                    const id = parseInt(item.dataset.id, 10);
                    storage.removeFavorite(id);
                    this.renderFavorites();
                }
                return;
            }

            const info = item.querySelector('.favorite-info');
            if (info) {
                const lat = parseFloat(info.dataset.lat);
                const lng = parseFloat(info.dataset.lng);
                const address = info.dataset.address;

                // Switch to Address mode and fill in the address
                document.querySelector('[name="inputMode"][value="address"]').checked = true;
                this.toggleInputMode('address');

                // Use the saved address or coordinates
                this.elements.address.value = address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

                // Show map preview for verification
                this.showMapPreview(lat, lng);
            }
        });
    }

    /**
     * Render the favorites list using safe DOM manipulation
     */
    renderFavorites() {
        const favorites = storage.getFavorites();
        const container = this.elements.favoritesList;

        // Clear existing content safely
        clearElement(container);

        if (favorites.length === 0) {
            const p = document.createElement('p');
            p.className = 'no-favorites';
            p.textContent = 'No saved locations yet';
            container.appendChild(p);
            return;
        }

        favorites.forEach(fav => {
            const item = document.createElement('div');
            item.className = 'favorite-item';
            item.dataset.id = fav.id;

            const info = document.createElement('div');
            info.className = 'favorite-info';
            info.dataset.lat = fav.lat;
            info.dataset.lng = fav.lng;
            info.dataset.address = fav.address || '';

            const name = document.createElement('span');
            name.className = 'favorite-name';
            name.textContent = fav.name;

            const address = document.createElement('span');
            address.className = 'favorite-address';
            address.textContent = fav.address || `${fav.lat.toFixed(4)}, ${fav.lng.toFixed(4)}`;

            info.appendChild(name);
            info.appendChild(address);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'favorite-delete';
            deleteBtn.title = 'Remove';

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('width', '18');
            svg.setAttribute('height', '18');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('fill', 'currentColor');
            path.setAttribute('d', 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z');
            svg.appendChild(path);
            deleteBtn.appendChild(svg);

            item.appendChild(info);
            item.appendChild(deleteBtn);
            container.appendChild(item);
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
     * Get selected search range in km
     */
    getSearchRange() {
        const selected = document.querySelector('[name="searchRange"]:checked');
        return selected ? parseInt(selected.value, 10) : 50; // Default 50km (max)
    }

    /**
     * Main report generation handler
     */
    async handleGenerateReport() {
        if (this.isProcessing) return;

        this.hideError();
        this.isProcessing = true;
        this.searchCancelled = false;

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

            // Initialize eBird API
            this.ebirdApi = new EBirdAPI(apiKeyValidation.apiKey);

            // Delegate to species search if in species mode
            if (this.searchMode === 'species') {
                await this.handleSpeciesSearch();
                return;
            }

            // Validate address if in address mode
            const inputMode = document.querySelector('[name="inputMode"]:checked').value;
            if (inputMode === 'address') {
                const address = this.elements.address.value.trim();
                if (address.length < 3) {
                    this.showAddressError('Please enter an address.');
                    this.isProcessing = false;
                    return;
                }

                // If address hasn't been validated yet, try to validate it now
                if (!this.addressValidated) {
                    try {
                        const result = await geocodeAddress(address);
                        this.addressValidated = true;
                        this.validatedCoords = { lat: result.lat, lng: result.lng };
                        this.clearAddressError();
                    } catch (error) {
                        this.showAddressError('Could not find this address. Please check and try again.');
                        this.isProcessing = false;
                        return;
                    }
                }
            }

            this.showLoading('Validating inputs...', 0);

            // Get coordinates
            this.updateLoading('Getting location...', 5);
            const origin = await this.getCoordinates();
            this.currentLocation = origin;

            // Test API key
            this.updateLoading('Verifying API key...', 10);

            // Fetch nearby hotspots
            this.updateLoading('Fetching nearby hotspots...', 15);
            const searchRange = this.getSearchRange();
            let hotspots = await this.ebirdApi.getNearbyHotspots(
                origin.lat,
                origin.lng,
                searchRange,
                CONFIG.DEFAULT_DAYS_BACK
            );

            if (this.searchCancelled) {
                this.isProcessing = false;
                return;
            }

            if (!hotspots || hotspots.length === 0) {
                throw new Error(ErrorMessages[ErrorTypes.NO_HOTSPOTS]);
            }

            // Sort by distance from origin before limiting (eBird API doesn't guarantee order)
            hotspots.sort((a, b) => {
                const distA = calculateDistance(origin.lat, origin.lng, a.lat, a.lng);
                const distB = calculateDistance(origin.lat, origin.lng, b.lat, b.lng);
                return distA - distB;
            });

            // Limit to user-selected count
            const hotspotsCount = parseInt(document.querySelector('[name="hotspotsCount"]:checked').value, 10);
            hotspots = hotspots.slice(0, hotspotsCount);

            // Fetch notable species in the area
            this.updateLoading('Fetching notable species...', 25);
            let notableSpecies = new Set();
            this.notableObservations = [];
            try {
                const notable = await this.ebirdApi.getNotableObservationsNearby(
                    origin.lat,
                    origin.lng,
                    searchRange,
                    CONFIG.DEFAULT_DAYS_BACK
                );
                // Store full notable observations for rare bird alerts
                this.notableObservations = notable;
                notableSpecies = new Set(notable.map(o => o.speciesCode));
            } catch (e) {
                console.warn('Could not fetch notable species:', e);
            }

            if (this.searchCancelled) {
                this.isProcessing = false;
                return;
            }

            // Enrich hotspot data
            this.updateLoading('Loading hotspot details...', 30);
            let enrichedHotspots = await this.enrichHotspots(hotspots, origin, notableSpecies);

            if (this.searchCancelled) {
                this.isProcessing = false;
                return;
            }

            // Filter out hotspots with zero species observed
            enrichedHotspots = enrichedHotspots.filter(h => h.speciesCount > 0);

            if (enrichedHotspots.length === 0) {
                throw new Error('No hotspots with recent bird observations found in this area. Try expanding your search range.');
            }

            // Sort based on user selection
            const sortMethod = document.querySelector('[name="sortMethod"]:checked').value;
            const sortedHotspots = this.sortHotspots(enrichedHotspots, sortMethod, origin);

            // Store results for later PDF export
            this.currentResults = {
                origin,
                hotspots: sortedHotspots,
                sortMethod,
                generatedDate: new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })
            };
            this.currentSortMethod = sortMethod;

            // Display results on screen
            this.updateLoading('Preparing results display...', 90);
            this.displayResults(this.currentResults);

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
     * Enrich hotspots with additional data (parallelized for speed)
     */
    async enrichHotspots(hotspots, origin, notableSpecies) {
        this.updateLoading('Fetching hotspot observations...', 35);

        // Fetch all observations in parallel
        const observationsPromises = hotspots.map(hotspot =>
            this.ebirdApi.getRecentObservations(hotspot.locId, CONFIG.DEFAULT_DAYS_BACK)
                .catch(e => {
                    console.warn(`Could not fetch observations for ${hotspot.locId}:`, e);
                    return [];
                })
        );

        // Wait for all observation requests
        this.updateLoading('Processing observations...', 50);
        const allObservations = await Promise.all(observationsPromises);

        // Fetch addresses with rate limiting to avoid 429 errors
        this.updateLoading('Fetching hotspot addresses...', 55);
        const locations = hotspots.map(h => ({ lat: h.lat, lng: h.lng }));
        const allAddresses = await batchReverseGeocode(locations, (current, total) => {
            const progress = 55 + (current / total) * 15; // 55% to 70%
            this.updateLoading(`Fetching address ${current}/${total}...`, progress);
        });

        // Fetch driving distances
        this.updateLoading('Calculating driving distances...', 70);
        const drivingRoutes = await getDrivingRoutes(origin.lat, origin.lng, locations);

        // Fetch weather data
        this.updateLoading('Fetching weather data...', 80);
        let weatherData = [];
        try {
            weatherData = await getWeatherForLocations(locations, (current, total) => {
                const progress = 80 + (current / total) * 10; // 80% to 90%
                this.updateLoading(`Fetching weather ${current}/${total}...`, progress);
            });
        } catch (e) {
            console.warn('Could not fetch weather data:', e);
        }

        this.updateLoading('Building hotspot details...', 92);

        // Process results (fast, no waiting)
        return hotspots.map((hotspot, i) => {
            const observations = allObservations[i];
            const addrResult = allAddresses[i];
            const distance = calculateDistance(origin.lat, origin.lng, hotspot.lat, hotspot.lng);
            const birds = processObservations(observations, notableSpecies);
            const drivingRoute = drivingRoutes[i];
            const weather = weatherData[i] || null;

            return {
                locId: hotspot.locId,
                name: hotspot.locName,
                lat: hotspot.lat,
                lng: hotspot.lng,
                speciesCount: birds.length,
                address: addrResult.address || 'Address unavailable',
                distance,
                drivingDistance: drivingRoute?.distance ?? null,
                drivingDuration: drivingRoute?.duration ?? null,
                birds,
                weather
            };
        });
    }

    /**
     * Sort hotspots based on method
     */
    sortHotspots(hotspots, method, origin) {
        if (method === 'species') {
            return [...hotspots].sort((a, b) => b.speciesCount - a.speciesCount);
        } else if (method === 'driving') {
            // Sort by driving distance, fall back to straight-line if unavailable
            return [...hotspots].sort((a, b) => {
                const distA = a.drivingDistance ?? a.distance;
                const distB = b.drivingDistance ?? b.distance;
                return distA - distB;
            });
        } else {
            // Sort by straight-line distance
            return [...hotspots].sort((a, b) => a.distance - b.distance);
        }
    }

    /**
     * Display results on screen
     * @param {Object} data - Results data object
     */
    displayResults(data) {
        const { origin, hotspots, sortMethod, generatedDate } = data;

        // Sync sort toggle buttons with current sort method
        this.elements.sortBySpecies.classList.toggle('active', sortMethod === 'species');
        this.elements.sortByDistance.classList.toggle('active', sortMethod === 'distance');
        this.elements.sortByDriving.classList.toggle('active', sortMethod === 'driving');

        // Update meta information (sort is now shown in toggle, so removed from text)
        this.elements.resultsMeta.textContent = `${hotspots.length} hotspots found | ${generatedDate}`;

        // Render rare bird alert banner if there are notable observations
        this.renderRareBirdAlert();

        // Render migration alert banner
        this.renderMigrationAlert();

        // Render weather summary
        this.renderWeatherSummary(hotspots);

        // Initialize results map
        this.initResultsMap(origin, hotspots);

        // Clear existing cards
        clearElement(this.elements.hotspotCards);

        // Handle empty results
        if (hotspots.length === 0) {
            this.renderEmptyState();
        } else {
            // Generate hotspot cards
            hotspots.forEach((hotspot, index) => {
                const card = this.createHotspotCard(hotspot, index + 1, origin);
                this.elements.hotspotCards.appendChild(card);
            });
        }

        // Show results section
        this.elements.resultsSection.classList.remove('hidden');

        // Scroll to results
        this.elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Render empty state when no results are found
     */
    renderEmptyState() {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';

        const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        iconSvg.setAttribute('viewBox', '0 0 24 24');
        iconSvg.setAttribute('width', '64');
        iconSvg.setAttribute('height', '64');
        iconSvg.setAttribute('class', 'empty-state-icon');
        const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        iconPath.setAttribute('fill', 'currentColor');
        iconPath.setAttribute('d', 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z');
        iconSvg.appendChild(iconPath);

        const heading = document.createElement('h3');
        heading.textContent = 'No hotspots found';

        const message = document.createElement('p');
        message.textContent = 'Try expanding your search range or searching in a different area.';

        emptyDiv.appendChild(iconSvg);
        emptyDiv.appendChild(heading);
        emptyDiv.appendChild(message);
        this.elements.hotspotCards.appendChild(emptyDiv);
    }

    /**
     * Format a date as relative time (e.g., "2 days ago")
     * @param {string} dateStr - Date string from eBird API
     * @returns {string} Relative time string
     */
    formatRelativeDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'today';
        if (diffDays === 1) return 'yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 14) return '1 week ago';
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        return `${Math.floor(diffDays / 30)} month(s) ago`;
    }

    /**
     * Render the rare bird alert banner
     */
    renderRareBirdAlert() {
        const container = this.elements.rareBirdAlert;
        clearElement(container);

        if (!this.notableObservations || this.notableObservations.length === 0) {
            container.classList.add('hidden');
            return;
        }

        // Sort by most recent
        const sorted = [...this.notableObservations]
            .sort((a, b) => new Date(b.obsDt) - new Date(a.obsDt));

        // Show first 5 in preview, rest hidden
        const previewCount = 5;
        const previewItems = sorted.slice(0, previewCount);
        const hasMore = sorted.length > previewCount;

        // Create alert element
        const alert = document.createElement('div');
        alert.className = 'rare-bird-alert';

        // Header
        const header = document.createElement('div');
        header.className = 'rare-alert-header';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'rare-alert-icon';
        iconSpan.appendChild(createSVGIcon('alert', 24));

        const title = document.createElement('h3');
        title.className = 'rare-alert-title';
        title.textContent = 'RARE BIRD ALERT';

        const count = document.createElement('span');
        count.className = 'rare-alert-count';
        count.textContent = `${sorted.length} notable ${sorted.length === 1 ? 'species' : 'sightings'} nearby`;

        header.appendChild(iconSpan);
        header.appendChild(title);
        header.appendChild(count);

        // List
        const list = document.createElement('ul');
        list.className = 'rare-alert-list';

        previewItems.forEach(obs => {
            const li = document.createElement('li');
            li.className = 'rare-alert-item';

            const strong = document.createElement('strong');
            strong.textContent = obs.comName;

            const location = document.createElement('span');
            location.className = 'rare-alert-location';
            location.textContent = ` at ${obs.locName}`;

            const date = document.createElement('span');
            date.className = 'rare-alert-date';
            date.textContent = `(${this.formatRelativeDate(obs.obsDt)})`;

            li.appendChild(strong);
            li.appendChild(location);
            li.appendChild(date);
            list.appendChild(li);
        });

        alert.appendChild(header);
        alert.appendChild(list);

        // "View all" toggle if there are more
        if (hasMore) {
            const hiddenList = document.createElement('ul');
            hiddenList.className = 'rare-alert-list hidden';
            hiddenList.id = 'rareAlertMoreList';

            sorted.slice(previewCount).forEach(obs => {
                const li = document.createElement('li');
                li.className = 'rare-alert-item';

                const strong = document.createElement('strong');
                strong.textContent = obs.comName;

                const location = document.createElement('span');
                location.className = 'rare-alert-location';
                location.textContent = ` at ${obs.locName}`;

                const date = document.createElement('span');
                date.className = 'rare-alert-date';
                date.textContent = `(${this.formatRelativeDate(obs.obsDt)})`;

                li.appendChild(strong);
                li.appendChild(location);
                li.appendChild(date);
                hiddenList.appendChild(li);
            });

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'rare-alert-toggle';
            toggle.setAttribute('aria-expanded', 'false');

            const toggleText = document.createElement('span');
            toggleText.textContent = `View all ${sorted.length} sightings`;

            const chevron = createSVGIcon('chevron', 16, 'chevron');

            toggle.appendChild(toggleText);
            toggle.appendChild(chevron);

            toggle.addEventListener('click', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', !expanded);
                hiddenList.classList.toggle('hidden');
                toggleText.textContent = expanded
                    ? `View all ${sorted.length} sightings`
                    : 'Show fewer';
            });

            alert.appendChild(hiddenList);
            alert.appendChild(toggle);
        }

        container.appendChild(alert);
        container.classList.remove('hidden');
    }

    /**
     * Render weather summary in results header
     * @param {Array} hotspots - Array of hotspot data with weather
     */
    renderWeatherSummary(hotspots) {
        const container = this.elements.weatherSummary;
        clearElement(container);

        // Get weather data from hotspots
        const weatherData = hotspots.map(h => h.weather).filter(w => w !== null);

        if (weatherData.length === 0) {
            container.classList.add('hidden');
            return;
        }

        const conditions = getOverallBirdingConditions(weatherData);

        container.className = `weather-summary ${conditions.rating}`;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'weather-summary-icon';
        // Choose icon based on rating
        const iconName = conditions.rating === 'excellent' || conditions.rating === 'good' ? 'sun' : 'cloud';
        iconSpan.appendChild(createSVGIcon(iconName, 20));

        const textSpan = document.createElement('span');
        textSpan.className = 'weather-summary-text';
        textSpan.textContent = conditions.message;

        container.appendChild(iconSpan);
        container.appendChild(textSpan);
        container.classList.remove('hidden');
    }

    /**
     * Render migration alert banner
     */
    renderMigrationAlert() {
        const container = this.elements.migrationAlert;
        clearElement(container);

        const insights = getSeasonalInsights();
        const alerts = insights.migrationAlerts;

        // Only show if there are active migrations
        if (!alerts || alerts.length === 0) {
            container.classList.add('hidden');
            return;
        }

        // Get top alert (most relevant - peak alerts first)
        const topAlert = alerts[0];

        const banner = document.createElement('div');
        banner.className = `migration-alert-banner${topAlert.isPeak ? ' peak' : ''}`;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'migration-alert-icon';
        iconSpan.appendChild(createSVGIcon('trending', 24));

        const content = document.createElement('div');
        content.className = 'migration-alert-content';

        const title = document.createElement('div');
        title.className = 'migration-alert-title';
        title.textContent = topAlert.message;

        const subtitle = document.createElement('div');
        subtitle.className = 'migration-alert-subtitle';
        subtitle.textContent = insights.bestTimeRecommendation;

        content.appendChild(title);
        content.appendChild(subtitle);

        banner.appendChild(iconSpan);
        banner.appendChild(content);

        // If there are more alerts, show a count
        if (alerts.length > 1) {
            const moreAlerts = document.createElement('span');
            moreAlerts.className = 'migration-alert-more';
            moreAlerts.textContent = `+${alerts.length - 1} more`;
            moreAlerts.style.fontSize = '0.75rem';
            moreAlerts.style.opacity = '0.8';
            content.appendChild(moreAlerts);
        }

        container.appendChild(banner);
        container.classList.remove('hidden');
    }

    /**
     * Create a weather badge element for a hotspot card
     * @param {Object} weather - Weather data object
     * @returns {HTMLElement|null} Weather badge element or null if no weather data
     */
    createWeatherBadge(weather) {
        if (!weather) return null;

        const badge = document.createElement('div');
        badge.className = `weather-badge ${weather.condition}`;

        // Main weather display
        const main = document.createElement('div');
        main.className = 'weather-main';

        // Weather icon
        const iconDiv = document.createElement('div');
        iconDiv.className = 'weather-icon';
        iconDiv.appendChild(createSVGIcon(weather.icon, 36));

        // Temperature and condition
        const tempInfo = document.createElement('div');

        const tempSpan = document.createElement('span');
        tempSpan.className = 'weather-temp';
        tempSpan.textContent = this.useFahrenheit
            ? `${weather.temperatureF}°F`
            : `${weather.temperatureC}°C`;

        // Add click to toggle temperature unit
        tempSpan.style.cursor = 'pointer';
        tempSpan.title = 'Click to toggle °F/°C';
        tempSpan.addEventListener('click', () => {
            this.useFahrenheit = !this.useFahrenheit;
            storage.setTemperatureUnit(this.useFahrenheit ? 'F' : 'C');
            // Update all temperature displays
            this.updateTemperatureDisplays();
        });

        const conditionSpan = document.createElement('div');
        conditionSpan.className = 'weather-condition';
        conditionSpan.textContent = weather.description;

        tempInfo.appendChild(tempSpan);
        tempInfo.appendChild(conditionSpan);
        main.appendChild(iconDiv);
        main.appendChild(tempInfo);

        // Weather details
        const details = document.createElement('div');
        details.className = 'weather-details';

        // Wind
        const windDetail = document.createElement('span');
        windDetail.className = 'weather-detail';
        windDetail.appendChild(createSVGIcon('wind', 14));
        windDetail.appendChild(document.createTextNode(` ${weather.windSpeedMph} mph ${weather.windDirection}`));

        // Humidity
        const humidityDetail = document.createElement('span');
        humidityDetail.className = 'weather-detail';
        humidityDetail.appendChild(document.createTextNode(`💧 ${weather.humidity}%`));

        // Precipitation probability
        if (weather.precipitationProbability > 0) {
            const precipDetail = document.createElement('span');
            precipDetail.className = 'weather-detail';
            precipDetail.appendChild(createSVGIcon('rain', 14));
            precipDetail.appendChild(document.createTextNode(` ${weather.precipitationProbability}%`));
            details.appendChild(precipDetail);
        }

        details.appendChild(windDetail);
        details.appendChild(humidityDetail);

        // Birding condition badge
        const birdingCondition = getBirdingConditionScore(weather);
        const conditionBadge = document.createElement('span');
        conditionBadge.className = `birding-condition ${birdingCondition.rating}`;
        conditionBadge.textContent = birdingCondition.rating;
        details.appendChild(conditionBadge);

        badge.appendChild(main);
        badge.appendChild(details);

        return badge;
    }

    /**
     * Update all temperature displays when unit preference changes
     */
    updateTemperatureDisplays() {
        // Re-render the current results with new temperature unit
        if (this.currentResults) {
            this.displayResults(this.currentResults);
        }
    }

    /**
     * Set search mode (hotspot or species)
     * @param {string} mode - 'hotspot' or 'species'
     */
    setSearchMode(mode) {
        this.searchMode = mode;

        // Update button states
        this.elements.hotspotModeBtn.classList.toggle('active', mode === 'hotspot');
        this.elements.speciesModeBtn.classList.toggle('active', mode === 'species');
        this.elements.hotspotModeBtn.setAttribute('aria-selected', mode === 'hotspot');
        this.elements.speciesModeBtn.setAttribute('aria-selected', mode === 'species');

        // Toggle panels
        this.elements.speciesSearchPanel.classList.toggle('hidden', mode === 'hotspot');
        this.elements.sortOptionsSection.classList.toggle('hidden', mode === 'species');

        // Update generate button text
        this.elements.generateReport.innerHTML = mode === 'species'
            ? '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg> Find This Species'
            : '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg> Find Hotspots';

        // Initialize species search if switching to species mode
        if (mode === 'species' && !this.speciesSearch) {
            this.initializeSpeciesSearch();
        }
    }

    /**
     * Initialize the species search service
     */
    async initializeSpeciesSearch() {
        const apiKey = this.elements.apiKey.value.trim();
        if (!apiKey) {
            this.showError('Please enter your eBird API key first');
            this.setSearchMode('hotspot');
            return;
        }

        this.speciesSearch = new SpeciesSearch(new EBirdAPI(apiKey));

        // Load taxonomy in background
        this.elements.speciesSearchInput.placeholder = 'Loading species data...';
        this.elements.speciesSearchInput.disabled = true;

        try {
            await this.speciesSearch.loadTaxonomy();
            this.elements.speciesSearchInput.placeholder = 'Start typing a bird name...';
            this.elements.speciesSearchInput.disabled = false;
            this.elements.speciesSearchInput.focus();
        } catch (e) {
            console.error('Failed to load taxonomy:', e);
            this.elements.speciesSearchInput.placeholder = 'Failed to load species data';
        }
    }

    /**
     * Handle species search input change
     */
    handleSpeciesSearchInput() {
        clearTimeout(this.speciesSearchDebounceTimer);

        const query = this.elements.speciesSearchInput.value.trim();

        if (query.length < 2) {
            this.hideSpeciesDropdown();
            return;
        }

        // Debounce search
        this.speciesSearchDebounceTimer = setTimeout(() => {
            this.performSpeciesSearch(query);
        }, 200);
    }

    /**
     * Handle species search input focus
     */
    handleSpeciesSearchFocus() {
        const query = this.elements.speciesSearchInput.value.trim();
        if (query.length >= 2 && this.speciesSearch?.isReady()) {
            this.performSpeciesSearch(query);
        }
    }

    /**
     * Perform species search and show dropdown
     * @param {string} query - Search query
     */
    performSpeciesSearch(query) {
        if (!this.speciesSearch?.isReady()) {
            this.showSpeciesDropdownMessage('Loading species data...');
            return;
        }

        const results = this.speciesSearch.searchSpecies(query, 10);

        if (results.length === 0) {
            this.showSpeciesDropdownMessage('No species found');
            return;
        }

        this.renderSpeciesDropdown(results);
    }

    /**
     * Render species dropdown with results
     * @param {Array} results - Search results
     */
    renderSpeciesDropdown(results) {
        const dropdown = this.elements.speciesDropdown;
        clearElement(dropdown);

        results.forEach(species => {
            const option = document.createElement('div');
            option.className = 'species-option';
            option.dataset.code = species.speciesCode;
            option.dataset.name = species.commonName;
            option.dataset.scientific = species.scientificName;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'species-option-name';
            nameSpan.textContent = species.commonName;

            const scientificSpan = document.createElement('span');
            scientificSpan.className = 'species-option-scientific';
            scientificSpan.textContent = species.scientificName;

            option.appendChild(nameSpan);
            option.appendChild(scientificSpan);

            // Event listener handled via delegation in initializeEventListeners()
            dropdown.appendChild(option);
        });

        dropdown.classList.remove('hidden');
    }

    /**
     * Show a message in the species dropdown using safe DOM manipulation
     * @param {string} message - Message to show
     */
    showSpeciesDropdownMessage(message) {
        const dropdown = this.elements.speciesDropdown;
        clearElement(dropdown);
        const messageDiv = document.createElement('div');
        messageDiv.className = 'species-dropdown-empty';
        messageDiv.textContent = message;
        dropdown.appendChild(messageDiv);
        dropdown.classList.remove('hidden');
    }

    /**
     * Hide species dropdown
     */
    hideSpeciesDropdown() {
        this.elements.speciesDropdown.classList.add('hidden');
    }

    /**
     * Select a species from the dropdown using safe DOM manipulation
     * @param {Object} species - Selected species data
     */
    selectSpecies(species) {
        this.selectedSpeciesData = species;
        this.elements.speciesSearchInput.value = '';
        this.hideSpeciesDropdown();

        // Show selected species using safe DOM construction
        const selectedDiv = this.elements.selectedSpecies;
        clearElement(selectedDiv);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'selected-species-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'selected-species-name';
        nameDiv.textContent = species.commonName;

        const scientificDiv = document.createElement('div');
        scientificDiv.className = 'selected-species-scientific';
        scientificDiv.textContent = species.scientificName;

        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(scientificDiv);

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'selected-species-clear';
        clearBtn.title = 'Clear selection';
        clearBtn.appendChild(createSVGIcon('close', 20));
        clearBtn.addEventListener('click', () => this.clearSelectedSpecies());

        selectedDiv.appendChild(infoDiv);
        selectedDiv.appendChild(clearBtn);
        selectedDiv.classList.remove('hidden');
    }

    /**
     * Clear selected species
     */
    clearSelectedSpecies() {
        this.selectedSpeciesData = null;
        this.elements.selectedSpecies.classList.add('hidden');
        this.elements.speciesSearchInput.focus();
    }

    /**
     * Get search origin coordinates (shared by hotspot and species search)
     * @returns {Promise<Object|null>} Origin object with lat, lng, address or null if failed
     */
    async getSearchOrigin() {
        try {
            const inputMode = document.querySelector('[name="inputMode"]:checked').value;
            if (inputMode === 'address') {
                const address = this.elements.address.value.trim();
                if (address.length < 3) {
                    this.showAddressError('Please enter an address.');
                    return null;
                }

                // If address hasn't been validated yet, try to validate it now
                if (!this.addressValidated) {
                    try {
                        const result = await geocodeAddress(address);
                        this.addressValidated = true;
                        this.validatedCoords = { lat: result.lat, lng: result.lng };
                        this.clearAddressError();
                    } catch (error) {
                        this.showAddressError('Could not find this address. Please check and try again.');
                        return null;
                    }
                }
            }

            const origin = await this.getCoordinates();
            this.currentLocation = origin;
            return origin;
        } catch (error) {
            this.showError(error.message);
            return null;
        }
    }

    /**
     * Handle species search (called from handleGenerateReport)
     */
    async handleSpeciesSearch() {
        if (!this.selectedSpeciesData) {
            this.showError('Please select a bird species to search for');
            this.isProcessing = false;
            return;
        }

        // Get location
        const origin = await this.getSearchOrigin();
        if (!origin) {
            this.isProcessing = false;
            return;
        }

        // Get search range
        const searchRange = parseInt(document.querySelector('[name="searchRange"]:checked').value, 10);

        this.showLoading('Searching for species...', 0);
        this.updateLoading('Searching for ' + this.selectedSpeciesData.commonName + '...', 10);

        try {
            const sightings = await this.speciesSearch.findSpeciesHotspots(
                this.selectedSpeciesData.speciesCode,
                origin.lat,
                origin.lng,
                searchRange,
                CONFIG.DEFAULT_DAYS_BACK
            );

            this.updateLoading('Processing results...', 80);

            // Calculate distances
            sightings.forEach(s => {
                s.distance = calculateDistance(origin.lat, origin.lng, s.lat, s.lng);
            });

            this.hideLoading();

            // Display species search results
            this.displaySpeciesResults(this.selectedSpeciesData, sightings, origin);

        } catch (e) {
            this.hideLoading();
            this.showError(`Failed to search for species: ${e.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Display species search results
     * @param {Object} species - Selected species data
     * @param {Array} sightings - Array of sighting locations
     * @param {Object} origin - Search origin
     */
    displaySpeciesResults(species, sightings, origin) {
        // Clear previous results
        this.elements.rareBirdAlert.classList.add('hidden');
        this.elements.weatherSummary.classList.add('hidden');
        clearElement(this.elements.hotspotCards);

        // Update results header
        this.elements.resultsMeta.textContent = `${sightings.length} locations with recent sightings`;

        // Hide sort buttons for species search
        this.elements.sortBySpecies.parentElement.classList.add('hidden');

        // Create species results header
        const resultsHeader = document.createElement('div');
        resultsHeader.className = 'species-results-header';
        resultsHeader.innerHTML = `
            <div class="species-results-icon">
                <svg viewBox="0 0 24 24" width="28" height="28">
                    <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
            </div>
            <div class="species-results-title">
                <h3>${species.commonName} Sightings</h3>
                <p>${sightings.length > 0 ? 'Recent sightings near your location' : 'No recent sightings found in this area'}</p>
            </div>
        `;

        this.elements.hotspotCards.appendChild(resultsHeader);

        if (sightings.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'species-no-results';
            noResults.innerHTML = `
                <div class="species-no-results-icon">
                    <svg viewBox="0 0 24 24" width="64" height="64">
                        <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                </div>
                <h3>No recent sightings</h3>
                <p>Try expanding your search range or searching for a different species.</p>
            `;
            this.elements.hotspotCards.appendChild(noResults);
        } else {
            // Create sighting cards
            sightings.forEach((sighting, index) => {
                const card = this.createSpeciesSightingCard(sighting, index + 1, origin);
                this.elements.hotspotCards.appendChild(card);
            });
        }

        // Initialize map with sighting locations
        this.initResultsMap(origin, sightings.map(s => ({
            lat: s.lat,
            lng: s.lng,
            name: s.name,
            speciesCount: s.observationCount
        })));

        // Show results section
        this.elements.resultsSection.classList.remove('hidden');
        this.elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Create a species sighting card
     * @param {Object} sighting - Sighting data
     * @param {number} rank - Ranking number
     * @param {Object} origin - Search origin
     * @returns {HTMLElement}
     */
    createSpeciesSightingCard(sighting, rank, origin) {
        const card = document.createElement('div');
        card.className = 'species-sighting-card';

        const distanceText = formatDistance(sighting.distance);
        const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${sighting.lat},${sighting.lng}`;
        const ebirdUrl = sighting.locId.startsWith('L')
            ? `https://ebird.org/hotspot/${sighting.locId}`
            : `https://www.google.com/maps/search/?api=1&query=${sighting.lat},${sighting.lng}`;

        card.innerHTML = `
            <div class="species-sighting-header">
                <div class="sighting-rank">${rank}</div>
                <div class="sighting-info">
                    <h4 class="sighting-location">${sighting.name}</h4>
                    <div class="sighting-meta">
                        <span>
                            <svg viewBox="0 0 24 24" width="14" height="14">
                                <path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                            </svg>
                            ${distanceText}
                        </span>
                        <span>
                            <svg viewBox="0 0 24 24" width="14" height="14">
                                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                            </svg>
                            ${sighting.observationCount} sighting${sighting.observationCount !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            </div>
            <div class="sighting-details">
                <div class="sighting-date">
                    Last seen: <strong>${this.formatRelativeDate(sighting.lastSeen)}</strong>
                </div>
                ${sighting.highestCount > 1 ? `<div class="sighting-count">Highest count: ${sighting.highestCount} individuals</div>` : ''}
            </div>
            <div class="sighting-links">
                <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" class="sighting-link">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                        <path fill="currentColor" d="M21.71 11.29l-9-9c-.39-.39-1.02-.39-1.41 0l-9 9c-.39.39-.39 1.02 0 1.41l9 9c.39.39 1.02.39 1.41 0l9-9c.39-.38.39-1.01 0-1.41zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z"/>
                    </svg>
                    Get Directions
                </a>
                <a href="${ebirdUrl}" target="_blank" rel="noopener noreferrer" class="sighting-link">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                        <path fill="currentColor" d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                    </svg>
                    ${sighting.isHotspot ? 'View on eBird' : 'View Location'}
                </a>
            </div>
        `;

        return card;
    }

    /**
     * Create a hotspot card element
     * @param {Object} hotspot - Hotspot data
     * @param {number} number - Hotspot number (1-based)
     * @param {Object} origin - Origin coordinates
     * @returns {HTMLElement} Card element
     */
    createHotspotCard(hotspot, number, origin) {
        const card = document.createElement('article');
        card.className = 'hotspot-card';

        const distanceText = formatDistance(hotspot.distance);
        const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${hotspot.lat},${hotspot.lng}`;
        const ebirdUrl = `https://ebird.org/hotspot/${hotspot.locId}`;

        // Check if there are notable species
        const hasNotable = hotspot.birds.some(b => b.isNotable);

        // Build card using DOM methods

        // Header
        const header = document.createElement('div');
        header.className = 'hotspot-header';

        const numberDiv = document.createElement('div');
        numberDiv.className = 'hotspot-number';
        numberDiv.textContent = number;

        const titleSection = document.createElement('div');
        titleSection.className = 'hotspot-title-section';

        const nameH3 = document.createElement('h3');
        nameH3.className = 'hotspot-name';
        nameH3.textContent = hotspot.name;

        const stats = document.createElement('div');
        stats.className = 'hotspot-stats';

        // Species count stat
        const speciesStat = document.createElement('span');
        speciesStat.className = 'stat species-count';
        speciesStat.appendChild(createSVGIcon('check', 16));
        speciesStat.appendChild(document.createTextNode(` ${hotspot.speciesCount} species`));

        // Straight-line distance stat
        const straightDistanceStat = document.createElement('span');
        straightDistanceStat.className = 'stat distance';
        straightDistanceStat.appendChild(createSVGIcon('location', 16));
        straightDistanceStat.appendChild(document.createTextNode(` ${distanceText}`));

        stats.appendChild(speciesStat);
        stats.appendChild(straightDistanceStat);

        // Driving distance stat (if available)
        if (hotspot.drivingDistance != null && hotspot.drivingDuration != null) {
            const drivingDistanceText = formatDistance(hotspot.drivingDistance);
            const drivingDurationText = formatDuration(hotspot.drivingDuration);

            const drivingStat = document.createElement('span');
            drivingStat.className = 'stat driving';
            drivingStat.appendChild(createSVGIcon('car', 16));
            drivingStat.appendChild(document.createTextNode(` ${drivingDistanceText} · ${drivingDurationText} drive`));
            stats.appendChild(drivingStat);
        }
        titleSection.appendChild(nameH3);
        titleSection.appendChild(stats);
        header.appendChild(numberDiv);
        header.appendChild(titleSection);

        // Add rare badge if hotspot has notable species
        if (hasNotable) {
            const rareBadge = document.createElement('span');
            rareBadge.className = 'rare-badge';
            rareBadge.appendChild(createSVGIcon('fire', 14));
            rareBadge.appendChild(document.createTextNode(' RARE'));
            header.appendChild(rareBadge);
        }

        // Details section
        const details = document.createElement('div');
        details.className = 'hotspot-details';

        const address = document.createElement('p');
        address.className = 'hotspot-address';
        address.textContent = hotspot.address;

        const links = document.createElement('div');
        links.className = 'hotspot-links';

        // Directions link
        const directionsLink = document.createElement('a');
        directionsLink.href = directionsUrl;
        directionsLink.target = '_blank';
        directionsLink.rel = 'noopener noreferrer';
        directionsLink.className = 'hotspot-link';
        directionsLink.appendChild(createSVGIcon('directions', 16));
        directionsLink.appendChild(document.createTextNode(' Get Directions'));

        // eBird link
        const ebirdLink = document.createElement('a');
        ebirdLink.href = ebirdUrl;
        ebirdLink.target = '_blank';
        ebirdLink.rel = 'noopener noreferrer';
        ebirdLink.className = 'hotspot-link';
        ebirdLink.appendChild(createSVGIcon('external', 16));
        ebirdLink.appendChild(document.createTextNode(' View on eBird'));

        links.appendChild(directionsLink);
        links.appendChild(ebirdLink);
        details.appendChild(address);
        details.appendChild(links);

        // Species section
        const speciesSection = document.createElement('div');
        speciesSection.className = 'species-section';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'species-toggle';
        toggle.setAttribute('aria-expanded', 'false');

        const toggleText = document.createElement('span');
        toggleText.textContent = `View Species List (${hotspot.birds.length})`;

        const chevron = createSVGIcon('chevron', 20, 'chevron');

        toggle.appendChild(toggleText);
        toggle.appendChild(chevron);

        const speciesList = document.createElement('div');
        speciesList.className = 'species-list hidden';

        const speciesGrid = document.createElement('ul');
        speciesGrid.className = 'species-grid';

        hotspot.birds.forEach(bird => {
            const li = document.createElement('li');
            li.className = bird.isNotable ? 'species-item notable' : 'species-item';
            li.textContent = bird.isNotable ? `* ${bird.comName}` : bird.comName;
            speciesGrid.appendChild(li);
        });

        speciesList.appendChild(speciesGrid);

        if (hasNotable) {
            const legend = document.createElement('p');
            legend.className = 'notable-legend';
            legend.textContent = '* Notable/rare species for this area';
            speciesList.appendChild(legend);
        }

        speciesSection.appendChild(toggle);
        speciesSection.appendChild(speciesList);

        // Notable species highlight section (if any)
        let notableHighlight = null;
        if (hasNotable) {
            const notableSpecies = hotspot.birds.filter(b => b.isNotable);
            notableHighlight = document.createElement('div');
            notableHighlight.className = 'notable-highlight';

            const highlightTitle = document.createElement('h4');
            highlightTitle.className = 'notable-highlight-title';
            highlightTitle.appendChild(createSVGIcon('alert', 16));
            highlightTitle.appendChild(document.createTextNode(' Notable Sightings'));
            notableHighlight.appendChild(highlightTitle);

            notableSpecies.forEach(bird => {
                const birdDiv = document.createElement('div');
                birdDiv.className = 'notable-bird';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'notable-bird-name';
                nameSpan.textContent = bird.comName;

                const dateSpan = document.createElement('span');
                dateSpan.className = 'notable-bird-date';
                dateSpan.textContent = `Last seen: ${this.formatRelativeDate(bird.lastSeen)}`;

                birdDiv.appendChild(nameSpan);
                birdDiv.appendChild(dateSpan);
                notableHighlight.appendChild(birdDiv);
            });
        }

        // Create weather badge if weather data is available
        const weatherBadge = this.createWeatherBadge(hotspot.weather);

        // Create seasonal insights section
        const seasonalInsights = this.createSeasonalInsightsSection();

        // Assemble card
        card.appendChild(header);
        if (notableHighlight) {
            card.appendChild(notableHighlight);
        }
        if (weatherBadge) {
            card.appendChild(weatherBadge);
        }
        card.appendChild(details);
        card.appendChild(speciesSection);
        if (seasonalInsights) {
            card.appendChild(seasonalInsights);
        }

        return card;
    }

    /**
     * Create seasonal insights section for a hotspot card
     * @returns {HTMLElement} Seasonal insights section element
     */
    createSeasonalInsightsSection() {
        const insights = getSeasonalInsights();
        const optimalTimes = insights.optimalTimes;

        const section = document.createElement('div');
        section.className = 'seasonal-insights-section';

        // Toggle button
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'seasonal-insights-toggle';
        toggle.setAttribute('aria-expanded', 'false');

        const toggleText = document.createElement('span');
        toggleText.appendChild(createSVGIcon('schedule', 16));
        toggleText.appendChild(document.createTextNode(` ${insights.season} Birding Tips`));

        const chevron = createSVGIcon('chevron', 16, 'chevron');

        toggle.appendChild(toggleText);
        toggle.appendChild(chevron);

        // Content
        const content = document.createElement('div');
        content.className = 'seasonal-insights-content hidden';

        // Best time of day chart
        const chartTitle = document.createElement('div');
        chartTitle.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px;';
        chartTitle.textContent = 'Best birding times today:';

        const timeChart = document.createElement('div');
        timeChart.className = 'time-of-day-chart';

        const timeSlots = [
            { key: 'morning', label: 'Early AM', ...optimalTimes.morning },
            { key: 'midday', label: 'Midday', ...optimalTimes.midday },
            { key: 'evening', label: 'Evening', ...optimalTimes.evening }
        ];

        timeSlots.forEach(slot => {
            const bar = document.createElement('div');
            bar.className = 'time-bar';

            const fill = document.createElement('div');
            fill.className = `time-bar-fill ${slot.activity}`;
            // Height based on activity level
            const height = slot.activity === 'high' ? 100 : slot.activity === 'medium' ? 60 : 30;
            fill.style.height = `${height}%`;

            const label = document.createElement('div');
            label.className = 'time-bar-label';
            label.textContent = slot.label;

            bar.appendChild(fill);
            bar.appendChild(label);
            timeChart.appendChild(bar);
        });

        // Monthly activity sparkline
        const sparklineTitle = document.createElement('div');
        sparklineTitle.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary); margin: 12px 0 4px;';
        sparklineTitle.textContent = 'Annual birding activity:';

        const sparkline = document.createElement('div');
        sparkline.className = 'activity-sparkline';

        const currentMonth = new Date().getMonth(); // 0-indexed

        insights.monthlyActivity.forEach((level, index) => {
            const bar = document.createElement('div');
            bar.className = 'sparkline-bar';
            if (index === currentMonth) bar.classList.add('current');
            else if (level >= 8) bar.classList.add('high');
            bar.style.height = `${level * 10}%`;
            bar.title = new Date(2024, index).toLocaleString('default', { month: 'short' });
            sparkline.appendChild(bar);
        });

        const sparklineLabel = document.createElement('div');
        sparklineLabel.className = 'sparkline-label';
        sparklineLabel.innerHTML = '<span>Jan</span><span>Dec</span>';

        // Activity recommendation
        const recommendation = document.createElement('div');
        recommendation.className = 'best-time-recommendation';
        recommendation.appendChild(createSVGIcon('sun', 16));
        recommendation.appendChild(document.createTextNode(insights.bestTimeRecommendation));

        content.appendChild(chartTitle);
        content.appendChild(timeChart);
        content.appendChild(sparklineTitle);
        content.appendChild(sparkline);
        content.appendChild(sparklineLabel);
        content.appendChild(recommendation);

        section.appendChild(toggle);
        section.appendChild(content);

        // Add toggle event listener
        toggle.addEventListener('click', () => {
            const expanded = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', !expanded);
            content.classList.toggle('hidden');
        });

        return section;
    }

    // =========================================
    // ITINERARY BUILDER METHODS
    // =========================================

    /**
     * Toggle the itinerary builder panel visibility
     */
    toggleItineraryPanel() {
        const isHidden = this.elements.itineraryPanel.classList.contains('hidden');
        if (isHidden) {
            this.showItineraryPanel();
        } else {
            this.hideItineraryPanel();
        }
    }

    /**
     * Show the itinerary builder panel
     */
    showItineraryPanel() {
        this.elements.itineraryPanel.classList.remove('hidden');
        this.elements.itineraryResults.classList.add('hidden');
        this.elements.itineraryPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Focus the first interactive element for accessibility
        this.elements.endLocationSelect.focus();
    }

    /**
     * Hide the itinerary builder panel
     */
    hideItineraryPanel() {
        this.elements.itineraryPanel.classList.add('hidden');
        // Return focus to the trigger button for accessibility
        this.elements.buildItineraryBtn.focus();
    }

    /**
     * Handle end location select change
     */
    handleEndLocationChange() {
        const value = this.elements.endLocationSelect.value;
        if (value === 'different') {
            this.elements.endLocationInputs.classList.remove('hidden');
        } else {
            this.elements.endLocationInputs.classList.add('hidden');
        }
    }

    /**
     * Generate the optimized itinerary
     */
    async handleGenerateItinerary() {
        if (!this.currentResults || !this.currentResults.hotspots || this.currentResults.hotspots.length === 0) {
            this.showError('No hotspots available. Please run a search first.');
            return;
        }

        const maxStops = parseInt(this.elements.maxStops.value, 10);
        const priority = document.querySelector('[name="itineraryPriority"]:checked').value;
        const endLocationChoice = this.elements.endLocationSelect.value;

        // Determine start and end locations
        const start = {
            lat: this.currentLocation.lat,
            lng: this.currentLocation.lng,
            address: this.currentLocation.address || 'Start Location'
        };

        let end;
        if (endLocationChoice === 'same') {
            end = { ...start };
        } else {
            const endAddr = this.elements.endAddress.value.trim();
            if (!endAddr) {
                this.showError('Please enter an end address.');
                return;
            }
            try {
                const endCoords = await geocodeAddress(endAddr);
                end = { lat: endCoords.lat, lng: endCoords.lng, address: endAddr };
            } catch (e) {
                this.showError('Could not find end address. Please check and try again.');
                return;
            }
        }

        this.showLoading('Building itinerary...', 0);

        try {
            const itinerary = await buildItinerary(start, end, this.currentResults.hotspots, {
                maxStops,
                priority,
                onProgress: (msg, pct) => this.updateLoading(msg, pct)
            });

            this.currentItinerary = itinerary;
            this.hideLoading();
            this.displayItinerary(itinerary);
        } catch (error) {
            this.hideLoading();
            this.showError(`Failed to build itinerary: ${error.message}`);
        }
    }

    /**
     * Display the generated itinerary
     * @param {Object} itinerary - Itinerary data
     */
    displayItinerary(itinerary) {
        // Hide the options panel, show results
        this.elements.itineraryPanel.classList.add('hidden');
        this.elements.itineraryResults.classList.remove('hidden');

        // Hide normal hotspot cards
        this.elements.hotspotCards.classList.add('hidden');

        // Render summary
        const summary = this.elements.itinerarySummary;
        clearElement(summary);

        const title = document.createElement('div');
        title.className = 'itinerary-summary-title';
        title.textContent = `Your Birding Itinerary (${itinerary.summary.totalStops} stops)`;
        summary.appendChild(title);

        const stats = document.createElement('div');
        stats.className = 'itinerary-summary-stats';
        stats.innerHTML = `
            <div class="itinerary-stat">
                <span class="itinerary-stat-value">${formatItineraryDuration(itinerary.summary.totalTripTime)}</span>
                <span class="itinerary-stat-label">Total Trip Time</span>
            </div>
            <div class="itinerary-stat">
                <span class="itinerary-stat-value">${(itinerary.summary.totalDistance * 0.621371).toFixed(1)} mi</span>
                <span class="itinerary-stat-label">Total Distance</span>
            </div>
            <div class="itinerary-stat">
                <span class="itinerary-stat-value">${formatItineraryDuration(itinerary.summary.totalTravelTime)}</span>
                <span class="itinerary-stat-label">Driving Time</span>
            </div>
            <div class="itinerary-stat">
                <span class="itinerary-stat-value">${formatItineraryDuration(itinerary.summary.totalVisitTime)}</span>
                <span class="itinerary-stat-label">Birding Time</span>
            </div>
        `;
        summary.appendChild(stats);

        // Render stops
        const stopsContainer = this.elements.itineraryStops;
        clearElement(stopsContainer);

        itinerary.stops.forEach((stop, index) => {
            const stopEl = this.createItineraryStopElement(stop, index, itinerary);
            stopsContainer.appendChild(stopEl);
        });

        // Update map with route line
        this.displayItineraryRoute(itinerary);

        // Scroll to results
        this.elements.itineraryResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Create an itinerary stop element
     * @param {Object} stop - Stop data
     * @param {number} index - Stop index
     * @param {Object} itinerary - Full itinerary data
     * @returns {HTMLElement}
     */
    createItineraryStopElement(stop, index, itinerary) {
        const wrapper = document.createElement('div');

        // Leg connector (travel info) - shown before all stops except first
        if (index > 0 && itinerary.legs[index - 1]) {
            const leg = itinerary.legs[index - 1];
            const legEl = document.createElement('div');
            legEl.className = 'itinerary-leg';
            legEl.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                </svg>
                <span>${(leg.distance * 0.621371).toFixed(1)} mi</span>
                <span>|</span>
                <span>${formatItineraryDuration(leg.duration / 60)}</span>
            `;
            wrapper.appendChild(legEl);
        }

        // Stop card
        const stopEl = document.createElement('div');
        stopEl.className = `itinerary-stop ${stop.type}`;

        const marker = document.createElement('div');
        marker.className = 'stop-marker';
        marker.textContent = stop.type === 'start' ? 'S' : stop.type === 'end' ? 'E' : index;

        const content = document.createElement('div');
        content.className = 'stop-content';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'stop-name';
        nameDiv.textContent = stop.name;

        if (stop.type === 'hotspot' && stop.speciesCount) {
            const badge = document.createElement('span');
            badge.className = 'stop-species-count';
            badge.textContent = `${stop.speciesCount} species`;
            nameDiv.appendChild(badge);
        }

        content.appendChild(nameDiv);

        if (stop.address) {
            const addrDiv = document.createElement('div');
            addrDiv.className = 'stop-address';
            addrDiv.textContent = stop.address;
            content.appendChild(addrDiv);
        }

        const metaDiv = document.createElement('div');
        metaDiv.className = 'stop-meta';

        if (stop.arrivalTime) {
            const arrivalSpan = document.createElement('span');
            arrivalSpan.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg> Arrive ${formatItineraryTime(stop.arrivalTime)}`;
            metaDiv.appendChild(arrivalSpan);
        }

        if (stop.suggestedVisitTime > 0) {
            const visitSpan = document.createElement('span');
            visitSpan.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg> ${formatItineraryDuration(stop.suggestedVisitTime)} birding`;
            metaDiv.appendChild(visitSpan);
        }

        if (stop.departureTime && stop.type !== 'end') {
            const departSpan = document.createElement('span');
            departSpan.innerHTML = `Depart ${formatItineraryTime(stop.departureTime)}`;
            metaDiv.appendChild(departSpan);
        }

        content.appendChild(metaDiv);
        stopEl.appendChild(marker);
        stopEl.appendChild(content);
        wrapper.appendChild(stopEl);

        return wrapper;
    }

    /**
     * Display the itinerary route on the map
     * @param {Object} itinerary - Itinerary data
     */
    displayItineraryRoute(itinerary) {
        // Remove existing route line
        if (this.itineraryRouteLine && this.resultsMapInstance) {
            this.resultsMapInstance.removeLayer(this.itineraryRouteLine);
            this.itineraryRouteLine = null;
        }

        if (!this.resultsMapInstance || !itinerary.geometry) return;

        // Add route line from geometry
        const coords = itinerary.geometry.coordinates.map(c => [c[1], c[0]]);
        this.itineraryRouteLine = L.polyline(coords, {
            color: '#2E7D32',
            weight: 4,
            opacity: 0.8
        }).addTo(this.resultsMapInstance);

        // Update markers to show stop numbers
        this.resultsMarkers.forEach(m => this.resultsMapInstance.removeLayer(m));
        this.resultsMarkers = [];

        itinerary.stops.forEach((stop, index) => {
            const markerColor = stop.type === 'start' ? '#2E7D32' :
                stop.type === 'end' ? '#D32F2F' : '#FFC107';
            const markerText = stop.type === 'start' ? 'S' :
                stop.type === 'end' ? 'E' : index;

            const icon = L.divIcon({
                className: 'hotspot-marker',
                html: `<div style="background:${markerColor}">${markerText}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            const marker = L.marker([stop.lat, stop.lng], { icon })
                .bindPopup(`<strong>${stop.name}</strong>${stop.speciesCount ? `<br>${stop.speciesCount} species` : ''}`)
                .addTo(this.resultsMapInstance);

            this.resultsMarkers.push(marker);
        });

        // Fit bounds to show entire route
        this.resultsMapInstance.fitBounds(this.itineraryRouteLine.getBounds(), {
            padding: [50, 50],
            maxZoom: 12
        });
    }

    /**
     * Handle back to results button
     */
    handleBackToResults() {
        // Remove route line
        if (this.itineraryRouteLine && this.resultsMapInstance) {
            this.resultsMapInstance.removeLayer(this.itineraryRouteLine);
            this.itineraryRouteLine = null;
        }

        // Hide itinerary results, show normal results
        this.elements.itineraryResults.classList.add('hidden');
        this.elements.hotspotCards.classList.remove('hidden');

        // Restore normal map markers
        if (this.currentResults) {
            this.initResultsMap(this.currentResults.origin, this.currentResults.hotspots);
        }
    }

    /**
     * Export itinerary to PDF
     */
    async handleExportItineraryPdf() {
        if (!this.currentItinerary) {
            this.showError('No itinerary to export. Please generate an itinerary first.');
            return;
        }

        this.showLoading('Generating itinerary PDF...', 0);

        try {
            // Build itinerary-specific data for PDF
            const itineraryData = {
                origin: this.currentLocation,
                hotspots: this.currentItinerary.stops.filter(s => s.type === 'hotspot'),
                sortMethod: 'itinerary',
                generatedDate: new Date().toLocaleDateString(),
                isItinerary: true,
                itinerary: this.currentItinerary
            };

            const pdf = await generatePDFReport(itineraryData, (progress) => {
                this.updateLoading('Generating itinerary PDF...', progress);
            });

            downloadPDF(pdf, 'birding-itinerary.pdf');
            this.hideLoading();
            this.showSuccessToast('PDF downloaded!');
        } catch (error) {
            this.hideLoading();
            this.showError(`Failed to generate PDF: ${error.message}`);
        }
    }

    /**
     * Export itinerary to GPX
     */
    handleExportItineraryGpx() {
        if (!this.currentItinerary) {
            this.showError('No itinerary to export. Please generate an itinerary first.');
            return;
        }

        const gpxContent = generateGPX(this.currentItinerary, {
            name: 'Birding Itinerary',
            description: `Optimized birding route with ${this.currentItinerary.summary.totalStops} stops`
        });

        downloadGPX(gpxContent, 'birding-itinerary');
        this.showSuccessToast('GPX downloaded!');
    }

    /**
     * Toggle species list visibility
     * @param {HTMLElement} toggle - Toggle button element
     */
    toggleSpeciesList(toggle) {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', !expanded);

        const speciesList = toggle.nextElementSibling;
        if (speciesList) {
            speciesList.classList.toggle('hidden');
        }
    }

    /**
     * Initialize or update the results map with hotspot markers
     * @param {Object} origin - Origin coordinates {lat, lng}
     * @param {Array} hotspots - Array of hotspot objects
     */
    initResultsMap(origin, hotspots) {
        // Destroy existing map if it exists
        if (this.resultsMapInstance) {
            this.resultsMapInstance.remove();
            this.resultsMapInstance = null;
        }

        // Calculate bounds to fit all points
        const allPoints = [
            [origin.lat, origin.lng],
            ...hotspots.map(h => [h.lat, h.lng])
        ];
        const bounds = L.latLngBounds(allPoints);

        // Initialize map
        this.resultsMapInstance = L.map(this.elements.resultsMap, {
            scrollWheelZoom: false  // Prevent accidental zooming while scrolling page
        });

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(this.resultsMapInstance);

        // Clear existing markers
        this.resultsMarkers = [];

        // Add origin marker (green with house icon)
        const originIcon = L.divIcon({
            className: 'origin-marker',
            html: '<svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        L.marker([origin.lat, origin.lng], { icon: originIcon })
            .bindPopup('Your Location')
            .addTo(this.resultsMapInstance);

        // Add hotspot markers (numbered, orange)
        hotspots.forEach((hotspot, index) => {
            const number = index + 1;
            const hotspotIcon = L.divIcon({
                className: 'hotspot-marker',
                html: `${number}`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            const marker = L.marker([hotspot.lat, hotspot.lng], { icon: hotspotIcon })
                .bindPopup(`<strong>${hotspot.name}</strong><br>${hotspot.speciesCount} species`)
                .on('click', () => this.scrollToHotspotCard(number));

            marker.addTo(this.resultsMapInstance);
            this.resultsMarkers.push(marker);
        });

        // Fix map rendering if container was hidden, then fit bounds
        setTimeout(() => {
            this.resultsMapInstance.invalidateSize();
            // Fit bounds after size is validated, with maxZoom to prevent over-zooming
            this.resultsMapInstance.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 12  // Prevent zooming in too far
            });
        }, 100);
    }

    /**
     * Scroll to and highlight a hotspot card
     * @param {number} number - Hotspot number (1-based)
     */
    scrollToHotspotCard(number) {
        const cards = this.elements.hotspotCards.querySelectorAll('.hotspot-card');
        const card = cards[number - 1];
        if (card) {
            // Remove highlight from all cards
            cards.forEach(c => c.classList.remove('highlight'));

            // Scroll to card
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Add highlight
            card.classList.add('highlight');

            // Remove highlight after animation
            setTimeout(() => card.classList.remove('highlight'), 2000);
        }
    }

    /**
     * Handle cancel search button click
     */
    handleCancelSearch() {
        this.searchCancelled = true;
        this.hideLoading();
    }

    /**
     * Handle "New Search" button click
     */
    handleNewSearch() {
        // Clean up results map
        if (this.resultsMapInstance) {
            this.resultsMapInstance.remove();
            this.resultsMapInstance = null;
        }

        // Hide results section
        this.elements.resultsSection.classList.add('hidden');

        // Hide and clear rare bird alert
        this.elements.rareBirdAlert.classList.add('hidden');
        clearElement(this.elements.rareBirdAlert);

        // Hide and clear weather summary
        this.elements.weatherSummary.classList.add('hidden');
        clearElement(this.elements.weatherSummary);

        // Hide and clear migration alert
        this.elements.migrationAlert.classList.add('hidden');
        clearElement(this.elements.migrationAlert);

        // Clear stored results
        this.currentResults = null;
        this.currentSortMethod = null;
        this.notableObservations = [];

        // Clear itinerary state
        this.currentItinerary = null;
        this.itineraryRouteLine = null;
        this.elements.itineraryPanel.classList.add('hidden');
        this.elements.itineraryResults.classList.add('hidden');
        this.elements.hotspotCards.classList.remove('hidden');

        // Show sort buttons again (may have been hidden for species search)
        this.elements.sortBySpecies.parentElement.classList.remove('hidden');

        // Scroll to top of form
        document.querySelector('.header').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Handle sort method change from toggle buttons
     * @param {string} method - 'species' or 'distance'
     */
    handleSortChange(method) {
        if (method === this.currentSortMethod || !this.currentResults) return;

        // Update button states
        this.elements.sortBySpecies.classList.toggle('active', method === 'species');
        this.elements.sortByDistance.classList.toggle('active', method === 'distance');
        this.elements.sortByDriving.classList.toggle('active', method === 'driving');

        // Re-sort the hotspots
        const sortedHotspots = this.sortHotspots(
            this.currentResults.hotspots,
            method,
            this.currentResults.origin
        );

        // Update stored results
        this.currentResults.hotspots = sortedHotspots;
        this.currentResults.sortMethod = method;
        this.currentSortMethod = method;

        // Re-display results
        this.displayResults(this.currentResults);
    }

    /**
     * Handle "Export to PDF" button click
     */
    async handleExportPdf() {
        if (!this.currentResults) {
            this.showError('No results to export. Please perform a search first.');
            return;
        }

        this.showLoading('Generating PDF report...', 0);

        try {
            const pdf = await generatePDFReport(this.currentResults, (message, percent) => {
                this.updateLoading(message, percent);
            });

            downloadPDF(pdf, this.currentSortMethod);
            this.hideLoading();
            this.showSuccessToast('PDF downloaded!');
        } catch (error) {
            console.error('PDF generation error:', error);
            this.hideLoading();
            this.showError('Failed to generate PDF. Please try again.');
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
     * Show a brief success toast message
     * @param {string} message - Success message to display
     */
    showSuccessToast(message) {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'success-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.textContent = message;

        // Add to DOM
        document.body.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Remove after delay
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new BirdingHotspotsApp();
});
