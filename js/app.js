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

            // Search range
            searchRangeRadios: document.querySelectorAll('[name="searchRange"]'),

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
            addressError: document.getElementById('addressError')
        };

        // Debounce timer for address input
        this.addressDebounceTimer = null;

        // Leaflet map instance
        this.previewMap = null;
        this.previewMarker = null;

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

            // Limit to configured max
            hotspots = hotspots.slice(0, CONFIG.MAX_HOTSPOTS);

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

        this.updateLoading('Fetching hotspot addresses...', 50);

        // Fetch all addresses in parallel
        const addressPromises = hotspots.map(hotspot =>
            reverseGeocode(hotspot.lat, hotspot.lng)
                .catch(e => {
                    console.warn('Reverse geocoding failed:', e);
                    return { address: 'Address unavailable' };
                })
        );

        // Wait for all parallel requests
        this.updateLoading('Processing hotspot data...', 65);
        const [allObservations, allAddresses] = await Promise.all([
            Promise.all(observationsPromises),
            Promise.all(addressPromises)
        ]);

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
