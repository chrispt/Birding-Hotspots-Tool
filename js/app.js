/**
 * Birding Hotspots Finder - Main Application
 */

import { CONFIG, ErrorMessages, ErrorTypes } from './utils/constants.js';
import { validateCoordinates, validateApiKey, validateAddress, validateFavoriteName } from './utils/validators.js';
import { calculateDistance, formatDistance } from './utils/formatters.js';
import { storage } from './services/storage.js';
import { geocodeAddress, getCurrentPosition } from './api/geocoding.js';
import { reverseGeocode, batchReverseGeocode } from './api/reverse-geo.js';
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
            resultsMap: document.getElementById('resultsMap')
        };

        // Debounce timer for address input
        this.addressDebounceTimer = null;

        // Store results for PDF export
        this.currentResults = null;
        this.currentSortMethod = null;

        // Leaflet map instances
        this.previewMap = null;
        this.previewMarker = null;
        this.resultsMapInstance = null;
        this.resultsMarkers = [];

        // Track if address has been validated
        this.addressValidated = false;
        this.validatedCoords = null;

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

        // Results section buttons
        this.elements.newSearchBtn.addEventListener('click', () => this.handleNewSearch());
        this.elements.exportPdfBtn.addEventListener('click', () => this.handleExportPdf());

        // Sort toggle buttons
        this.elements.sortBySpecies.addEventListener('click', () => this.handleSortChange('species'));
        this.elements.sortByDistance.addEventListener('click', () => this.handleSortChange('distance'));

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

        // Update icon using safe DOM manipulation
        const eyePath = isPassword
            ? 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z'
            : 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z';

        // Clear and rebuild SVG path safely
        const svg = this.elements.eyeIcon;
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }
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
        while (btn.firstChild) {
            btn.removeChild(btn.firstChild);
        }
        // Create SVG icon
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('d', 'M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z');
        svg.appendChild(path);
        btn.appendChild(svg);
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
        this.elements.address.classList.remove('error');
    }

    /**
     * Show the map preview with Leaflet/OpenStreetMap
     */
    showMapPreview(lat, lng) {
        // Show the map preview section first
        this.elements.mapPreviewSection.classList.remove('hidden');

        // Update "Open in Google Maps" link
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        this.elements.openInGoogleMaps.href = mapsUrl;

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
     * Hide the map preview
     */
    hideMapPreview() {
        this.elements.mapPreviewSection.classList.add('hidden');
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
     * Initialize event delegation for favorites list (call once during setup)
     */
    initializeFavoritesDelegation() {
        this.elements.favoritesList.addEventListener('click', (e) => {
            const item = e.target.closest('.favorite-item');
            if (!item) return;

            const deleteBtn = e.target.closest('.favorite-delete');
            if (deleteBtn) {
                e.stopPropagation();
                const id = parseInt(item.dataset.id, 10);
                storage.removeFavorite(id);
                this.renderFavorites();
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
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

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

        try {
            // Validate API key
            const apiKeyValidation = validateApiKey(this.elements.apiKey.value);
            if (!apiKeyValidation.valid) {
                throw new Error(apiKeyValidation.error);
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
            const searchRange = this.getSearchRange();
            let hotspots = await this.ebirdApi.getNearbyHotspots(
                origin.lat,
                origin.lng,
                searchRange,
                CONFIG.DEFAULT_DAYS_BACK
            );

            if (!hotspots || hotspots.length === 0) {
                throw new Error(ErrorMessages[ErrorTypes.NO_HOTSPOTS]);
            }

            // Debug: Log raw hotspot data from API
            console.log('Raw hotspots from API:', hotspots.length);
            console.log('Looking for Ferrum College:', hotspots.find(h => h.locName?.toLowerCase().includes('ferrum')));

            // Sort by distance from origin before limiting (eBird API doesn't guarantee order)
            hotspots.sort((a, b) => {
                const distA = calculateDistance(origin.lat, origin.lng, a.lat, a.lng);
                const distB = calculateDistance(origin.lat, origin.lng, b.lat, b.lng);
                return distA - distB;
            });

            // Debug: Log sorted hotspots with distances
            console.log('After distance sort, first 15:', hotspots.slice(0, 15).map(h => ({
                name: h.locName,
                dist: calculateDistance(origin.lat, origin.lng, h.lat, h.lng).toFixed(2) + ' km'
            })));

            // Limit to user-selected count
            const hotspotsCount = parseInt(document.querySelector('[name="hotspotsCount"]:checked').value, 10);
            hotspots = hotspots.slice(0, hotspotsCount);

            // Fetch notable species in the area
            this.updateLoading('Fetching notable species...', 25);
            let notableSpecies = new Set();
            try {
                const notable = await this.ebirdApi.getNotableObservationsNearby(
                    origin.lat,
                    origin.lng,
                    searchRange,
                    CONFIG.DEFAULT_DAYS_BACK
                );
                notableSpecies = new Set(notable.map(o => o.speciesCode));
            } catch (e) {
                console.warn('Could not fetch notable species:', e);
            }

            // Enrich hotspot data
            this.updateLoading('Loading hotspot details...', 30);
            let enrichedHotspots = await this.enrichHotspots(hotspots, origin, notableSpecies);

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
            const progress = 55 + (current / total) * 20; // 55% to 75%
            this.updateLoading(`Fetching address ${current}/${total}...`, progress);
        });

        this.updateLoading('Building hotspot details...', 80);

        // Process results (fast, no waiting)
        return hotspots.map((hotspot, i) => {
            const observations = allObservations[i];
            const addrResult = allAddresses[i];
            const distance = calculateDistance(origin.lat, origin.lng, hotspot.lat, hotspot.lng);
            const birds = processObservations(observations, notableSpecies);

            return {
                locId: hotspot.locId,
                name: hotspot.locName,
                lat: hotspot.lat,
                lng: hotspot.lng,
                speciesCount: birds.length,
                address: addrResult.address || 'Address unavailable',
                distance,
                birds
            };
        });
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
     * Display results on screen
     * @param {Object} data - Results data object
     */
    displayResults(data) {
        const { origin, hotspots, sortMethod, generatedDate } = data;

        // Sync sort toggle buttons with current sort method
        this.elements.sortBySpecies.classList.toggle('active', sortMethod === 'species');
        this.elements.sortByDistance.classList.toggle('active', sortMethod === 'distance');

        // Update meta information (sort is now shown in toggle, so removed from text)
        this.elements.resultsMeta.textContent = `${hotspots.length} hotspots found | ${generatedDate}`;

        // Initialize results map
        this.initResultsMap(origin, hotspots);

        // Clear existing cards
        while (this.elements.hotspotCards.firstChild) {
            this.elements.hotspotCards.removeChild(this.elements.hotspotCards.firstChild);
        }

        // Generate hotspot cards
        hotspots.forEach((hotspot, index) => {
            const card = this.createHotspotCard(hotspot, index + 1, origin);
            this.elements.hotspotCards.appendChild(card);
        });

        // Show results section
        this.elements.resultsSection.classList.remove('hidden');

        // Scroll to results
        this.elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        const speciesIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        speciesIcon.setAttribute('viewBox', '0 0 24 24');
        speciesIcon.setAttribute('width', '16');
        speciesIcon.setAttribute('height', '16');
        const speciesPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        speciesPath.setAttribute('fill', 'currentColor');
        speciesPath.setAttribute('d', 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z');
        speciesIcon.appendChild(speciesPath);
        speciesStat.appendChild(speciesIcon);
        speciesStat.appendChild(document.createTextNode(` ${hotspot.speciesCount} species`));

        // Distance stat
        const distanceStat = document.createElement('span');
        distanceStat.className = 'stat distance';
        const distanceIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        distanceIcon.setAttribute('viewBox', '0 0 24 24');
        distanceIcon.setAttribute('width', '16');
        distanceIcon.setAttribute('height', '16');
        const distancePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        distancePath.setAttribute('fill', 'currentColor');
        distancePath.setAttribute('d', 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z');
        distanceIcon.appendChild(distancePath);
        distanceStat.appendChild(distanceIcon);
        distanceStat.appendChild(document.createTextNode(` ${distanceText}`));

        stats.appendChild(speciesStat);
        stats.appendChild(distanceStat);
        titleSection.appendChild(nameH3);
        titleSection.appendChild(stats);
        header.appendChild(numberDiv);
        header.appendChild(titleSection);

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
        directionsLink.rel = 'noopener';
        directionsLink.className = 'hotspot-link';
        const directionsIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        directionsIcon.setAttribute('viewBox', '0 0 24 24');
        directionsIcon.setAttribute('width', '16');
        directionsIcon.setAttribute('height', '16');
        const directionsPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        directionsPath.setAttribute('fill', 'currentColor');
        directionsPath.setAttribute('d', 'M21.71 11.29l-9-9c-.39-.39-1.02-.39-1.41 0l-9 9c-.39.39-.39 1.02 0 1.41l9 9c.39.39 1.02.39 1.41 0l9-9c.39-.38.39-1.01 0-1.41zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z');
        directionsIcon.appendChild(directionsPath);
        directionsLink.appendChild(directionsIcon);
        directionsLink.appendChild(document.createTextNode(' Get Directions'));

        // eBird link
        const ebirdLink = document.createElement('a');
        ebirdLink.href = ebirdUrl;
        ebirdLink.target = '_blank';
        ebirdLink.rel = 'noopener';
        ebirdLink.className = 'hotspot-link';
        const ebirdIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ebirdIcon.setAttribute('viewBox', '0 0 24 24');
        ebirdIcon.setAttribute('width', '16');
        ebirdIcon.setAttribute('height', '16');
        const ebirdPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ebirdPath.setAttribute('fill', 'currentColor');
        ebirdPath.setAttribute('d', 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z');
        ebirdIcon.appendChild(ebirdPath);
        ebirdLink.appendChild(ebirdIcon);
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

        const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        chevron.setAttribute('class', 'chevron');
        chevron.setAttribute('viewBox', '0 0 24 24');
        chevron.setAttribute('width', '20');
        chevron.setAttribute('height', '20');
        const chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        chevronPath.setAttribute('fill', 'currentColor');
        chevronPath.setAttribute('d', 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z');
        chevron.appendChild(chevronPath);

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

        // Assemble card
        card.appendChild(header);
        card.appendChild(details);
        card.appendChild(speciesSection);

        return card;
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

        // Clear stored results
        this.currentResults = null;
        this.currentSortMethod = null;

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
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new BirdingHotspotsApp();
});
