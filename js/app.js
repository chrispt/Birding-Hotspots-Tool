/**
 * Birding Hotspots Finder - Main Application
 */

import { CONFIG, ErrorMessages, ErrorTypes } from './utils/constants.js';
import { validateCoordinates, validateApiKey, validateAddress, validateFavoriteName } from './utils/validators.js';
import { calculateDistance, formatDistance, formatDuration, getGoogleMapsSearchUrl, getGoogleMapsDirectionsUrl, getGoogleMapsRouteUrl } from './utils/formatters.js';
import { createSVGIcon, ICONS } from './utils/icons.js';
import { clearElement } from './utils/dom-helpers.js';
import { storage } from './services/storage.js';
import { geocodeAddress, getCurrentPosition } from './api/geocoding.js';
import { reverseGeocode, batchReverseGeocode } from './api/reverse-geo.js';
import { EBirdAPI, processObservations } from './api/ebird.js';
import { generatePDFReport, downloadPDF, generateRoutePDFReport, downloadRoutePDF } from './services/pdf-generator.js';
import { getDrivingRoutes, getRouteThrough } from './api/routing.js';
import { getWeatherForLocations, getOverallBirdingConditions, getBirdingConditionScore } from './api/weather.js';
import { SpeciesSearch } from './services/species-search.js';
import { getSeasonalInsights, getOptimalBirdingTimes, getCurrentSeason } from './services/seasonal-insights.js';
import { buildItinerary, formatItineraryDuration, formatItineraryTime, calculateUniquenessScore, getSeenSpeciesFromHotspots } from './services/itinerary-builder.js';
import { generateGPX, downloadGPX } from './services/gpx-generator.js';
import { LifeListService } from './services/life-list.js';

/**
 * Main application class
 */
class BirdingHotspotsApp {
    constructor() {
        this.ebirdApi = null;
        this.currentLocation = null;
        this.isProcessing = false;

        // Life list service for lifer detection
        this.lifeListService = new LifeListService();
        this.taxonomy = []; // Cached taxonomy for CSV import

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

            // Advanced Options
            advancedOptionsToggle: document.getElementById('advancedOptionsToggle'),
            advancedOptionsContent: document.getElementById('advancedOptionsContent'),

            // Favorites
            favoritesList: document.getElementById('favoritesList'),
            saveFavorite: document.getElementById('saveFavorite'),
            savedLocationsToggle: document.getElementById('savedLocationsToggle'),
            savedLocationsContent: document.getElementById('savedLocationsContent'),
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

            // Validation indicators
            addressValidationIcon: document.getElementById('addressValidationIcon'),
            routeStartValidationIcon: document.getElementById('routeStartValidationIcon'),
            routeEndValidationIcon: document.getElementById('routeEndValidationIcon'),
            endAddressValidationIcon: document.getElementById('endAddressValidationIcon'),

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
            liferAlert: document.getElementById('liferAlert'),
            weatherSummary: document.getElementById('weatherSummary'),
            migrationAlert: document.getElementById('migrationAlert'),
            // Life list elements
            lifeListToggle: document.getElementById('lifeListToggle'),
            lifeListContent: document.getElementById('lifeListContent'),
            lifeListCount: document.getElementById('lifeListCount'),
            importLifeList: document.getElementById('importLifeList'),
            clearLifeList: document.getElementById('clearLifeList'),
            // Search type selection (Step 1)
            locationSearchBtn: document.getElementById('locationSearchBtn'),
            routeSearchBtn: document.getElementById('routeSearchBtn'),
            // Search sections (Step 2)
            locationSearchSection: document.getElementById('locationSearchSection'),
            routeSearchSection: document.getElementById('routeSearchSection'),
            // Reset buttons
            resetLocationSearch: document.getElementById('resetLocationSearch'),
            resetRouteSearch: document.getElementById('resetRouteSearch'),
            // Sub-toggle for location search
            hotspotSubBtn: document.getElementById('hotspotSubBtn'),
            speciesSubBtn: document.getElementById('speciesSubBtn'),
            // Species search elements
            speciesSearchPanel: document.getElementById('speciesSearchPanel'),
            speciesDropdown: document.getElementById('speciesDropdown'),
            selectedSpecies: document.getElementById('selectedSpecies'),
            speciesSearchInput: document.getElementById('speciesSearchInput'),
            // Route planning elements
            routePlanningPanel: document.getElementById('routePlanningPanel'),
            routeStartAddress: document.getElementById('routeStartAddress'),
            routeStartError: document.getElementById('routeStartError'),
            routeEndAddress: document.getElementById('routeEndAddress'),
            routeEndError: document.getElementById('routeEndError'),
            useCurrentLocationStart: document.getElementById('useCurrentLocationStart'),
            useCurrentLocationEnd: document.getElementById('useCurrentLocationEnd'),
            routeMaxDetour: document.getElementById('routeMaxDetour'),
            routeMaxDetourValue: document.getElementById('routeMaxDetourValue'),
            routeTargetSpeciesInput: document.getElementById('routeTargetSpeciesInput'),
            routeTargetSpeciesDropdown: document.getElementById('routeTargetSpeciesDropdown'),
            routeTargetSpeciesTags: document.getElementById('routeTargetSpeciesTags'),
            liferOptimizeSection: document.getElementById('liferOptimizeSection'),
            liferOptimizeMode: document.getElementById('liferOptimizeMode'),
            // Route preview elements
            routePreviewSection: document.getElementById('routePreviewSection'),
            routePreviewMap: document.getElementById('routePreviewMap'),
            routeDistanceValue: document.getElementById('routeDistanceValue'),
            routeDurationValue: document.getElementById('routeDurationValue'),
            openRouteInGoogleMaps: document.getElementById('openRouteInGoogleMaps'),
            // Route hotspots selection elements
            routeHotspotsSection: document.getElementById('routeHotspotsSection'),
            routeHotspotsMeta: document.getElementById('routeHotspotsMeta'),
            routeHotspotsList: document.getElementById('routeHotspotsList'),
            selectAllRouteHotspots: document.getElementById('selectAllRouteHotspots'),
            deselectAllRouteHotspots: document.getElementById('deselectAllRouteHotspots'),
            selectedHotspotsCount: document.getElementById('selectedHotspotsCount'),
            buildRouteItinerary: document.getElementById('buildRouteItinerary'),
            sortOptionsSection: document.getElementById('sortOptionsSection'),
            searchRangeSection: document.getElementById('searchRangeSection'),
            hotspotsCountSection: document.getElementById('hotspotsCountSection'),
            // Itinerary elements
            buildItineraryBtn: document.getElementById('buildItineraryBtn'),
            itineraryPanel: document.getElementById('itineraryPanel'),
            closeItineraryPanel: document.getElementById('closeItineraryPanel'),
            endLocationSelect: document.getElementById('endLocationSelect'),
            endLocationInputs: document.getElementById('endLocationInputs'),
            endAddress: document.getElementById('endAddress'),
            endAddressError: document.getElementById('endAddressError'),
            maxStops: document.getElementById('maxStops'),
            maxStopsValue: document.getElementById('maxStopsValue'),
            generateItinerary: document.getElementById('generateItinerary'),
            itineraryResults: document.getElementById('itineraryResults'),
            itinerarySummary: document.getElementById('itinerarySummary'),
            itineraryStops: document.getElementById('itineraryStops'),
            exportItineraryPdf: document.getElementById('exportItineraryPdf'),
            exportItineraryGpx: document.getElementById('exportItineraryGpx'),
            backToResults: document.getElementById('backToResults'),
            // Recent searches
            recentSearches: document.getElementById('recentSearches'),
            // Favorite hotspots section
            favoriteHotspotsSection: document.getElementById('favoriteHotspotsSection'),
            favoriteHotspotsList: document.getElementById('favoriteHotspotsList'),
            favoriteHotspotsToggle: document.getElementById('favoriteHotspotsToggle'),
            favoriteHotspotsContent: document.getElementById('favoriteHotspotsContent')
        };

        // Temperature unit preference (true = Fahrenheit, false = Celsius)
        this.useFahrenheit = storage.getTemperatureUnit() !== 'C';

        // Species search
        this.speciesSearch = null; // Initialized when API key is available
        this.selectedSpeciesData = null;
        this.speciesSearchDebounceTimer = null;
        this.speciesDropdownHighlightIndex = -1; // Track highlighted item for keyboard nav

        // Search type state (two-step flow)
        this.searchType = 'location'; // 'location' or 'route'
        this.searchSubMode = 'hotspot'; // 'hotspot' or 'species' (only for location type)

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

        // Track if end address has been validated (for itinerary)
        this.endAddressValidated = false;
        this.validatedEndCoords = null;

        // Track if route addresses have been validated
        this.routeStartValidated = false;
        this.validatedRouteStartCoords = null;
        this.routeEndValidated = false;
        this.validatedRouteEndCoords = null;

        // Store route hotspots for selection
        this.routeHotspots = [];
        this.routeStartAddress = null;
        this.routeEndAddressText = null;

        // Route preview map
        this.routePreviewMapInstance = null;
        this.routePreviewLine = null;
        this.routePreviewMarkers = [];

        // Track if search was cancelled
        this.searchCancelled = false;

        // Itinerary state
        this.currentItinerary = null;
        this.itineraryRouteLine = null;

        // Track partial failures during search
        this.partialFailures = [];

        this.initializeEventListeners();
        this.loadSavedData();
    }

    /**
     * Clean up all map instances to prevent memory leaks
     */
    cleanupMaps() {
        if (this.previewMap) {
            this.previewMap.remove();
            this.previewMap = null;
            this.previewMarker = null;
        }
        if (this.resultsMapInstance) {
            this.resultsMapInstance.remove();
            this.resultsMapInstance = null;
        }
        if (this.routePreviewMapInstance) {
            this.routePreviewMapInstance.remove();
            this.routePreviewMapInstance = null;
        }
        this.resultsMarkers = [];
        this.routePreviewMarkers = [];
        this.routePreviewLine = null;
        this.itineraryRouteLine = null;
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

        // Advanced options collapsible toggle
        this.elements.advancedOptionsToggle.addEventListener('click', () => this.toggleAdvancedOptions());

        // Saved locations collapsible toggle
        this.elements.savedLocationsToggle.addEventListener('click', () => this.toggleSavedLocations());

        // Life list collapsible toggle and actions
        this.elements.lifeListToggle.addEventListener('click', () => this.toggleLifeList());
        this.elements.importLifeList.addEventListener('change', (e) => this.handleLifeListImport(e));
        this.elements.clearLifeList.addEventListener('click', () => this.handleClearLifeList());

        // Favorite hotspots collapsible toggle
        if (this.elements.favoriteHotspotsToggle) {
            this.elements.favoriteHotspotsToggle.addEventListener('click', () => this.toggleFavoriteHotspots());
        }

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

        // Search type selection (Step 1)
        this.elements.locationSearchBtn.addEventListener('click', () => this.setSearchType('location'));
        this.elements.routeSearchBtn.addEventListener('click', () => this.setSearchType('route'));

        // Reset buttons
        this.elements.resetLocationSearch.addEventListener('click', () => this.resetLocationSearch());
        this.elements.resetRouteSearch.addEventListener('click', () => this.resetRouteSearch());

        // Search sub-mode toggle (hotspot vs species)
        this.elements.hotspotSubBtn.addEventListener('click', () => this.setSearchSubMode('hotspot'));
        this.elements.speciesSubBtn.addEventListener('click', () => this.setSearchSubMode('species'));

        // Route planning address validation
        this.elements.routeStartAddress.addEventListener('input', () => this.handleRouteStartInputChange());
        this.elements.routeStartAddress.addEventListener('blur', () => this.handleRouteStartBlur());
        this.elements.routeEndAddress.addEventListener('input', () => this.handleRouteEndInputChange());
        this.elements.routeEndAddress.addEventListener('blur', () => this.handleRouteEndBlur());
        this.elements.useCurrentLocationStart.addEventListener('click', () => this.handleUseCurrentLocationForRoute('start'));
        this.elements.useCurrentLocationEnd.addEventListener('click', () => this.handleUseCurrentLocationForRoute('end'));
        this.elements.routeMaxDetour.addEventListener('input', () => {
            this.elements.routeMaxDetourValue.textContent = this.elements.routeMaxDetour.value;
        });

        // Route target species autocomplete
        if (this.elements.routeTargetSpeciesInput) {
            this.elements.routeTargetSpeciesInput.addEventListener('input', () => this.handleRouteTargetSpeciesInput());
            this.elements.routeTargetSpeciesInput.addEventListener('focus', () => this.handleRouteTargetSpeciesFocus());
            this.elements.routeTargetSpeciesInput.addEventListener('keydown', (e) => this.handleRouteTargetSpeciesKeyboard(e));

            // Click outside to close dropdown
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.target-species-input-container')) {
                    this.hideRouteTargetSpeciesDropdown();
                }
            });

            // Event delegation for dropdown items
            this.elements.routeTargetSpeciesDropdown.addEventListener('click', (e) => {
                const option = e.target.closest('.species-option');
                if (option) {
                    const species = {
                        speciesCode: option.dataset.code,
                        commonName: option.dataset.name,
                        scientificName: option.dataset.scientific
                    };
                    this.selectRouteTargetSpecies(species);
                }
            });
        }

        // Initialize route target species storage
        this.routeTargetSpeciesList = [];

        // Species search input
        this.elements.speciesSearchInput.addEventListener('input', () => this.handleSpeciesSearchInput());
        this.elements.speciesSearchInput.addEventListener('focus', () => this.handleSpeciesSearchFocus());
        this.elements.speciesSearchInput.addEventListener('keydown', (e) => this.handleSpeciesDropdownKeyboard(e));

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
        this.elements.endAddress.addEventListener('input', () => this.handleEndAddressInputChange());
        this.elements.endAddress.addEventListener('blur', () => this.handleEndAddressBlur());
        this.elements.maxStops.addEventListener('input', () => {
            this.elements.maxStopsValue.textContent = this.elements.maxStops.value;
        });
        this.elements.generateItinerary.addEventListener('click', () => this.handleGenerateItinerary());
        this.elements.exportItineraryPdf.addEventListener('click', () => this.handleExportItineraryPdf());
        this.elements.exportItineraryGpx.addEventListener('click', () => this.handleExportItineraryGpx());
        this.elements.backToResults.addEventListener('click', () => this.handleBackToResults());

        // Route hotspots selection events
        this.elements.selectAllRouteHotspots.addEventListener('click', () => this.selectAllRouteHotspots());
        this.elements.deselectAllRouteHotspots.addEventListener('click', () => this.deselectAllRouteHotspots());
        this.elements.buildRouteItinerary.addEventListener('click', () => this.handleBuildRouteItinerary());
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

        // Load recent searches
        this.renderRecentSearches();

        // Load favorite hotspots
        this.renderFavoriteHotspots();

        // Initialize life list count
        this.updateLifeListCount();
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
     * Reset the location search section to its initial state
     */
    resetLocationSearch() {
        // Clear address input
        this.elements.address.value = '';
        this.addressValidated = false;
        this.validatedCoords = null;
        this.clearAddressError();
        this.hideValidationIndicator(this.elements.addressValidationIcon, this.elements.address);

        // Clear GPS inputs
        this.elements.latitude.value = '';
        this.elements.longitude.value = '';

        // Reset to address input mode
        const addressRadio = document.querySelector('[name="inputMode"][value="address"]');
        if (addressRadio) {
            addressRadio.checked = true;
            this.elements.addressInput.classList.remove('hidden');
            this.elements.gpsInput.classList.add('hidden');
        }

        // Hide map preview
        this.hideMapPreview();

        // Reset sub-mode to hotspot
        this.setSearchSubMode('hotspot');

        // Clear species search
        this.elements.speciesSearchInput.value = '';
        this.selectedSpeciesData = null;
        this.elements.selectedSpecies.classList.add('hidden');
        this.hideSpeciesDropdown();

        // Hide results section
        this.elements.resultsSection.classList.add('hidden');

        // Clear hotspot cards
        clearElement(this.elements.hotspotCards);

        // Focus the address input
        this.elements.address.focus();
    }

    /**
     * Reset the route search section to its initial state
     */
    resetRouteSearch() {
        // Clear start address
        this.elements.routeStartAddress.value = '';
        this.routeStartValidated = false;
        this.validatedRouteStartCoords = null;
        this.hideValidationIndicator(this.elements.routeStartValidationIcon, this.elements.routeStartAddress);
        this.elements.routeStartAddress.classList.remove('error');
        this.elements.routeStartError.classList.add('hidden');
        this.elements.routeStartError.textContent = '';

        // Clear end address
        this.elements.routeEndAddress.value = '';
        this.routeEndValidated = false;
        this.validatedRouteEndCoords = null;
        this.hideValidationIndicator(this.elements.routeEndValidationIcon, this.elements.routeEndAddress);
        this.elements.routeEndAddress.classList.remove('error');
        this.elements.routeEndError.classList.add('hidden');
        this.elements.routeEndError.textContent = '';

        // Reset detour slider to default
        this.elements.routeMaxDetour.value = 5;
        this.elements.routeMaxDetourValue.textContent = '5';

        // Hide route preview section
        this.elements.routePreviewSection.classList.add('hidden');

        // Clean up route preview map
        if (this.routePreviewMapInstance) {
            if (this.routePreviewLine) {
                this.routePreviewMapInstance.removeLayer(this.routePreviewLine);
                this.routePreviewLine = null;
            }
            this.routePreviewMarkers.forEach(m => this.routePreviewMapInstance.removeLayer(m));
            this.routePreviewMarkers = [];
        }

        // Hide route hotspots section
        this.elements.routeHotspotsSection.classList.add('hidden');
        clearElement(this.elements.routeHotspotsList);
        this.routeHotspotMarkers = [];

        // Reset route data
        this.routeStartAddress = null;
        this.routeEndAddressText = null;
        this.currentRouteHotspots = [];

        // Clear target species
        this.routeTargetSpeciesList = [];
        this.renderRouteTargetSpeciesTags();
        if (this.elements.routeTargetSpeciesInput) {
            this.elements.routeTargetSpeciesInput.value = '';
        }

        // Hide results section
        this.elements.resultsSection.classList.add('hidden');

        // Focus the start address input
        this.elements.routeStartAddress.focus();
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
        this.hideValidationIndicator(this.elements.addressValidationIcon, this.elements.address);
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
            this.hideValidationIndicator(this.elements.addressValidationIcon, this.elements.address);
            return;
        }

        // Show loading indicator
        this.showValidationIndicator(this.elements.addressValidationIcon, this.elements.address, 'loading');
        this.clearAddressError();

        try {
            const result = await geocodeAddress(address);
            this.addressValidated = true;
            this.validatedCoords = { lat: result.lat, lng: result.lng };
            // Show resolved address so user can verify correct location was found
            this.elements.address.value = result.address;
            this.showValidationIndicator(this.elements.addressValidationIcon, this.elements.address, 'success');
            this.showMapPreview(result.lat, result.lng);
        } catch (error) {
            // Show error on blur if geocoding fails
            this.addressValidated = false;
            this.validatedCoords = null;
            this.showValidationIndicator(this.elements.addressValidationIcon, this.elements.address, 'error');
            this.showAddressError('Could not find this address. Please check the spelling or try a more specific address.');
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
     * Show validation indicator with specified state
     * @param {HTMLElement} iconElement - The indicator span element
     * @param {HTMLElement} inputElement - The input element
     * @param {'loading'|'success'|'error'} state - The validation state
     */
    showValidationIndicator(iconElement, inputElement, state) {
        if (!iconElement) return;

        // Clear previous state
        iconElement.classList.remove('hidden', 'loading', 'success', 'error');
        inputElement.classList.remove('success', 'error');

        // Clear existing content safely
        iconElement.textContent = '';

        // Set icon content based on state using safe DOM methods
        if (state === 'loading') {
            iconElement.appendChild(createSVGIcon('loading', 20));
            iconElement.classList.add('loading');
        } else if (state === 'success') {
            iconElement.appendChild(createSVGIcon('checkmark', 20));
            iconElement.classList.add('success');
            inputElement.classList.add('success');
        } else if (state === 'error') {
            iconElement.appendChild(createSVGIcon('x', 20));
            iconElement.classList.add('error');
            inputElement.classList.add('error');
        }
    }

    /**
     * Hide validation indicator
     * @param {HTMLElement} iconElement - The indicator span element
     * @param {HTMLElement} inputElement - The input element
     */
    hideValidationIndicator(iconElement, inputElement) {
        if (!iconElement) return;
        iconElement.classList.add('hidden');
        iconElement.classList.remove('loading', 'success', 'error');
        inputElement.classList.remove('success', 'error');
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

            // Add OpenStreetMap tiles (flat top-down style)
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19
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
     * Show the save favorite modal with focus trap
     */
    showSaveFavoriteModal() {
        // Store previously focused element
        this._previouslyFocusedElement = document.activeElement;

        this.elements.favoriteName.value = '';
        this.elements.saveFavoriteModal.classList.remove('hidden');
        this.elements.favoriteName.focus();

        // Add focus trap handler
        this._modalKeyHandler = (e) => this._handleModalKeydown(e);
        document.addEventListener('keydown', this._modalKeyHandler);
    }

    /**
     * Hide the save favorite modal and restore focus
     */
    hideSaveFavoriteModal() {
        this.elements.saveFavoriteModal.classList.add('hidden');

        // Remove focus trap handler
        if (this._modalKeyHandler) {
            document.removeEventListener('keydown', this._modalKeyHandler);
            this._modalKeyHandler = null;
        }

        // Restore focus to previously focused element
        if (this._previouslyFocusedElement) {
            this._previouslyFocusedElement.focus();
            this._previouslyFocusedElement = null;
        }
    }

    /**
     * Handle keydown events for modal focus trap
     * @param {KeyboardEvent} e - Keyboard event
     */
    _handleModalKeydown(e) {
        if (e.key !== 'Tab') return;

        const modal = this.elements.saveFavoriteModal;
        const focusableElements = modal.querySelectorAll(
            'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
            // Shift+Tab on first element: move to last
            e.preventDefault();
            lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
            // Tab on last element: move to first
            e.preventDefault();
            firstElement.focus();
        }
    }

    /**
     * Toggle the advanced options collapsible section
     */
    toggleAdvancedOptions() {
        const isExpanded = this.elements.advancedOptionsToggle.getAttribute('aria-expanded') === 'true';
        this.elements.advancedOptionsToggle.setAttribute('aria-expanded', !isExpanded);
        this.elements.advancedOptionsContent.classList.toggle('collapsed');
    }

    /**
     * Toggle the saved locations collapsible section
     */
    toggleSavedLocations() {
        const isExpanded = this.elements.savedLocationsToggle.getAttribute('aria-expanded') === 'true';
        this.elements.savedLocationsToggle.setAttribute('aria-expanded', !isExpanded);
        this.elements.savedLocationsContent.classList.toggle('collapsed');
    }

    /**
     * Toggle the life list collapsible section
     */
    toggleLifeList() {
        const isExpanded = this.elements.lifeListToggle.getAttribute('aria-expanded') === 'true';
        this.elements.lifeListToggle.setAttribute('aria-expanded', !isExpanded);
        this.elements.lifeListContent.classList.toggle('collapsed');
    }

    /**
     * Toggle the favorite hotspots collapsible section
     */
    toggleFavoriteHotspots() {
        if (!this.elements.favoriteHotspotsToggle || !this.elements.favoriteHotspotsContent) return;
        const isExpanded = this.elements.favoriteHotspotsToggle.getAttribute('aria-expanded') === 'true';
        this.elements.favoriteHotspotsToggle.setAttribute('aria-expanded', !isExpanded);
        this.elements.favoriteHotspotsContent.classList.toggle('collapsed');
    }

    /**
     * Handle life list CSV import
     * @param {Event} e - File input change event
     */
    async handleLifeListImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type (must be CSV or plain text)
        const validTypes = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];
        const extension = file.name.toLowerCase().endsWith('.csv');
        if (!validTypes.includes(file.type) && !extension) {
            this.showError('Please select a CSV file');
            e.target.value = '';
            return;
        }

        try {
            const content = await file.text();

            // Fetch taxonomy if not cached (needed to resolve species codes)
            if (this.taxonomy.length === 0 && this.ebirdApi) {
                this.showSuccessToast('Loading eBird taxonomy...');
                try {
                    this.taxonomy = await this.ebirdApi.getTaxonomy();
                } catch (err) {
                    console.warn('Could not fetch taxonomy:', err);
                    this.showError('Could not load eBird taxonomy. Some species may not be matched.');
                }
            }

            const result = this.lifeListService.importFromCSV(content, this.taxonomy);

            if (result.imported > 0) {
                this.updateLifeListCount();
                this.showSuccessToast(`Imported ${result.imported} species to your life list`);
            } else if (result.duplicates > 0) {
                this.showSuccessToast(`All ${result.duplicates} species were already on your list`);
            } else if (result.errors.length > 0) {
                this.showError(result.errors.join('. '));
            } else {
                this.showError('No species found in the CSV file');
            }
        } catch (err) {
            console.error('Life list import error:', err);
            this.showError('Failed to read CSV file');
        }

        // Reset the file input so the same file can be selected again
        e.target.value = '';
    }

    /**
     * Handle clearing the life list
     */
    handleClearLifeList() {
        // Use setTimeout to avoid blocking UI during confirm dialog
        setTimeout(() => {
            if (!confirm('Are you sure you want to clear your life list? This cannot be undone.')) {
                return;
            }

            this.lifeListService.clear();
            this.updateLifeListCount();
            this.showSuccessToast('Life list cleared');
        }, 0);
    }

    /**
     * Update the life list count badge in the UI
     */
    updateLifeListCount() {
        const count = this.lifeListService.getCount();
        this.elements.lifeListCount.textContent = `${count} species`;
        this.elements.clearLifeList.disabled = count === 0;

        // Show/hide lifer optimize section based on life list
        if (this.elements.liferOptimizeSection) {
            if (count > 0) {
                this.elements.liferOptimizeSection.classList.remove('hidden');
            } else {
                this.elements.liferOptimizeSection.classList.add('hidden');
            }
        }
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

        // Use DocumentFragment for batch append (reduces reflows)
        const fragment = document.createDocumentFragment();

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
            fragment.appendChild(item);
        });

        container.appendChild(fragment);
    }

    /**
     * Render recent searches as clickable chips
     */
    renderRecentSearches() {
        const searches = storage.getRecentSearches();
        const container = this.elements.recentSearches;

        if (!container) return;

        // Clear existing content
        clearElement(container);

        if (searches.length === 0) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');

        // Add header with clear button
        const header = document.createElement('div');
        header.className = 'recent-searches-header';

        const label = document.createElement('span');
        label.textContent = 'Recent searches:';

        const clearBtn = document.createElement('button');
        clearBtn.className = 'recent-searches-clear';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => {
            storage.clearRecentSearches();
            this.renderRecentSearches();
        });

        header.appendChild(label);
        header.appendChild(clearBtn);
        container.appendChild(header);

        // Add chips
        searches.forEach(search => {
            const chip = document.createElement('button');
            chip.className = 'recent-search-chip';
            chip.textContent = search.displayName;
            chip.title = search.displayName;
            chip.addEventListener('click', () => this.useRecentSearch(search));
            container.appendChild(chip);
        });
    }

    /**
     * Use a recent search to populate the form and run search
     */
    useRecentSearch(search) {
        // Switch to GPS mode and populate coordinates
        const gpsRadio = document.querySelector('[name="inputMode"][value="gps"]');
        if (gpsRadio) {
            gpsRadio.checked = true;
            this.toggleInputMode('gps');
        }

        this.elements.latitude.value = search.lat;
        this.elements.longitude.value = search.lng;

        // Trigger validation and search
        this.handleGenerateReport();
    }

    /**
     * Save a successful search to recent searches
     */
    saveRecentSearch(location) {
        if (!location || !location.lat || !location.lng) return;

        storage.addRecentSearch({
            displayName: location.address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
            lat: location.lat,
            lng: location.lng
        });

        // Update the UI
        this.renderRecentSearches();
    }

    /**
     * Copy species list to clipboard
     */
    async copySpeciesList(hotspotName, birds) {
        // Format the species list as a checklist
        const header = `Species Checklist - ${hotspotName}`;
        const separator = '='.repeat(Math.min(header.length, 40));
        const speciesList = birds.map(bird => `[ ] ${bird.comName}`).join('\n');
        const footer = `\n(${birds.length} species)`;

        const text = `${header}\n${separator}\n${speciesList}${footer}`;

        try {
            await navigator.clipboard.writeText(text);
            this.showToast(`${birds.length} species copied to clipboard`);
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showToast(`${birds.length} species copied to clipboard`);
            } catch (e) {
                this.showToast('Could not copy to clipboard', 'error');
            }
            document.body.removeChild(textArea);
        }
    }

    /**
     * Show a toast notification
     */
    showToast(message, type = 'success') {
        // Remove any existing toasts
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Render favorite hotspots section
     */
    renderFavoriteHotspots() {
        const favorites = storage.getFavoriteHotspots();
        const container = this.elements.favoriteHotspotsList;
        const section = this.elements.favoriteHotspotsSection;

        if (!container || !section) return;

        // Clear existing content
        clearElement(container);

        if (favorites.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');

        // Create list items
        favorites.forEach(fav => {
            const item = document.createElement('div');
            item.className = 'favorite-hotspot-item';
            item.dataset.locId = fav.locId;

            const info = document.createElement('a');
            info.className = 'favorite-hotspot-info';
            info.href = `https://ebird.org/hotspot/${fav.locId}`;
            info.target = '_blank';
            info.rel = 'noopener noreferrer';

            const name = document.createElement('span');
            name.className = 'favorite-hotspot-name';
            name.textContent = fav.name;

            info.appendChild(name);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'favorite-hotspot-delete';
            deleteBtn.title = 'Remove from favorites';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                storage.removeFavoriteHotspot(fav.locId);
                this.renderFavoriteHotspots();
                // Update any visible hotspot cards
                const starBtn = document.querySelector(`.favorite-hotspot-btn[data-loc-id="${fav.locId}"]`);
                if (starBtn) starBtn.classList.remove('is-favorite');
            });

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('width', '16');
            svg.setAttribute('height', '16');
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
        this.partialFailures = []; // Reset partial failures for new search

        // Create AbortController for cancellable requests
        this.abortController = new AbortController();

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

            // Initialize eBird API with abort signal
            this.ebirdApi = new EBirdAPI(apiKeyValidation.apiKey);
            this.ebirdApi.setAbortSignal(this.abortController.signal);

            // Delegate to route planning if in route mode
            if (this.searchType === 'route') {
                await this.handleRouteSearch();
                return;
            }

            // Delegate to species search if in species sub-mode
            if (this.searchSubMode === 'species') {
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
                        this.showAddressError('Could not find this address. Please check the spelling or try a more specific address.');
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
                this.partialFailures.push('notable species data');
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

            // Save to recent searches
            this.saveRecentSearch(origin);

            this.hideLoading();

            // Show warning if any data was unavailable
            this.showPartialFailureWarning();

        } catch (error) {
            // Don't show error if request was aborted by user
            if (error.name === 'AbortError') {
                console.log('Search cancelled by user');
                return;
            }

            console.error('Report generation error:', error);
            this.hideLoading();
            this.showError(error.message || 'An unexpected error occurred');
        } finally {
            this.isProcessing = false;
            this.abortController = null;
        }
    }

    /**
     * Enrich hotspots with additional data (parallelized for speed)
     */
    async enrichHotspots(hotspots, origin, notableSpecies) {
        this.updateLoading('Fetching hotspot observations...', 35);

        // Track failures for this enrichment
        let observationFailures = 0;
        let hotspotInfoFailures = 0;
        let addressFailures = 0;
        let drivingFailures = 0;
        let weatherFailed = false;

        // Fetch all observations in parallel
        const observationsPromises = hotspots.map(hotspot =>
            this.ebirdApi.getRecentObservations(hotspot.locId, CONFIG.DEFAULT_DAYS_BACK)
                .catch(e => {
                    console.warn(`Could not fetch observations for ${hotspot.locId}:`, e);
                    observationFailures++;
                    return [];
                })
        );

        // Fetch hotspot info in parallel (for quality indicators)
        const hotspotInfoPromises = hotspots.map(hotspot =>
            this.ebirdApi.getHotspotInfo(hotspot.locId)
                .catch(e => {
                    console.warn(`Could not fetch hotspot info for ${hotspot.locId}:`, e);
                    hotspotInfoFailures++;
                    return null;
                })
        );

        // Wait for all observation and hotspot info requests
        this.updateLoading('Processing observations...', 50);
        const [allObservations, allHotspotInfo] = await Promise.all([
            Promise.all(observationsPromises),
            Promise.all(hotspotInfoPromises)
        ]);

        // Fetch addresses with rate limiting to avoid 429 errors
        this.updateLoading('Fetching hotspot addresses...', 55);
        const locations = hotspots.map(h => ({ lat: h.lat, lng: h.lng }));
        const allAddresses = await batchReverseGeocode(locations, (current, total) => {
            const progress = 55 + (current / total) * 15; // 55% to 70%
            this.updateLoading(`Fetching address ${current}/${total}...`, progress);
        });

        // Count address failures
        allAddresses.forEach(result => {
            if (!result.address) addressFailures++;
        });

        // Fetch driving distances
        this.updateLoading('Calculating driving distances...', 70);
        const drivingRoutes = await getDrivingRoutes(origin.lat, origin.lng, locations);

        // Count driving route failures
        drivingRoutes.forEach(route => {
            if (!route) drivingFailures++;
        });

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
            weatherFailed = true;
        }

        // Record partial failures for notification
        if (observationFailures > 0) {
            this.partialFailures.push(`observations for ${observationFailures} hotspot${observationFailures > 1 ? 's' : ''}`);
        }
        if (hotspotInfoFailures > 0) {
            this.partialFailures.push(`hotspot details for ${hotspotInfoFailures} location${hotspotInfoFailures > 1 ? 's' : ''}`);
        }
        if (addressFailures > 0) {
            this.partialFailures.push(`addresses for ${addressFailures} location${addressFailures > 1 ? 's' : ''}`);
        }
        if (drivingFailures > 0) {
            this.partialFailures.push(`driving distances for ${drivingFailures} hotspot${drivingFailures > 1 ? 's' : ''}`);
        }
        if (weatherFailed) {
            this.partialFailures.push('weather data');
        }

        this.updateLoading('Building hotspot details...', 92);

        // Get life list codes and names for lifer detection
        const lifeListCodes = this.lifeListService.getLifeListCodes();
        const lifeListNames = this.lifeListService.getLifeListNames();

        // Process results (fast, no waiting)
        return hotspots.map((hotspot, i) => {
            const observations = allObservations[i];
            const addrResult = allAddresses[i];
            const hotspotInfo = allHotspotInfo[i];
            const distance = calculateDistance(origin.lat, origin.lng, hotspot.lat, hotspot.lng);
            const birds = processObservations(observations, notableSpecies, lifeListCodes, lifeListNames);
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
                weather,
                // Hotspot quality indicators
                totalSpecies: hotspotInfo?.numSpeciesAllTime ?? null,
                totalChecklists: hotspotInfo?.numChecklists ?? null
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

        // Switch to two-column layout
        document.querySelector('.main-content').classList.add('has-results');

        // Sync sort toggle buttons with current sort method
        this.elements.sortBySpecies.classList.toggle('active', sortMethod === 'species');
        this.elements.sortByDistance.classList.toggle('active', sortMethod === 'distance');
        this.elements.sortByDriving.classList.toggle('active', sortMethod === 'driving');

        // Ensure export PDF button is visible (may have been hidden in route mode)
        this.elements.exportPdfBtn.classList.remove('hidden');

        // Update meta information (sort is now shown in toggle, so removed from text)
        this.elements.resultsMeta.textContent = `${hotspots.length} hotspots found | ${generatedDate}`;

        // Render rare bird alert banner if there are notable observations
        this.renderRareBirdAlert();

        // Render lifer alert banner if user has a life list
        this.renderLiferAlert(hotspots);

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
            // Generate hotspot cards using DocumentFragment for batch append (reduces reflows)
            const fragment = document.createDocumentFragment();
            hotspots.forEach((hotspot, index) => {
                const card = this.createHotspotCard(hotspot, index + 1, origin);
                fragment.appendChild(card);
            });
            this.elements.hotspotCards.appendChild(fragment);
        }

        // Show results section
        this.elements.resultsSection.classList.remove('hidden');

        // Scroll to results and set focus for accessibility
        this.elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Focus results section after scroll animation for screen reader users
        setTimeout(() => {
            this.elements.resultsSection.focus();
        }, 500);
    }

    /**
     * Extract eBird region code from reverse geocode address data
     * @param {Object} addressData - Raw address data from LocationIQ
     * @returns {string|null} eBird region code (e.g., "US-FL") or null
     */
    extractRegionCode(addressData) {
        if (!addressData) return null;

        const countryCode = addressData.country_code?.toUpperCase();
        if (!countryCode) return null;

        // For US, use state code
        if (countryCode === 'US' && addressData.state) {
            const stateCode = this.getUSStateCode(addressData.state);
            if (stateCode) {
                return `US-${stateCode}`;
            }
        }

        // For other countries, just use country code
        return countryCode;
    }

    /**
     * Get US state code from state name
     * @param {string} stateName - Full state name
     * @returns {string|null} Two-letter state code or null
     */
    getUSStateCode(stateName) {
        const states = {
            'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
            'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
            'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
            'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
            'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
            'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
            'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
            'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
            'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
            'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
            'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
            'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
            'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
            'puerto rico': 'PR', 'guam': 'GU', 'virgin islands': 'VI'
        };
        const normalized = stateName.toLowerCase().trim();
        return states[normalized] || null;
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
     * Render the lifer alert banner showing potential lifers across all hotspots
     * @param {Array} hotspots - Array of hotspot data with birds
     */
    renderLiferAlert(hotspots) {
        const container = this.elements.liferAlert;
        clearElement(container);

        // Only show if user has a life list
        if (!this.lifeListService.hasLifeList()) {
            container.classList.add('hidden');
            return;
        }

        // Collect all lifers across all hotspots (unique by species code)
        const liferMap = new Map();
        for (const hotspot of hotspots) {
            for (const bird of hotspot.birds) {
                if (bird.isLifer && !liferMap.has(bird.speciesCode)) {
                    liferMap.set(bird.speciesCode, {
                        comName: bird.comName,
                        sciName: bird.sciName,
                        speciesCode: bird.speciesCode,
                        lastSeen: bird.lastSeen,
                        hotspotName: hotspot.name
                    });
                }
            }
        }

        const lifers = Array.from(liferMap.values());

        if (lifers.length === 0) {
            container.classList.add('hidden');
            return;
        }

        // Sort alphabetically
        lifers.sort((a, b) => a.comName.localeCompare(b.comName));

        // Show first 5 in preview, rest hidden
        const previewCount = 5;
        const previewItems = lifers.slice(0, previewCount);
        const hasMore = lifers.length > previewCount;

        // Create alert element
        const alert = document.createElement('div');
        alert.className = 'lifer-alert';

        // Header
        const header = document.createElement('div');
        header.className = 'lifer-alert-header';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'lifer-alert-icon';
        iconSpan.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;

        const title = document.createElement('h3');
        title.className = 'lifer-alert-title';
        title.textContent = 'POTENTIAL LIFERS';

        const count = document.createElement('span');
        count.className = 'lifer-alert-count';
        count.textContent = `${lifers.length} ${lifers.length === 1 ? 'species' : 'species'} you haven't seen`;

        header.appendChild(iconSpan);
        header.appendChild(title);
        header.appendChild(count);

        // List
        const list = document.createElement('ul');
        list.className = 'lifer-alert-list';

        previewItems.forEach(lifer => {
            const li = document.createElement('li');
            li.className = 'lifer-alert-item';

            const strong = document.createElement('strong');
            strong.textContent = lifer.comName;

            const location = document.createElement('span');
            location.className = 'lifer-alert-location';
            location.textContent = ` at ${lifer.hotspotName}`;

            const date = document.createElement('span');
            date.className = 'lifer-alert-date';
            date.textContent = `(${this.formatRelativeDate(lifer.lastSeen)})`;

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
            hiddenList.className = 'lifer-alert-list hidden';
            hiddenList.id = 'liferAlertMoreList';

            lifers.slice(previewCount).forEach(lifer => {
                const li = document.createElement('li');
                li.className = 'lifer-alert-item';

                const strong = document.createElement('strong');
                strong.textContent = lifer.comName;

                const location = document.createElement('span');
                location.className = 'lifer-alert-location';
                location.textContent = ` at ${lifer.hotspotName}`;

                const date = document.createElement('span');
                date.className = 'lifer-alert-date';
                date.textContent = `(${this.formatRelativeDate(lifer.lastSeen)})`;

                li.appendChild(strong);
                li.appendChild(location);
                li.appendChild(date);
                hiddenList.appendChild(li);
            });

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'lifer-alert-toggle';
            toggle.setAttribute('aria-expanded', 'false');

            const toggleText = document.createElement('span');
            toggleText.textContent = `View all ${lifers.length} potential lifers`;

            const chevron = createSVGIcon('chevron', 16, 'chevron');

            toggle.appendChild(toggleText);
            toggle.appendChild(chevron);

            toggle.addEventListener('click', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', !expanded);
                hiddenList.classList.toggle('hidden');
                toggleText.textContent = expanded
                    ? `View all ${lifers.length} potential lifers`
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
     * Set search type (location or route) - Step 1
     * @param {string} type - 'location' or 'route'
     */
    setSearchType(type) {
        this.searchType = type;

        // Update Step 1 card states
        this.elements.locationSearchBtn.classList.toggle('active', type === 'location');
        this.elements.routeSearchBtn.classList.toggle('active', type === 'route');

        // Toggle Step 2 sections
        this.elements.locationSearchSection.classList.toggle('hidden', type !== 'location');
        this.elements.routeSearchSection.classList.toggle('hidden', type !== 'route');

        // Toggle location-specific sections (only visible for location search, not route)
        const showLocationOptions = type === 'location' && this.searchSubMode === 'hotspot';
        this.elements.sortOptionsSection.classList.toggle('hidden', !showLocationOptions);

        // Search range and hotspots count are for location search only
        this.elements.searchRangeSection.classList.toggle('hidden', type !== 'location');
        this.elements.hotspotsCountSection.classList.toggle('hidden', type !== 'location' || this.searchSubMode === 'species');

        // Update generate button
        this.updateGenerateButton();

        // Focus first input when entering route mode
        if (type === 'route') {
            this.elements.routeStartAddress.focus();
        }
    }

    /**
     * Set search sub-mode (hotspot or species) - for location search type
     * @param {string} mode - 'hotspot' or 'species'
     */
    setSearchSubMode(mode) {
        this.searchSubMode = mode;

        // Update sub-toggle buttons
        this.elements.hotspotSubBtn.classList.toggle('active', mode === 'hotspot');
        this.elements.speciesSubBtn.classList.toggle('active', mode === 'species');

        // Toggle species panel
        this.elements.speciesSearchPanel.classList.toggle('hidden', mode !== 'species');

        // Toggle sort options and hotspots count (only for hotspot mode)
        this.elements.sortOptionsSection.classList.toggle('hidden', mode === 'species');
        this.elements.hotspotsCountSection.classList.toggle('hidden', mode === 'species');

        // Update generate button
        this.updateGenerateButton();

        // Initialize species search if switching to species mode
        if (mode === 'species' && !this.speciesSearch) {
            this.initializeSpeciesSearch();
        }
    }

    /**
     * Update the generate button text based on current search type and sub-mode
     */
    updateGenerateButton() {
        // Clear button content safely
        this.elements.generateReport.textContent = '';

        if (this.searchType === 'route') {
            this.elements.generateReport.appendChild(createSVGIcon('directions', 24));
            this.elements.generateReport.appendChild(document.createTextNode(' Plan Route'));
        } else if (this.searchSubMode === 'species') {
            this.elements.generateReport.appendChild(createSVGIcon('search', 24));
            this.elements.generateReport.appendChild(document.createTextNode(' Find This Species'));
        } else {
            this.elements.generateReport.appendChild(createSVGIcon('search', 24));
            this.elements.generateReport.appendChild(document.createTextNode(' Find Hotspots'));
        }
    }

    /**
     * Initialize the species search service
     */
    async initializeSpeciesSearch() {
        const apiKey = this.elements.apiKey.value.trim();
        if (!apiKey) {
            this.showError('Please enter your eBird API key first');
            this.setSearchSubMode('hotspot');
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
        this.speciesDropdownHighlightIndex = -1;
    }

    /**
     * Handle keyboard navigation for species dropdown
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleSpeciesDropdownKeyboard(e) {
        const dropdown = this.elements.speciesDropdown;
        if (dropdown.classList.contains('hidden')) return;

        const options = dropdown.querySelectorAll('.species-option');
        if (options.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.speciesDropdownHighlightIndex = Math.min(
                    this.speciesDropdownHighlightIndex + 1,
                    options.length - 1
                );
                this.updateSpeciesDropdownHighlight(options);
                break;

            case 'ArrowUp':
                e.preventDefault();
                this.speciesDropdownHighlightIndex = Math.max(
                    this.speciesDropdownHighlightIndex - 1,
                    0
                );
                this.updateSpeciesDropdownHighlight(options);
                break;

            case 'Enter':
                e.preventDefault();
                if (this.speciesDropdownHighlightIndex >= 0 && this.speciesDropdownHighlightIndex < options.length) {
                    const option = options[this.speciesDropdownHighlightIndex];
                    const species = {
                        speciesCode: option.dataset.code,
                        commonName: option.dataset.name,
                        scientificName: option.dataset.scientific
                    };
                    this.selectSpecies(species);
                }
                break;

            case 'Escape':
                e.preventDefault();
                this.hideSpeciesDropdown();
                break;
        }
    }

    /**
     * Update visual highlight for species dropdown options
     * @param {NodeList} options - Dropdown option elements
     */
    updateSpeciesDropdownHighlight(options) {
        options.forEach((opt, i) => {
            if (i === this.speciesDropdownHighlightIndex) {
                opt.classList.add('highlighted');
                opt.scrollIntoView({ block: 'nearest' });
            } else {
                opt.classList.remove('highlighted');
            }
        });
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

    // ==========================================
    // Route Target Species Autocomplete Methods
    // ==========================================

    /**
     * Handle route target species input change
     */
    handleRouteTargetSpeciesInput() {
        clearTimeout(this.routeTargetSpeciesDebounceTimer);

        const query = this.elements.routeTargetSpeciesInput.value.trim();

        if (query.length < 2) {
            this.hideRouteTargetSpeciesDropdown();
            return;
        }

        // Debounce search
        this.routeTargetSpeciesDebounceTimer = setTimeout(() => {
            this.performRouteTargetSpeciesSearch(query);
        }, 200);
    }

    /**
     * Handle route target species input focus
     */
    async handleRouteTargetSpeciesFocus() {
        // Initialize species search if not already done
        if (!this.speciesSearch) {
            const apiKey = this.elements.apiKey.value.trim();
            if (!apiKey) {
                this.showError('Please enter your eBird API key first');
                return;
            }
            this.speciesSearch = new SpeciesSearch(new EBirdAPI(apiKey));
            this.elements.routeTargetSpeciesInput.placeholder = 'Loading species data...';
            try {
                await this.speciesSearch.loadTaxonomy();
                this.elements.routeTargetSpeciesInput.placeholder = 'Start typing a bird name...';
            } catch (e) {
                console.error('Failed to load taxonomy:', e);
                this.elements.routeTargetSpeciesInput.placeholder = 'Failed to load species data';
                return;
            }
        }

        const query = this.elements.routeTargetSpeciesInput.value.trim();
        if (query.length >= 2 && this.speciesSearch?.isReady()) {
            this.performRouteTargetSpeciesSearch(query);
        }
    }

    /**
     * Perform species search for route target species
     * @param {string} query - Search query
     */
    performRouteTargetSpeciesSearch(query) {
        if (!this.speciesSearch?.isReady()) {
            this.showRouteTargetSpeciesDropdownMessage('Loading species data...');
            return;
        }

        const results = this.speciesSearch.searchSpecies(query, 8);

        // Filter out already selected species
        const filteredResults = results.filter(species =>
            !this.routeTargetSpeciesList.some(s => s.speciesCode === species.speciesCode)
        );

        if (filteredResults.length === 0) {
            this.showRouteTargetSpeciesDropdownMessage(
                results.length > 0 ? 'Species already selected' : 'No species found'
            );
            return;
        }

        this.renderRouteTargetSpeciesDropdown(filteredResults);
    }

    /**
     * Render route target species dropdown
     * @param {Array} results - Search results
     */
    renderRouteTargetSpeciesDropdown(results) {
        const dropdown = this.elements.routeTargetSpeciesDropdown;
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

            dropdown.appendChild(option);
        });

        dropdown.classList.remove('hidden');
        this.routeTargetSpeciesHighlightIndex = -1;
    }

    /**
     * Show message in route target species dropdown
     * @param {string} message - Message to show
     */
    showRouteTargetSpeciesDropdownMessage(message) {
        const dropdown = this.elements.routeTargetSpeciesDropdown;
        clearElement(dropdown);
        const messageDiv = document.createElement('div');
        messageDiv.className = 'species-dropdown-empty';
        messageDiv.textContent = message;
        dropdown.appendChild(messageDiv);
        dropdown.classList.remove('hidden');
    }

    /**
     * Hide route target species dropdown
     */
    hideRouteTargetSpeciesDropdown() {
        if (this.elements.routeTargetSpeciesDropdown) {
            this.elements.routeTargetSpeciesDropdown.classList.add('hidden');
        }
        this.routeTargetSpeciesHighlightIndex = -1;
    }

    /**
     * Handle keyboard navigation for route target species dropdown
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleRouteTargetSpeciesKeyboard(e) {
        const dropdown = this.elements.routeTargetSpeciesDropdown;
        if (!dropdown || dropdown.classList.contains('hidden')) return;

        const options = dropdown.querySelectorAll('.species-option');
        if (options.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.routeTargetSpeciesHighlightIndex = Math.min(
                    (this.routeTargetSpeciesHighlightIndex ?? -1) + 1,
                    options.length - 1
                );
                this.updateRouteTargetSpeciesDropdownHighlight(options);
                break;

            case 'ArrowUp':
                e.preventDefault();
                this.routeTargetSpeciesHighlightIndex = Math.max(
                    (this.routeTargetSpeciesHighlightIndex ?? 0) - 1,
                    0
                );
                this.updateRouteTargetSpeciesDropdownHighlight(options);
                break;

            case 'Enter':
                e.preventDefault();
                if (this.routeTargetSpeciesHighlightIndex >= 0 && this.routeTargetSpeciesHighlightIndex < options.length) {
                    const option = options[this.routeTargetSpeciesHighlightIndex];
                    const species = {
                        speciesCode: option.dataset.code,
                        commonName: option.dataset.name,
                        scientificName: option.dataset.scientific
                    };
                    this.selectRouteTargetSpecies(species);
                }
                break;

            case 'Escape':
                e.preventDefault();
                this.hideRouteTargetSpeciesDropdown();
                break;
        }
    }

    /**
     * Update visual highlight for route target species dropdown
     * @param {NodeList} options - Dropdown option elements
     */
    updateRouteTargetSpeciesDropdownHighlight(options) {
        options.forEach((opt, i) => {
            if (i === this.routeTargetSpeciesHighlightIndex) {
                opt.classList.add('highlighted');
                opt.scrollIntoView({ block: 'nearest' });
            } else {
                opt.classList.remove('highlighted');
            }
        });
    }

    /**
     * Select a route target species and add as tag
     * @param {Object} species - Selected species data
     */
    selectRouteTargetSpecies(species) {
        // Add to list if not already present
        if (!this.routeTargetSpeciesList.some(s => s.speciesCode === species.speciesCode)) {
            this.routeTargetSpeciesList.push(species);
            this.renderRouteTargetSpeciesTags();
        }

        // Clear input and hide dropdown
        this.elements.routeTargetSpeciesInput.value = '';
        this.hideRouteTargetSpeciesDropdown();
        this.elements.routeTargetSpeciesInput.focus();
    }

    /**
     * Remove a route target species tag
     * @param {string} speciesCode - Species code to remove
     */
    removeRouteTargetSpecies(speciesCode) {
        this.routeTargetSpeciesList = this.routeTargetSpeciesList.filter(
            s => s.speciesCode !== speciesCode
        );
        this.renderRouteTargetSpeciesTags();
    }

    /**
     * Render route target species tags
     */
    renderRouteTargetSpeciesTags() {
        const container = this.elements.routeTargetSpeciesTags;
        clearElement(container);

        this.routeTargetSpeciesList.forEach(species => {
            const tag = document.createElement('span');
            tag.className = 'target-species-tag';
            tag.dataset.code = species.speciesCode;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'target-species-tag-name';
            nameSpan.textContent = species.commonName;

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'target-species-tag-remove';
            removeBtn.setAttribute('aria-label', `Remove ${species.commonName}`);
            removeBtn.textContent = '\u00D7'; // × symbol
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeRouteTargetSpecies(species.speciesCode);
            });

            tag.appendChild(nameSpan);
            tag.appendChild(removeBtn);
            container.appendChild(tag);
        });
    }

    /**
     * Clear all route target species
     */
    clearRouteTargetSpecies() {
        this.routeTargetSpeciesList = [];
        this.renderRouteTargetSpeciesTags();
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
                        this.showAddressError('Could not find this address. Please check the spelling or try a more specific address.');
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
     * Handle route planning search (called from handleGenerateReport)
     * Finds birding hotspots along a route between two addresses
     */
    async handleRouteSearch() {
        // Validate start address
        const startAddress = this.elements.routeStartAddress.value.trim();
        if (startAddress.length < 3) {
            this.showRouteStartError('Please enter a starting address.');
            this.isProcessing = false;
            return;
        }

        // Validate end address
        const endAddress = this.elements.routeEndAddress.value.trim();
        if (endAddress.length < 3) {
            this.showRouteEndError('Please enter a destination address.');
            this.isProcessing = false;
            return;
        }

        this.showLoading('Validating addresses...', 0);

        // Geocode start address if not already validated
        let startCoords;
        if (this.routeStartValidated && this.validatedRouteStartCoords) {
            startCoords = this.validatedRouteStartCoords;
        } else {
            try {
                const result = await geocodeAddress(startAddress);
                startCoords = { lat: result.lat, lng: result.lng };
                this.routeStartValidated = true;
                this.validatedRouteStartCoords = startCoords;
                this.clearRouteStartError();
            } catch (error) {
                this.hideLoading();
                this.showRouteStartError('Could not find start address. Please check and try again.');
                this.isProcessing = false;
                return;
            }
        }

        // Geocode end address if not already validated
        let endCoords;
        if (this.routeEndValidated && this.validatedRouteEndCoords) {
            endCoords = this.validatedRouteEndCoords;
        } else {
            try {
                const result = await geocodeAddress(endAddress);
                endCoords = { lat: result.lat, lng: result.lng };
                this.routeEndValidated = true;
                this.validatedRouteEndCoords = endCoords;
                this.clearRouteEndError();
            } catch (error) {
                this.hideLoading();
                this.showRouteEndError('Could not find destination address. Please check and try again.');
                this.isProcessing = false;
                return;
            }
        }

        this.updateLoading('Finding hotspots along route...', 20);

        try {
            // Calculate midpoint of the route for hotspot search
            const midLat = (startCoords.lat + endCoords.lat) / 2;
            const midLng = (startCoords.lng + endCoords.lng) / 2;

            // Calculate distance between start and end to determine search radius
            const routeDistance = calculateDistance(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng);
            // Search radius should cover the route - use half the distance plus a buffer
            const searchRadius = Math.min(Math.max(routeDistance / 2 + 10, 20), 50); // Between 20-50 km

            // Fetch notable species in the route area for key bird highlighting
            this.updateLoading('Fetching notable species...', 25);
            let notableSpecies = new Set();
            try {
                const notable = await this.ebirdApi.getNotableObservationsNearby(
                    midLat,
                    midLng,
                    searchRadius,
                    CONFIG.DEFAULT_DAYS_BACK
                );
                notableSpecies = new Set(notable.map(o => o.speciesCode));
            } catch (e) {
                console.warn('Could not fetch notable species for route:', e);
            }

            // Get life list codes for lifer detection
            const lifeListCodes = this.lifeListService.getLifeListCodes();
            const lifeListNames = this.lifeListService.getLifeListNames();

            // Get target species codes from validated list
            this.routeTargetSpeciesCodes = this.routeTargetSpeciesList?.map(s => s.speciesCode) || [];
            // Also keep names for display purposes
            this.routeTargetSpeciesNames = this.routeTargetSpeciesList?.map(s => s.commonName.toLowerCase()) || [];

            this.updateLoading('Finding hotspots along route...', 30);

            // Fetch hotspots near the midpoint
            let hotspots = await this.ebirdApi.getNearbyHotspots(
                midLat,
                midLng,
                searchRadius,
                CONFIG.DEFAULT_DAYS_BACK
            );

            if (this.searchCancelled) {
                this.isProcessing = false;
                return;
            }

            if (!hotspots || hotspots.length === 0) {
                this.hideLoading();
                this.showError('No birding hotspots found along this route. Try a longer route or different locations.');
                this.isProcessing = false;
                return;
            }

            this.updateLoading('Loading hotspot details...', 40);

            // Filter hotspots to those reasonably close to the route line
            // Get max detour from slider (in miles), convert to km for calculations
            const maxDetourMiles = parseInt(this.elements.routeMaxDetour.value);
            const maxDetour = maxDetourMiles * 1.60934;
            hotspots = hotspots.filter(h => {
                const distFromStart = calculateDistance(startCoords.lat, startCoords.lng, h.lat, h.lng);
                const distFromEnd = calculateDistance(endCoords.lat, endCoords.lng, h.lat, h.lng);
                // Total detour should be reasonable
                return (distFromStart + distFromEnd) <= (routeDistance + maxDetour * 2);
            });

            if (hotspots.length === 0) {
                this.hideLoading();
                this.showError('No birding hotspots found along this route. Try a longer route or different locations.');
                this.isProcessing = false;
                return;
            }

            // Limit hotspots and get species data
            hotspots = hotspots.slice(0, 10);

            // Enrich hotspots with species data
            const enrichedHotspots = [];
            for (let i = 0; i < hotspots.length; i++) {
                if (this.searchCancelled) {
                    this.isProcessing = false;
                    return;
                }

                this.updateLoading(`Loading details for ${hotspots[i].locName}...`, 40 + (i / hotspots.length) * 30);

                try {
                    const observations = await this.ebirdApi.getRecentObservations(
                        hotspots[i].locId,
                        CONFIG.DEFAULT_DAYS_BACK
                    );
                    const birds = processObservations(observations, notableSpecies, lifeListCodes, lifeListNames);

                    enrichedHotspots.push({
                        ...hotspots[i],
                        name: hotspots[i].locName,
                        lat: hotspots[i].lat,
                        lng: hotspots[i].lng,
                        locId: hotspots[i].locId,
                        speciesCount: birds.length,
                        birds: birds,
                        distance: calculateDistance(startCoords.lat, startCoords.lng, hotspots[i].lat, hotspots[i].lng)
                    });
                } catch (e) {
                    console.warn(`Failed to get details for hotspot ${hotspots[i].locId}:`, e);
                }
            }

            if (enrichedHotspots.length === 0) {
                this.hideLoading();
                this.showError('Could not load hotspot details. Please try again.');
                this.isProcessing = false;
                return;
            }

            // Sort hotspots by species count (highest first)
            enrichedHotspots.sort((a, b) => b.speciesCount - a.speciesCount);

            this.hideLoading();

            // Store route data for later itinerary building
            this.routeHotspots = enrichedHotspots;
            this.routeStartAddress = startAddress;
            this.routeEndAddressText = endAddress;

            // Display hotspots for user selection
            this.displayRouteHotspotsSelection(enrichedHotspots);

        } catch (error) {
            this.hideLoading();
            this.showError(`Failed to find hotspots: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Display route hotspots for user selection
     * @param {Array} hotspots - Enriched hotspots along the route
     */
    displayRouteHotspotsSelection(hotspots) {
        // Clear previous list
        clearElement(this.elements.routeHotspotsList);

        // Update meta text
        this.elements.routeHotspotsMeta.textContent = `Found ${hotspots.length} birding ${hotspots.length === 1 ? 'hotspot' : 'hotspots'} along your route`;

        // Create hotspot cards with checkboxes
        hotspots.forEach((hotspot, index) => {
            const card = this.createRouteHotspotCard(hotspot, index);
            this.elements.routeHotspotsList.appendChild(card);
        });

        // Add hotspot markers to the preview map (if it exists)
        if (this.routePreviewMapInstance) {
            // Clear any existing preview hotspot markers (keep start/end and route line)
            this.routePreviewMarkers.forEach((marker, i) => {
                // Keep first two markers (start and end)
                if (i >= 2) {
                    this.routePreviewMapInstance.removeLayer(marker);
                }
            });
            this.routePreviewMarkers = this.routePreviewMarkers.slice(0, 2);

            // Store hotspot markers separately for selection sync
            this.routeHotspotMarkers = [];

            // Add markers for found hotspots with species count
            hotspots.forEach((h, index) => {
                // Check if hotspot has target species
                const targetSpeciesCodes = this.routeTargetSpeciesCodes || [];
                const hasTargetSpecies = h.birds && h.birds.some(bird =>
                    targetSpeciesCodes.includes(bird.speciesCode)
                );

                const marker = L.circleMarker([h.lat, h.lng], {
                    radius: hasTargetSpecies ? 12 : 10,
                    fillColor: '#FF9800', // Orange = unselected (none selected by default)
                    color: hasTargetSpecies ? '#1976D2' : '#fff', // Blue border if has target species
                    weight: hasTargetSpecies ? 3 : 2,
                    fillOpacity: 0.85
                }).addTo(this.routePreviewMapInstance);

                // Store target species flag for later reference
                marker.hasTargetSpecies = hasTargetSpecies;

                // Store index for click handler
                marker.hotspotIndex = index;

                // Create popup with add/remove button using safe DOM methods
                const popupContent = document.createElement('div');
                popupContent.className = 'hotspot-popup';

                const nameStrong = document.createElement('strong');
                nameStrong.textContent = h.name;
                popupContent.appendChild(nameStrong);
                popupContent.appendChild(document.createElement('br'));
                popupContent.appendChild(document.createTextNode(`${h.speciesCount} species`));

                // Show target species indicator in popup if applicable
                if (hasTargetSpecies) {
                    popupContent.appendChild(document.createElement('br'));
                    const targetIndicator = document.createElement('span');
                    targetIndicator.style.cssText = 'color: #1976D2; font-weight: 600; font-size: 0.85em;';
                    targetIndicator.textContent = '\u2691 Has target species';
                    popupContent.appendChild(targetIndicator);
                }
                popupContent.appendChild(document.createElement('br'));

                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'popup-toggle-btn';
                toggleBtn.dataset.index = index;

                const addSpan = document.createElement('span');
                addSpan.className = 'add-text';
                addSpan.textContent = 'Add to itinerary';

                const removeSpan = document.createElement('span');
                removeSpan.className = 'remove-text';
                removeSpan.textContent = 'Remove from itinerary';

                toggleBtn.appendChild(addSpan);
                toggleBtn.appendChild(removeSpan);
                popupContent.appendChild(toggleBtn);

                marker.bindPopup(popupContent);

                // Click on marker toggles selection
                marker.on('click', () => {
                    this.toggleRouteHotspotFromMap(index);
                });

                this.routePreviewMarkers.push(marker);
                this.routeHotspotMarkers.push(marker);
            });

            // Handle popup button clicks
            this.routePreviewMapInstance.on('popupopen', (e) => {
                const btn = e.popup.getElement().querySelector('.popup-toggle-btn');
                if (btn) {
                    btn.addEventListener('click', (evt) => {
                        const idx = parseInt(evt.currentTarget.dataset.index);
                        this.toggleRouteHotspotFromMap(idx);
                        e.popup.close();
                    });
                }
            });

            // Re-fit bounds to include all markers
            if (this.routePreviewLine) {
                const bounds = this.routePreviewLine.getBounds();
                hotspots.forEach(h => bounds.extend([h.lat, h.lng]));
                this.routePreviewMapInstance.fitBounds(bounds, { padding: [20, 20] });
            }
        }

        // Show the section
        this.elements.routeHotspotsSection.classList.remove('hidden');

        // Auto-select stops with lifers if lifer optimize mode is enabled
        if (this.elements.liferOptimizeMode?.checked && this.lifeListService.hasLifeList()) {
            const cards = this.elements.routeHotspotsList.querySelectorAll('.route-hotspot-card');
            cards.forEach((card, index) => {
                const hotspot = hotspots[index];
                const hasLifers = hotspot.birds && hotspot.birds.some(b => b.isLifer);
                if (hasLifers) {
                    const input = card.querySelector('input');
                    if (input && !input.checked) {
                        input.checked = true;
                        card.classList.add('selected');
                        this.updateMapMarkerStyle(index, true);
                    }
                }
            });
        }

        // Update selected count
        this.updateRouteHotspotsCount();

        // Update diversity scores after any auto-selection
        this.updateRouteDiversityScores();

        // Scroll to section
        this.elements.routeHotspotsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Create a route hotspot card with checkbox
     * @param {Object} hotspot - Hotspot data
     * @param {number} index - Index in the list
     * @returns {HTMLElement} The card element
     */
    createRouteHotspotCard(hotspot, index) {
        const card = document.createElement('div');
        card.className = 'route-hotspot-card';
        card.dataset.index = index;

        const checkbox = document.createElement('div');
        checkbox.className = 'route-hotspot-checkbox';
        const checkboxInput = document.createElement('input');
        checkboxInput.type = 'checkbox';
        checkboxInput.id = `routeHotspot${index}`;
        checkboxInput.setAttribute('aria-label', `Select ${hotspot.name}`);
        checkbox.appendChild(checkboxInput);

        const info = document.createElement('div');
        info.className = 'route-hotspot-info';

        const name = document.createElement('div');
        name.className = 'route-hotspot-name';
        name.textContent = hotspot.name;

        const details = document.createElement('div');
        details.className = 'route-hotspot-details';

        const species = document.createElement('span');
        species.className = 'route-hotspot-species';
        species.textContent = `${hotspot.speciesCount} species`;

        const distance = document.createElement('span');
        distance.className = 'route-hotspot-distance';
        distance.appendChild(createSVGIcon('location', 16));
        distance.appendChild(document.createTextNode(` ${formatDistance(hotspot.distance)} from route`));

        details.appendChild(species);
        details.appendChild(distance);
        info.appendChild(name);
        info.appendChild(details);

        // Check for key birds (notable + lifers)
        const notableBirds = hotspot.birds ? hotspot.birds.filter(b => b.isNotable) : [];
        const liferBirds = hotspot.birds ? hotspot.birds.filter(b => b.isLifer) : [];
        const hasNotable = notableBirds.length > 0;
        const hasLifers = this.lifeListService.hasLifeList() && liferBirds.length > 0;

        // Check for target species matches (by species code for reliable matching)
        const targetSpeciesCodes = this.routeTargetSpeciesCodes || [];
        const matchedTargets = hotspot.birds ? hotspot.birds.filter(bird => {
            return targetSpeciesCodes.includes(bird.speciesCode);
        }) : [];
        const hasTargets = matchedTargets.length > 0;

        // Add badges to card if applicable
        if (hasNotable || hasLifers || hasTargets) {
            const badges = document.createElement('div');
            badges.className = 'route-hotspot-badges';

            if (hasTargets) {
                const targetBadge = document.createElement('span');
                targetBadge.className = 'route-target-badge';
                targetBadge.setAttribute('aria-label', `${matchedTargets.length} target species found`);
                targetBadge.textContent = '\u2691 TARGET';
                badges.appendChild(targetBadge);
            }

            if (hasNotable) {
                const rareBadge = document.createElement('span');
                rareBadge.className = 'route-rare-badge';
                rareBadge.setAttribute('aria-label', `${notableBirds.length} rare species`);
                rareBadge.appendChild(createSVGIcon('fire', 12));
                rareBadge.appendChild(document.createTextNode(` RARE`));
                badges.appendChild(rareBadge);
            }

            if (hasLifers) {
                const liferBadge = document.createElement('span');
                liferBadge.className = 'route-lifer-badge';
                liferBadge.setAttribute('aria-label', `${liferBirds.length} potential lifers`);
                liferBadge.textContent = '\u2605 LIFER';
                badges.appendChild(liferBadge);
            }

            info.appendChild(badges);
        }

        // Add key birds section (targets first, then notable, then lifers)
        // Mark matched targets for styling
        const targetsForDisplay = matchedTargets.map(b => ({ ...b, isTarget: true }));
        const notableNotTarget = notableBirds.filter(b => !matchedTargets.some(t => t.speciesCode === b.speciesCode));
        const liferNotOther = liferBirds.filter(b =>
            !b.isNotable && !matchedTargets.some(t => t.speciesCode === b.speciesCode)
        );
        const keyBirds = [...targetsForDisplay, ...notableNotTarget, ...liferNotOther];

        if (keyBirds.length > 0) {
            const keyBirdsSection = document.createElement('div');
            keyBirdsSection.className = 'route-key-birds';

            const label = document.createElement('span');
            label.className = 'route-key-birds-label';
            label.textContent = 'Key Birds:';
            keyBirdsSection.appendChild(label);

            const birdsList = document.createElement('ul');
            birdsList.className = 'route-key-birds-list';

            // Show first 3 key birds
            const displayBirds = keyBirds.slice(0, 3);
            displayBirds.forEach(bird => {
                const li = document.createElement('li');
                li.className = 'route-key-bird';
                if (bird.isTarget) li.classList.add('target');
                if (bird.isNotable) li.classList.add('notable');
                if (bird.isLifer) li.classList.add('lifer');

                const prefix = bird.isTarget ? '\u2691 ' : (bird.isNotable ? '* ' : (bird.isLifer ? '\u2605 ' : ''));
                const suffix = bird.isNotable && bird.lastSeen ? ` (${this.formatRelativeDate(bird.lastSeen)})` : '';
                li.textContent = prefix + bird.comName + suffix;
                birdsList.appendChild(li);
            });

            keyBirdsSection.appendChild(birdsList);

            // Show "more" indicator if needed
            if (keyBirds.length > 3) {
                const more = document.createElement('span');
                more.className = 'route-key-birds-more';
                more.textContent = `+${keyBirds.length - 3} more key birds`;
                keyBirdsSection.appendChild(more);
            }

            info.appendChild(keyBirdsSection);
        }

        // Add diversity indicator (will be populated when selections change)
        const diversityIndicator = document.createElement('div');
        diversityIndicator.className = 'route-diversity-indicator';
        info.appendChild(diversityIndicator);

        card.appendChild(checkbox);
        card.appendChild(info);

        // Toggle selection on card click
        card.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                const input = card.querySelector('input');
                input.checked = !input.checked;
            }
            this.toggleRouteHotspotSelection(card);
        });

        // Toggle selection on checkbox change
        const input = checkbox.querySelector('input');
        input.addEventListener('change', () => {
            this.toggleRouteHotspotSelection(card);
        });

        return card;
    }

    /**
     * Toggle route hotspot card selection state
     * @param {HTMLElement} card - The card element
     */
    toggleRouteHotspotSelection(card) {
        const input = card.querySelector('input');
        const index = parseInt(card.dataset.index);
        if (input.checked) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
        // Sync with map marker
        this.updateMapMarkerStyle(index, input.checked);
        this.updateRouteHotspotsCount();
        // Update diversity scores on all cards
        this.updateRouteDiversityScores();
    }

    /**
     * Update diversity scores on all route hotspot cards
     */
    updateRouteDiversityScores() {
        if (!this.routeHotspots || this.routeHotspots.length === 0) return;

        // Get selected hotspots
        const selectedIndices = [];
        const cards = this.elements.routeHotspotsList.querySelectorAll('.route-hotspot-card');
        cards.forEach((card, index) => {
            const input = card.querySelector('input');
            if (input && input.checked) {
                selectedIndices.push(index);
            }
        });

        // Get seen species from selected hotspots
        const selectedHotspots = selectedIndices.map(i => this.routeHotspots[i]);
        const seenSpecies = getSeenSpeciesFromHotspots(selectedHotspots);

        // Update diversity indicator on each card
        cards.forEach((card, index) => {
            const hotspot = this.routeHotspots[index];
            const diversityEl = card.querySelector('.route-diversity-indicator');
            const input = card.querySelector('input');

            if (!diversityEl) return;

            if (input && input.checked) {
                // Selected cards don't show diversity (they contribute to it)
                diversityEl.textContent = '';
                diversityEl.className = 'route-diversity-indicator';
            } else {
                // Calculate uniqueness score
                const score = calculateUniquenessScore(hotspot, seenSpecies);
                if (selectedIndices.length > 0 && score.uniqueCount > 0) {
                    diversityEl.textContent = `+${score.uniqueCount} unique species`;
                    diversityEl.className = 'route-diversity-indicator has-unique';
                } else if (selectedIndices.length > 0 && score.overlapPercent >= 80) {
                    diversityEl.textContent = `${score.overlapPercent}% overlap`;
                    diversityEl.className = 'route-diversity-indicator high-overlap';
                } else {
                    diversityEl.textContent = '';
                    diversityEl.className = 'route-diversity-indicator';
                }
            }
        });
    }

    /**
     * Toggle hotspot selection from map click
     * @param {number} index - Hotspot index
     */
    toggleRouteHotspotFromMap(index) {
        // Find the card and toggle it
        const card = this.elements.routeHotspotsList.querySelector(`.route-hotspot-card[data-index="${index}"]`);
        if (card) {
            const input = card.querySelector('input');
            input.checked = !input.checked;
            if (input.checked) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
            // Update map marker style
            this.updateMapMarkerStyle(index, input.checked);
            this.updateRouteHotspotsCount();

            // Don't scroll - keep focus on map when selecting from map
        }
    }

    /**
     * Update map marker style based on selection state
     * @param {number} index - Hotspot index
     * @param {boolean} selected - Whether selected
     */
    updateMapMarkerStyle(index, selected) {
        if (this.routeHotspotMarkers && this.routeHotspotMarkers[index]) {
            const marker = this.routeHotspotMarkers[index];
            const hasTarget = marker.hasTargetSpecies;
            marker.setStyle({
                fillColor: selected ? '#2E7D32' : '#FF9800', // Green if selected, orange if not
                fillOpacity: selected ? 0.9 : 0.85,
                // Preserve blue border for target species, otherwise white
                color: hasTarget ? '#1976D2' : '#fff',
                weight: hasTarget ? 3 : 2
            });

            // Update popup button class if popup is open
            if (marker.isPopupOpen()) {
                const btn = marker.getPopup().getElement().querySelector('.popup-toggle-btn');
                if (btn) {
                    btn.classList.toggle('selected', selected);
                }
            }
        }
    }

    /**
     * Update the selected hotspots count display
     */
    updateRouteHotspotsCount() {
        const selectedCount = this.elements.routeHotspotsList.querySelectorAll('input:checked').length;
        this.elements.selectedHotspotsCount.textContent = `${selectedCount} ${selectedCount === 1 ? 'hotspot' : 'hotspots'} selected`;
        this.elements.buildRouteItinerary.disabled = selectedCount === 0;
    }

    /**
     * Select all route hotspots
     */
    selectAllRouteHotspots() {
        const cards = this.elements.routeHotspotsList.querySelectorAll('.route-hotspot-card');
        cards.forEach((card, i) => {
            card.classList.add('selected');
            card.querySelector('input').checked = true;
            this.updateMapMarkerStyle(i, true);
        });
        this.updateRouteHotspotsCount();
    }

    /**
     * Deselect all route hotspots
     */
    deselectAllRouteHotspots() {
        const cards = this.elements.routeHotspotsList.querySelectorAll('.route-hotspot-card');
        cards.forEach((card, i) => {
            card.classList.remove('selected');
            card.querySelector('input').checked = false;
            this.updateMapMarkerStyle(i, false);
        });
        this.updateRouteHotspotsCount();
    }

    /**
     * Build itinerary from selected route hotspots
     */
    async handleBuildRouteItinerary() {
        // Get selected hotspots
        const selectedIndices = [];
        this.elements.routeHotspotsList.querySelectorAll('input:checked').forEach(input => {
            const card = input.closest('.route-hotspot-card');
            selectedIndices.push(parseInt(card.dataset.index));
        });

        if (selectedIndices.length === 0) {
            this.showError('Please select at least one hotspot for your itinerary.');
            return;
        }

        const selectedHotspots = selectedIndices.map(i => this.routeHotspots[i]);

        this.showLoading('Building your birding itinerary...', 0);

        try {
            const startCoords = this.validatedRouteStartCoords;
            const endCoords = this.validatedRouteEndCoords;

            const start = { lat: startCoords.lat, lng: startCoords.lng, address: this.routeStartAddress };
            const end = { lat: endCoords.lat, lng: endCoords.lng, address: this.routeEndAddressText };

            const itinerary = await buildItinerary(start, end, selectedHotspots, {
                maxStops: selectedHotspots.length,
                priority: 'balanced',
                onProgress: (msg, pct) => this.updateLoading(msg, pct)
            });

            this.hideLoading();

            // Store current location and itinerary
            this.currentLocation = start;
            this.currentItinerary = itinerary;

            // Hide hotspots selection section
            this.elements.routeHotspotsSection.classList.add('hidden');

            // Display the itinerary results
            this.displayRouteItinerary(itinerary, start, end);

        } catch (error) {
            this.hideLoading();
            this.showError(`Failed to build itinerary: ${error.message}`);
        }
    }

    /**
     * Display route itinerary results
     * @param {Object} itinerary - Built itinerary data
     * @param {Object} start - Start location
     * @param {Object} end - End location
     */
    displayRouteItinerary(itinerary, start, end) {
        // Clear previous results
        this.elements.rareBirdAlert.classList.add('hidden');
        this.elements.weatherSummary.classList.add('hidden');
        clearElement(this.elements.hotspotCards);

        // Hide sort buttons for route mode
        this.elements.sortBySpecies.parentElement.classList.add('hidden');

        // Hide export PDF button (route has its own export button)
        this.elements.exportPdfBtn.classList.add('hidden');

        // Update results header
        const hotspotCount = itinerary.stops.filter(s => s.type === 'hotspot').length;
        this.elements.resultsMeta.textContent = `${hotspotCount} birding stops along your route`;

        // Create route summary header using safe DOM methods
        const routeHeader = document.createElement('div');
        routeHeader.className = 'route-itinerary-header';

        const headerIcon = document.createElement('div');
        headerIcon.className = 'route-header-icon';
        headerIcon.appendChild(createSVGIcon('directions', 28));

        const headerContent = document.createElement('div');
        headerContent.className = 'route-header-content';

        const headerTitle = document.createElement('h3');
        headerTitle.textContent = 'Your Birding Route';

        const endpoints = document.createElement('p');
        endpoints.className = 'route-endpoints';
        endpoints.textContent = `${start.address} → ${end.address}`;

        headerContent.appendChild(headerTitle);
        headerContent.appendChild(endpoints);
        routeHeader.appendChild(headerIcon);
        routeHeader.appendChild(headerContent);
        this.elements.hotspotCards.appendChild(routeHeader);

        // Create summary stats using safe DOM methods
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'route-summary-stats';

        const stats = [
            { value: formatDistance(itinerary.summary.totalDistance), label: 'Total Distance' },
            { value: formatItineraryDuration(itinerary.summary.totalTravelTime), label: 'Driving Time' },
            { value: formatItineraryDuration(itinerary.summary.totalVisitTime), label: 'Birding Time' },
            { value: String(hotspotCount), label: 'Stops' }
        ];

        stats.forEach(stat => {
            const item = document.createElement('div');
            item.className = 'stat-item';

            const value = document.createElement('span');
            value.className = 'stat-value';
            value.textContent = stat.value;

            const label = document.createElement('span');
            label.className = 'stat-label';
            label.textContent = stat.label;

            item.appendChild(value);
            item.appendChild(label);
            summaryDiv.appendChild(item);
        });

        this.elements.hotspotCards.appendChild(summaryDiv);

        // Create stop cards
        itinerary.stops.forEach((stop, index) => {
            const stopCard = this.createRouteStopCard(stop, index, itinerary.stops.length);
            this.elements.hotspotCards.appendChild(stopCard);
        });

        // Add export buttons using safe DOM methods
        const exportSection = document.createElement('div');
        exportSection.className = 'route-export-section';

        // Open in Google Maps button
        const googleMapsUrl = getGoogleMapsRouteUrl(itinerary.stops);
        const mapsLink = document.createElement('a');
        mapsLink.href = googleMapsUrl;
        mapsLink.target = '_blank';
        mapsLink.rel = 'noopener noreferrer';
        mapsLink.className = 'btn btn-primary';
        mapsLink.appendChild(createSVGIcon('external', 20));
        mapsLink.appendChild(document.createTextNode(' Open in Google Maps'));
        exportSection.appendChild(mapsLink);

        const pdfBtn = document.createElement('button');
        pdfBtn.type = 'button';
        pdfBtn.className = 'btn btn-secondary';
        pdfBtn.appendChild(createSVGIcon('pdf', 20));
        pdfBtn.appendChild(document.createTextNode(' Export PDF'));
        pdfBtn.addEventListener('click', () => this.handleExportItineraryPdf());

        const gpxBtn = document.createElement('button');
        gpxBtn.type = 'button';
        gpxBtn.className = 'btn btn-secondary';
        gpxBtn.appendChild(createSVGIcon('location', 20));
        gpxBtn.appendChild(document.createTextNode(' Export GPX'));
        gpxBtn.addEventListener('click', () => this.handleExportItineraryGpx());

        exportSection.appendChild(pdfBtn);
        exportSection.appendChild(gpxBtn);
        this.elements.hotspotCards.appendChild(exportSection);

        // Initialize results map with route
        this.initRouteResultsMap(itinerary);

        // Show results section
        this.elements.resultsSection.classList.remove('hidden');
        this.elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Create a stop card for route itinerary
     * @param {Object} stop - Stop data
     * @param {number} index - Stop index
     * @param {number} totalStops - Total number of stops
     * @returns {HTMLElement}
     */
    createRouteStopCard(stop, index, totalStops) {
        const card = document.createElement('div');
        card.className = `route-stop-card ${stop.type}`;

        const isLast = index === totalStops - 1;

        // Determine icon and label based on stop type
        let iconName;
        let stopLabel;

        if (stop.type === 'start') {
            iconName = 'location';
            stopLabel = 'Start';
        } else if (stop.type === 'end') {
            iconName = 'home';
            stopLabel = 'Destination';
        } else {
            iconName = 'check';
            stopLabel = `Stop ${stop.stopNumber - 1}`;
        }

        // Build card using safe DOM methods
        const stopMarker = document.createElement('div');
        stopMarker.className = `stop-marker ${stop.type}`;
        stopMarker.appendChild(createSVGIcon(iconName, 20));

        const stopContent = document.createElement('div');
        stopContent.className = 'stop-content';

        const stopHeader = document.createElement('div');
        stopHeader.className = 'stop-header';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'stop-label';
        labelSpan.textContent = stopLabel;
        stopHeader.appendChild(labelSpan);

        const nameH4 = document.createElement('h4');
        nameH4.className = 'stop-name';
        nameH4.textContent = stop.name || stop.address || 'Location';

        stopContent.appendChild(stopHeader);
        stopContent.appendChild(nameH4);

        // Add details for hotspots
        if (stop.type === 'hotspot') {
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'stop-details';

            const speciesSpan = document.createElement('span');
            speciesSpan.className = 'species-count';
            speciesSpan.textContent = `${stop.speciesCount || 0} species`;

            const visitSpan = document.createElement('span');
            visitSpan.className = 'visit-time';
            visitSpan.textContent = `${stop.suggestedVisitTime} min suggested`;

            detailsDiv.appendChild(speciesSpan);
            detailsDiv.appendChild(visitSpan);
            stopContent.appendChild(detailsDiv);
        }

        card.appendChild(stopMarker);
        card.appendChild(stopContent);

        // Add leg connector if not last stop
        if (stop.legToNext && !isLast) {
            const legConnector = document.createElement('div');
            legConnector.className = 'leg-connector';

            const legLine = document.createElement('div');
            legLine.className = 'leg-line';

            const legInfo = document.createElement('div');
            legInfo.className = 'leg-info';
            legInfo.appendChild(createSVGIcon('car', 14));
            legInfo.appendChild(document.createTextNode(` ${formatDistance(stop.legToNext.distance)} · ${formatItineraryDuration(stop.legToNext.duration / 60)}`));

            legConnector.appendChild(legLine);
            legConnector.appendChild(legInfo);
            card.appendChild(legConnector);
        }

        return card;
    }

    /**
     * Initialize results map with route line and stops
     * @param {Object} itinerary - Itinerary data with geometry
     */
    initRouteResultsMap(itinerary) {
        // Clean up existing map
        if (this.resultsMapInstance) {
            this.resultsMapInstance.remove();
            this.resultsMapInstance = null;
        }
        this.resultsMarkers = [];
        this.itineraryRouteLine = null;

        // Create map centered on first stop
        const firstStop = itinerary.stops[0];
        this.resultsMapInstance = L.map(this.elements.resultsMap).setView([firstStop.lat, firstStop.lng], 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(this.resultsMapInstance);

        // Build bounds from all stops
        const bounds = L.latLngBounds(itinerary.stops.map(s => [s.lat, s.lng]));

        // Add route line if geometry available
        if (itinerary.geometry && itinerary.geometry.coordinates && itinerary.geometry.coordinates.length > 0) {
            const routeCoords = itinerary.geometry.coordinates.map(c => [c[1], c[0]]);
            this.itineraryRouteLine = L.polyline(routeCoords, {
                color: '#2E7D32',
                weight: 5,
                opacity: 0.8
            }).addTo(this.resultsMapInstance);

            // Extend bounds to include the entire route line
            bounds.extend(this.itineraryRouteLine.getBounds());
        }

        // Add markers for each stop
        let hotspotNum = 1;
        itinerary.stops.forEach(stop => {
            const isHotspot = stop.type === 'hotspot';
            const markerColor = stop.type === 'start' ? '#22c55e' :
                stop.type === 'end' ? '#ef4444' : '#FF5722';

            const label = stop.type === 'start' ? 'S' :
                stop.type === 'end' ? 'E' : hotspotNum++;

            const icon = L.divIcon({
                className: 'route-marker',
                html: `<div style="background-color: ${markerColor}; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">${label}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            const marker = L.marker([stop.lat, stop.lng], { icon })
                .bindPopup(`<strong>${stop.name || stop.address}</strong>${isHotspot && stop.speciesCount ? `<br>${stop.speciesCount} species` : ''}`)
                .addTo(this.resultsMapInstance);

            this.resultsMarkers.push(marker);
        });

        // Fit bounds to show everything with padding
        this.resultsMapInstance.fitBounds(bounds, { padding: [40, 40] });

        // Force recalculate size and re-fit bounds after delay
        setTimeout(() => {
            if (this.resultsMapInstance) {
                this.resultsMapInstance.invalidateSize();
                this.resultsMapInstance.fitBounds(bounds, { padding: [40, 40] });
            }
        }, 200);
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

        const iconDiv = document.createElement('div');
        iconDiv.className = 'species-results-icon';
        iconDiv.appendChild(createSVGIcon('search', 28));

        const titleDiv = document.createElement('div');
        titleDiv.className = 'species-results-title';

        const h3 = document.createElement('h3');
        h3.textContent = `${species.commonName} Sightings`;

        const p = document.createElement('p');
        p.textContent = sightings.length > 0 ? 'Recent sightings near your location' : 'No recent sightings found in this area';

        titleDiv.appendChild(h3);
        titleDiv.appendChild(p);
        resultsHeader.appendChild(iconDiv);
        resultsHeader.appendChild(titleDiv);

        this.elements.hotspotCards.appendChild(resultsHeader);

        if (sightings.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'species-no-results';

            const noResultsIcon = document.createElement('div');
            noResultsIcon.className = 'species-no-results-icon';
            noResultsIcon.appendChild(createSVGIcon('check', 64));

            const noResultsTitle = document.createElement('h3');
            noResultsTitle.textContent = 'No recent sightings';

            const noResultsText = document.createElement('p');
            noResultsText.textContent = 'Try expanding your search range or searching for a different species.';

            noResults.appendChild(noResultsIcon);
            noResults.appendChild(noResultsTitle);
            noResults.appendChild(noResultsText);
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

        // Header section
        const header = document.createElement('div');
        header.className = 'species-sighting-header';

        const rankDiv = document.createElement('div');
        rankDiv.className = 'sighting-rank';
        rankDiv.textContent = rank;

        const infoDiv = document.createElement('div');
        infoDiv.className = 'sighting-info';

        const locationH4 = document.createElement('h4');
        locationH4.className = 'sighting-location';
        locationH4.textContent = sighting.name;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'sighting-meta';

        const distanceSpan = document.createElement('span');
        distanceSpan.appendChild(createSVGIcon('location', 14));
        distanceSpan.appendChild(document.createTextNode(' ' + distanceText));

        const countSpan = document.createElement('span');
        countSpan.appendChild(createSVGIcon('check', 14));
        countSpan.appendChild(document.createTextNode(` ${sighting.observationCount} sighting${sighting.observationCount !== 1 ? 's' : ''}`));

        metaDiv.appendChild(distanceSpan);
        metaDiv.appendChild(countSpan);
        infoDiv.appendChild(locationH4);
        infoDiv.appendChild(metaDiv);
        header.appendChild(rankDiv);
        header.appendChild(infoDiv);

        // Details section
        const details = document.createElement('div');
        details.className = 'sighting-details';

        const dateDiv = document.createElement('div');
        dateDiv.className = 'sighting-date';
        dateDiv.appendChild(document.createTextNode('Last seen: '));
        const dateStrong = document.createElement('strong');
        dateStrong.textContent = this.formatRelativeDate(sighting.lastSeen);
        dateDiv.appendChild(dateStrong);
        details.appendChild(dateDiv);

        if (sighting.highestCount > 1) {
            const countDiv = document.createElement('div');
            countDiv.className = 'sighting-count';
            countDiv.textContent = `Highest count: ${sighting.highestCount} individuals`;
            details.appendChild(countDiv);
        }

        // Links section
        const links = document.createElement('div');
        links.className = 'sighting-links';

        const directionsLink = document.createElement('a');
        directionsLink.href = directionsUrl;
        directionsLink.target = '_blank';
        directionsLink.rel = 'noopener noreferrer';
        directionsLink.className = 'sighting-link';
        directionsLink.appendChild(createSVGIcon('directions', 14));
        directionsLink.appendChild(document.createTextNode(' Get Directions'));

        const ebirdLink = document.createElement('a');
        ebirdLink.href = ebirdUrl;
        ebirdLink.target = '_blank';
        ebirdLink.rel = 'noopener noreferrer';
        ebirdLink.className = 'sighting-link';
        ebirdLink.appendChild(createSVGIcon('external', 14));
        ebirdLink.appendChild(document.createTextNode(sighting.isHotspot ? ' View on eBird' : ' View Location'));

        links.appendChild(directionsLink);
        links.appendChild(ebirdLink);

        card.appendChild(header);
        card.appendChild(details);
        card.appendChild(links);

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

        // Favorite/Star button
        const favoriteBtn = document.createElement('button');
        favoriteBtn.className = 'favorite-hotspot-btn';
        favoriteBtn.dataset.locId = hotspot.locId;
        favoriteBtn.setAttribute('aria-label', 'Add to favorites');
        if (storage.isFavoriteHotspot(hotspot.locId)) {
            favoriteBtn.classList.add('is-favorite');
            favoriteBtn.setAttribute('aria-label', 'Remove from favorites');
        }

        const starSvgBtn = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        starSvgBtn.setAttribute('viewBox', '0 0 24 24');
        const starPathBtn = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        starPathBtn.setAttribute('d', 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z');
        starSvgBtn.appendChild(starPathBtn);
        favoriteBtn.appendChild(starSvgBtn);

        favoriteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isFavorite = storage.toggleFavoriteHotspot({
                locId: hotspot.locId,
                name: hotspot.locName || hotspot.name,
                lat: hotspot.lat,
                lng: hotspot.lng
            });
            favoriteBtn.classList.toggle('is-favorite', isFavorite);
            favoriteBtn.setAttribute('aria-label', isFavorite ? 'Remove from favorites' : 'Add to favorites');
            this.renderFavoriteHotspots();
            this.showToast(isFavorite ? 'Added to favorites' : 'Removed from favorites');
        });

        card.appendChild(favoriteBtn);

        const distanceText = formatDistance(hotspot.distance);
        const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${hotspot.lat},${hotspot.lng}`;
        const ebirdUrl = `https://ebird.org/hotspot/${hotspot.locId}`;

        // Check if there are notable species or lifers
        const hasNotable = hotspot.birds.some(b => b.isNotable);
        const hasLifers = this.lifeListService.hasLifeList() && hotspot.birds.some(b => b.isLifer);

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

        // Hotspot quality indicators (if available)
        let qualitySection = null;
        if (hotspot.totalSpecies != null || hotspot.totalChecklists != null) {
            qualitySection = document.createElement('div');
            qualitySection.className = 'hotspot-quality';

            if (hotspot.totalSpecies != null) {
                const totalSpeciesStat = document.createElement('span');
                totalSpeciesStat.className = 'quality-stat';
                totalSpeciesStat.appendChild(createSVGIcon('check', 14));
                totalSpeciesStat.appendChild(document.createTextNode(` ${hotspot.totalSpecies.toLocaleString()} all-time`));
                qualitySection.appendChild(totalSpeciesStat);
            }

            if (hotspot.totalChecklists != null) {
                const checklistsStat = document.createElement('span');
                checklistsStat.className = 'quality-stat';
                checklistsStat.appendChild(createSVGIcon('calendar', 14));
                checklistsStat.appendChild(document.createTextNode(` ${hotspot.totalChecklists.toLocaleString()} visits`));
                qualitySection.appendChild(checklistsStat);
            }

            // Add quality badge based on checklist count
            if (hotspot.totalChecklists != null) {
                const qualityBadge = document.createElement('span');
                if (hotspot.totalChecklists >= 500) {
                    qualityBadge.className = 'quality-badge established';
                    qualityBadge.textContent = 'Well-Established';
                } else if (hotspot.totalChecklists >= 50) {
                    qualityBadge.className = 'quality-badge active';
                    qualityBadge.textContent = 'Active';
                } else {
                    qualityBadge.className = 'quality-badge new';
                    qualityBadge.textContent = 'New Spot';
                }
                qualitySection.appendChild(qualityBadge);
            }
        }

        titleSection.appendChild(nameH3);
        titleSection.appendChild(stats);
        if (qualitySection) {
            titleSection.appendChild(qualitySection);
        }
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

        // Add lifer badge if hotspot has potential lifers
        if (hasLifers) {
            const liferBadge = document.createElement('span');
            liferBadge.className = 'lifer-badge';
            // Star icon for lifers
            const starSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            starSvg.setAttribute('viewBox', '0 0 24 24');
            starSvg.setAttribute('width', '14');
            starSvg.setAttribute('height', '14');
            const starPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            starPath.setAttribute('fill', 'currentColor');
            starPath.setAttribute('d', 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z');
            starSvg.appendChild(starPath);
            liferBadge.appendChild(starSvg);
            liferBadge.appendChild(document.createTextNode(' LIFER'));
            header.appendChild(liferBadge);
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

        // Copy button for species list
        const copyBtnContainer = document.createElement('div');
        copyBtnContainer.className = 'copy-species-container';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-species-btn';
        copyBtn.dataset.hotspotId = hotspot.locId;
        copyBtn.dataset.hotspotName = hotspot.locName;

        const copyIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        copyIcon.setAttribute('viewBox', '0 0 24 24');
        copyIcon.setAttribute('width', '14');
        copyIcon.setAttribute('height', '14');
        const copyPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        copyPath.setAttribute('fill', 'currentColor');
        copyPath.setAttribute('d', 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z');
        copyIcon.appendChild(copyPath);

        const copyText = document.createElement('span');
        copyText.textContent = 'Copy List';

        copyBtn.appendChild(copyIcon);
        copyBtn.appendChild(copyText);
        copyBtnContainer.appendChild(copyBtn);

        // Store birds data for copy function
        copyBtn.addEventListener('click', () => this.copySpeciesList(hotspot.locName, hotspot.birds));

        speciesList.appendChild(copyBtnContainer);

        const speciesGrid = document.createElement('ul');
        speciesGrid.className = 'species-grid';

        hotspot.birds.forEach(bird => {
            const li = document.createElement('li');
            // Build class list based on notable and lifer status
            let className = 'species-item';
            if (bird.isNotable) className += ' notable';
            if (bird.isLifer) className += ' lifer';
            li.className = className;
            // Notable gets asterisk prefix, lifer gets star prefix (from CSS ::before)
            li.textContent = bird.isNotable && !bird.isLifer ? `* ${bird.comName}` : bird.comName;
            speciesGrid.appendChild(li);
        });

        speciesList.appendChild(speciesGrid);

        if (hasNotable) {
            const legend = document.createElement('p');
            legend.className = 'notable-legend';
            legend.textContent = '* Notable/rare species for this area';
            speciesList.appendChild(legend);
        }

        if (hasLifers) {
            const liferLegend = document.createElement('p');
            liferLegend.className = 'notable-legend';
            liferLegend.style.color = 'var(--lifer-highlight)';
            liferLegend.textContent = '\u2605 Potential lifer (not on your life list)';
            speciesList.appendChild(liferLegend);
        }

        speciesSection.appendChild(toggle);
        speciesSection.appendChild(speciesList);

        // Notable species highlight section (if any) - collapsible
        let notableHighlight = null;
        if (hasNotable) {
            const notableSpecies = hotspot.birds.filter(b => b.isNotable);
            notableHighlight = document.createElement('div');
            notableHighlight.className = 'notable-highlight';

            const highlightToggle = document.createElement('button');
            highlightToggle.type = 'button';
            highlightToggle.className = 'notable-highlight-toggle';
            highlightToggle.setAttribute('aria-expanded', 'false');
            highlightToggle.appendChild(createSVGIcon('alert', 16));
            highlightToggle.appendChild(document.createTextNode(` Notable Sightings (${notableSpecies.length})`));
            highlightToggle.appendChild(createSVGIcon('chevron', 14, 'chevron'));
            notableHighlight.appendChild(highlightToggle);

            const highlightContent = document.createElement('div');
            highlightContent.className = 'notable-highlight-content hidden';

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
                highlightContent.appendChild(birdDiv);
            });

            notableHighlight.appendChild(highlightContent);

            highlightToggle.addEventListener('click', () => {
                const expanded = highlightToggle.getAttribute('aria-expanded') === 'true';
                highlightToggle.setAttribute('aria-expanded', !expanded);
                highlightContent.classList.toggle('hidden');
            });
        }

        // Lifer species highlight section (if any) - collapsible
        let liferHighlight = null;
        if (hasLifers) {
            const liferSpecies = hotspot.birds.filter(b => b.isLifer);
            liferHighlight = document.createElement('div');
            liferHighlight.className = 'lifer-highlight';

            const highlightToggle = document.createElement('button');
            highlightToggle.type = 'button';
            highlightToggle.className = 'lifer-highlight-toggle';
            highlightToggle.setAttribute('aria-expanded', 'false');
            // Star icon for lifers
            const starSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            starSvg.setAttribute('viewBox', '0 0 24 24');
            starSvg.setAttribute('width', '16');
            starSvg.setAttribute('height', '16');
            const starPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            starPath.setAttribute('fill', 'currentColor');
            starPath.setAttribute('d', 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z');
            starSvg.appendChild(starPath);
            highlightToggle.appendChild(starSvg);
            highlightToggle.appendChild(document.createTextNode(` Potential Lifers (${liferSpecies.length})`));
            highlightToggle.appendChild(createSVGIcon('chevron', 14, 'chevron'));
            liferHighlight.appendChild(highlightToggle);

            const highlightContent = document.createElement('div');
            highlightContent.className = 'lifer-highlight-content hidden';

            liferSpecies.forEach(bird => {
                const birdDiv = document.createElement('div');
                birdDiv.className = 'lifer-bird';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'lifer-bird-name';
                nameSpan.textContent = bird.comName;

                const dateSpan = document.createElement('span');
                dateSpan.className = 'lifer-bird-date';
                dateSpan.textContent = `Last seen: ${this.formatRelativeDate(bird.lastSeen)}`;

                birdDiv.appendChild(nameSpan);
                birdDiv.appendChild(dateSpan);
                highlightContent.appendChild(birdDiv);
            });

            liferHighlight.appendChild(highlightContent);

            highlightToggle.addEventListener('click', () => {
                const expanded = highlightToggle.getAttribute('aria-expanded') === 'true';
                highlightToggle.setAttribute('aria-expanded', !expanded);
                highlightContent.classList.toggle('hidden');
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
        if (liferHighlight) {
            card.appendChild(liferHighlight);
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
        const janSpan = document.createElement('span');
        janSpan.textContent = 'Jan';
        const decSpan = document.createElement('span');
        decSpan.textContent = 'Dec';
        sparklineLabel.appendChild(janSpan);
        sparklineLabel.appendChild(decSpan);

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
            // Clear validation state when switching back to round trip
            this.endAddressValidated = false;
            this.validatedEndCoords = null;
            this.clearEndAddressError();
        }
    }

    /**
     * Handle end address input change - clear validation state
     */
    handleEndAddressInputChange() {
        this.endAddressValidated = false;
        this.validatedEndCoords = null;
        this.clearEndAddressError();
        this.hideValidationIndicator(this.elements.endAddressValidationIcon, this.elements.endAddress);
    }

    /**
     * Handle end address blur - validate and geocode
     */
    async handleEndAddressBlur() {
        const address = this.elements.endAddress.value.trim();

        if (address.length < 3) {
            this.endAddressValidated = false;
            this.validatedEndCoords = null;
            this.hideValidationIndicator(this.elements.endAddressValidationIcon, this.elements.endAddress);
            return;
        }

        // Show loading indicator
        this.showValidationIndicator(this.elements.endAddressValidationIcon, this.elements.endAddress, 'loading');
        this.clearEndAddressError();

        try {
            const result = await geocodeAddress(address);
            this.endAddressValidated = true;
            this.validatedEndCoords = { lat: result.lat, lng: result.lng };
            this.showValidationIndicator(this.elements.endAddressValidationIcon, this.elements.endAddress, 'success');
        } catch (error) {
            this.endAddressValidated = false;
            this.validatedEndCoords = null;
            this.showValidationIndicator(this.elements.endAddressValidationIcon, this.elements.endAddress, 'error');
            this.showEndAddressError('Could not find this address. Please check and try again.');
        }
    }

    /**
     * Show inline end address error
     */
    showEndAddressError(message) {
        this.elements.endAddressError.textContent = message;
        this.elements.endAddressError.classList.remove('hidden');
        this.elements.endAddress.classList.add('error');
    }

    /**
     * Clear inline end address error
     */
    clearEndAddressError() {
        this.elements.endAddressError.textContent = '';
        this.elements.endAddressError.classList.add('hidden');
        this.elements.endAddressError.style.color = '';
        this.elements.endAddress.classList.remove('error');
    }

    /**
     * Handle route start address input change - clear validation state
     */
    handleRouteStartInputChange() {
        this.routeStartValidated = false;
        this.validatedRouteStartCoords = null;
        this.clearRouteStartError();
        this.hideRoutePreview();
        this.hideValidationIndicator(this.elements.routeStartValidationIcon, this.elements.routeStartAddress);
    }

    /**
     * Handle route start address blur - validate and geocode
     */
    async handleRouteStartBlur() {
        const address = this.elements.routeStartAddress.value.trim();

        if (address.length < 3) {
            this.routeStartValidated = false;
            this.validatedRouteStartCoords = null;
            this.hideValidationIndicator(this.elements.routeStartValidationIcon, this.elements.routeStartAddress);
            return;
        }

        // Show loading indicator
        this.showValidationIndicator(this.elements.routeStartValidationIcon, this.elements.routeStartAddress, 'loading');
        this.clearRouteStartError();

        try {
            const result = await geocodeAddress(address);
            this.routeStartValidated = true;
            this.validatedRouteStartCoords = { lat: result.lat, lng: result.lng };
            // Show resolved address so user can verify correct location was found
            this.elements.routeStartAddress.value = result.address;
            this.showValidationIndicator(this.elements.routeStartValidationIcon, this.elements.routeStartAddress, 'success');
            // Try to show route preview if both addresses are validated
            this.tryShowRoutePreview();
        } catch (error) {
            this.routeStartValidated = false;
            this.validatedRouteStartCoords = null;
            this.showValidationIndicator(this.elements.routeStartValidationIcon, this.elements.routeStartAddress, 'error');
            this.showRouteStartError('Could not find this address. Please check and try again.');
        }
    }

    /**
     * Show inline route start address error
     */
    showRouteStartError(message) {
        this.elements.routeStartError.textContent = message;
        this.elements.routeStartError.classList.remove('hidden');
        this.elements.routeStartAddress.classList.add('error');
    }

    /**
     * Clear inline route start address error
     */
    clearRouteStartError() {
        this.elements.routeStartError.textContent = '';
        this.elements.routeStartError.classList.add('hidden');
        this.elements.routeStartError.style.color = '';
        this.elements.routeStartAddress.classList.remove('error');
    }

    /**
     * Handle route end address input change - clear validation state
     */
    handleRouteEndInputChange() {
        this.routeEndValidated = false;
        this.validatedRouteEndCoords = null;
        this.clearRouteEndError();
        this.hideRoutePreview();
        this.hideValidationIndicator(this.elements.routeEndValidationIcon, this.elements.routeEndAddress);
    }

    /**
     * Handle route end address blur - validate and geocode
     */
    async handleRouteEndBlur() {
        const address = this.elements.routeEndAddress.value.trim();

        if (address.length < 3) {
            this.routeEndValidated = false;
            this.validatedRouteEndCoords = null;
            this.hideValidationIndicator(this.elements.routeEndValidationIcon, this.elements.routeEndAddress);
            return;
        }

        // Show loading indicator
        this.showValidationIndicator(this.elements.routeEndValidationIcon, this.elements.routeEndAddress, 'loading');
        this.clearRouteEndError();

        try {
            const result = await geocodeAddress(address);
            this.routeEndValidated = true;
            this.validatedRouteEndCoords = { lat: result.lat, lng: result.lng };
            // Show resolved address so user can verify correct location was found
            this.elements.routeEndAddress.value = result.address;
            this.showValidationIndicator(this.elements.routeEndValidationIcon, this.elements.routeEndAddress, 'success');
            // Try to show route preview if both addresses are validated
            this.tryShowRoutePreview();
        } catch (error) {
            this.routeEndValidated = false;
            this.validatedRouteEndCoords = null;
            this.showValidationIndicator(this.elements.routeEndValidationIcon, this.elements.routeEndAddress, 'error');
            this.showRouteEndError('Could not find this address. Please check and try again.');
        }
    }

    /**
     * Show inline route end address error
     */
    showRouteEndError(message) {
        this.elements.routeEndError.textContent = message;
        this.elements.routeEndError.classList.remove('hidden');
        this.elements.routeEndAddress.classList.add('error');
    }

    /**
     * Clear inline route end address error
     */
    clearRouteEndError() {
        this.elements.routeEndError.textContent = '';
        this.elements.routeEndError.classList.add('hidden');
        this.elements.routeEndError.style.color = '';
        this.elements.routeEndAddress.classList.remove('error');
    }

    /**
     * Try to show route preview if both addresses are validated
     */
    tryShowRoutePreview() {
        if (this.routeStartValidated && this.routeEndValidated) {
            this.showRoutePreview();
        }
    }

    /**
     * Show route preview map with route line and stats
     */
    async showRoutePreview() {
        // Only show if both addresses are validated
        if (!this.routeStartValidated || !this.routeEndValidated) {
            return;
        }

        const start = this.validatedRouteStartCoords;
        const end = this.validatedRouteEndCoords;

        // Get route from OSRM
        const route = await getRouteThrough([
            { lat: start.lat, lng: start.lng },
            { lat: end.lat, lng: end.lng }
        ]);

        if (!route) {
            return; // Silently fail if routing unavailable
        }

        // Show section first so container has dimensions
        this.elements.routePreviewSection.classList.remove('hidden');

        // Update stats
        const distanceMiles = (route.totalDistance * 0.621371).toFixed(1);
        this.elements.routeDistanceValue.textContent = distanceMiles;
        this.elements.routeDurationValue.textContent = formatDuration(route.totalDuration);

        // Update Google Maps link
        this.elements.openRouteInGoogleMaps.href = getGoogleMapsDirectionsUrl(
            start.lat, start.lng, end.lat, end.lng
        );

        // Wait for DOM to update and container to have dimensions
        await new Promise(resolve => setTimeout(resolve, 50));

        // Initialize or update map
        if (!this.routePreviewMapInstance) {
            this.routePreviewMapInstance = L.map(this.elements.routePreviewMap);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19
            }).addTo(this.routePreviewMapInstance);
        }

        // Clear previous route line and markers
        if (this.routePreviewLine) {
            this.routePreviewMapInstance.removeLayer(this.routePreviewLine);
        }
        this.routePreviewMarkers.forEach(m => this.routePreviewMapInstance.removeLayer(m));
        this.routePreviewMarkers = [];

        // Add route line (convert GeoJSON coordinates to Leaflet format)
        const routeCoords = route.geometry.coordinates.map(c => [c[1], c[0]]);
        this.routePreviewLine = L.polyline(routeCoords, {
            color: '#2E7D32',
            weight: 4,
            opacity: 0.8
        }).addTo(this.routePreviewMapInstance);

        // Add start marker (green)
        const startMarker = L.circleMarker([start.lat, start.lng], {
            radius: 8, fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1
        }).addTo(this.routePreviewMapInstance);
        this.routePreviewMarkers.push(startMarker);

        // Add end marker (red)
        const endMarker = L.circleMarker([end.lat, end.lng], {
            radius: 8, fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1
        }).addTo(this.routePreviewMapInstance);
        this.routePreviewMarkers.push(endMarker);

        // Fetch and display preview hotspots along the route
        if (this.ebirdApi) {
            try {
                const midLat = (start.lat + end.lat) / 2;
                const midLng = (start.lng + end.lng) / 2;
                const routeDistance = calculateDistance(start.lat, start.lng, end.lat, end.lng);
                const searchRadius = Math.min(Math.max(routeDistance / 2 + 10, 20), 50);

                const previewHotspots = await this.ebirdApi.getNearbyHotspots(
                    midLat, midLng, searchRadius, CONFIG.DEFAULT_DAYS_BACK
                );

                // Filter to those near the route based on max detour setting
                const maxDetourMiles = parseInt(this.elements.routeMaxDetour.value);
                const maxDetour = maxDetourMiles * 1.60934; // Convert to km

                const nearRouteHotspots = previewHotspots.filter(h => {
                    const distFromStart = calculateDistance(start.lat, start.lng, h.lat, h.lng);
                    const distFromEnd = calculateDistance(end.lat, end.lng, h.lat, h.lng);
                    return (distFromStart + distFromEnd) <= (routeDistance + maxDetour * 2);
                }).slice(0, 15); // Limit for performance

                // Initialize selected preview hotspots set if not exists
                if (!this.selectedPreviewHotspots) {
                    this.selectedPreviewHotspots = new Set();
                }

                // Add hotspot preview markers (orange circles) with click popup
                nearRouteHotspots.forEach(h => {
                    const isSelected = this.selectedPreviewHotspots.has(h.locId);
                    const marker = L.circleMarker([h.lat, h.lng], {
                        radius: 8,
                        fillColor: isSelected ? '#4CAF50' : '#FF5722',
                        color: '#fff',
                        weight: 2,
                        fillOpacity: 0.9,
                        interactive: true
                    }).addTo(this.routePreviewMapInstance);

                    // Store hotspot data on the marker for reference
                    marker.hotspotData = h;

                    // Create popup with hotspot info and add/remove button
                    const speciesText = h.numSpeciesAllTime ? `${h.numSpeciesAllTime} species (all time)` : 'Species data unavailable';
                    const buttonText = isSelected ? 'Remove from Itinerary' : 'Add to Itinerary';
                    const buttonClass = isSelected ? 'popup-btn-remove' : 'popup-btn-add';

                    const popupContent = `
                        <div class="hotspot-preview-popup">
                            <strong class="popup-hotspot-name">${h.locName}</strong>
                            <div class="popup-species-count">${speciesText}</div>
                            <button class="popup-itinerary-btn ${buttonClass}" data-loc-id="${h.locId}">
                                ${buttonText}
                            </button>
                        </div>
                    `;

                    marker.bindPopup(popupContent, {
                        className: 'hotspot-preview-popup-container',
                        closeButton: true,
                        maxWidth: 250
                    });

                    // Handle popup open to attach button click handler
                    marker.on('popupopen', (e) => {
                        const popup = e.popup;
                        const btn = popup.getElement().querySelector('.popup-itinerary-btn');
                        if (btn) {
                            btn.addEventListener('click', (evt) => {
                                evt.preventDefault();
                                evt.stopPropagation();
                                this.togglePreviewHotspotSelection(h, marker, popup);
                            });
                        }
                    });

                    this.routePreviewMarkers.push(marker);
                });

                // Store for potential reuse
                this.previewHotspots = nearRouteHotspots;

                // Update selected count display
                this.updatePreviewSelectionCount();
            } catch (e) {
                console.warn('Could not fetch preview hotspots:', e);
            }
        }

        // Fit map to route bounds
        const bounds = this.routePreviewLine.getBounds();
        this.routePreviewMapInstance.fitBounds(bounds, { padding: [20, 20] });

        // Force resize with longer delay to ensure tiles load
        setTimeout(() => {
            if (this.routePreviewMapInstance) {
                this.routePreviewMapInstance.invalidateSize();
                // Re-fit bounds after resize
                this.routePreviewMapInstance.fitBounds(bounds, { padding: [20, 20] });
            }

            // Scroll to route preview section so user can see the map
            this.elements.routePreviewSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }, 250);
    }

    /**
     * Hide route preview and clean up map resources
     */
    hideRoutePreview() {
        this.elements.routePreviewSection.classList.add('hidden');
        // Clean up map resources
        if (this.routePreviewMapInstance) {
            this.routePreviewMapInstance.remove();
            this.routePreviewMapInstance = null;
            this.routePreviewLine = null;
            this.routePreviewMarkers = [];
        }
    }

    /**
     * Toggle a hotspot's selection state from the preview map popup
     * @param {Object} hotspot - Hotspot data
     * @param {L.CircleMarker} marker - The Leaflet marker
     * @param {L.Popup} popup - The popup to update
     */
    togglePreviewHotspotSelection(hotspot, marker, popup) {
        const locId = hotspot.locId;
        const isCurrentlySelected = this.selectedPreviewHotspots.has(locId);

        if (isCurrentlySelected) {
            // Remove from selection
            this.selectedPreviewHotspots.delete(locId);
            marker.setStyle({ fillColor: '#FF5722' }); // Orange for unselected
        } else {
            // Add to selection
            this.selectedPreviewHotspots.add(locId);
            marker.setStyle({ fillColor: '#4CAF50' }); // Green for selected
        }

        // Update popup content
        const speciesText = hotspot.numSpeciesAllTime ? `${hotspot.numSpeciesAllTime} species (all time)` : 'Species data unavailable';
        const newIsSelected = this.selectedPreviewHotspots.has(locId);
        const buttonText = newIsSelected ? 'Remove from Itinerary' : 'Add to Itinerary';
        const buttonClass = newIsSelected ? 'popup-btn-remove' : 'popup-btn-add';

        const newContent = `
            <div class="hotspot-preview-popup">
                <strong class="popup-hotspot-name">${hotspot.locName}</strong>
                <div class="popup-species-count">${speciesText}</div>
                <button class="popup-itinerary-btn ${buttonClass}" data-loc-id="${locId}">
                    ${buttonText}
                </button>
            </div>
        `;

        popup.setContent(newContent);

        // Re-attach click handler to new button
        setTimeout(() => {
            const btn = popup.getElement().querySelector('.popup-itinerary-btn');
            if (btn) {
                btn.addEventListener('click', (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    this.togglePreviewHotspotSelection(hotspot, marker, popup);
                });
            }
        }, 0);

        // Update selection count
        this.updatePreviewSelectionCount();
    }

    /**
     * Update the display showing how many hotspots are selected from preview
     */
    updatePreviewSelectionCount() {
        const count = this.selectedPreviewHotspots ? this.selectedPreviewHotspots.size : 0;

        // Update or create the selection count display in the route preview section
        let countDisplay = document.getElementById('previewSelectionCount');
        if (!countDisplay) {
            countDisplay = document.createElement('div');
            countDisplay.id = 'previewSelectionCount';
            countDisplay.className = 'preview-selection-count';
            // Insert after the route stats
            const routeStats = this.elements.routePreviewSection.querySelector('.route-stats');
            if (routeStats) {
                routeStats.after(countDisplay);
            }
        }

        // Clear previous content
        countDisplay.textContent = '';

        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'selection-badge';
            badge.textContent = count;
            countDisplay.appendChild(badge);
            countDisplay.appendChild(document.createTextNode(` hotspot${count !== 1 ? 's' : ''} selected for itinerary`));
        } else {
            countDisplay.textContent = 'Click on orange markers to add hotspots to your itinerary';
        }
        countDisplay.classList.remove('hidden');
    }

    /**
     * Handle using current location for route start or end
     * @param {'start'|'end'} target - Which input to fill
     */
    async handleUseCurrentLocationForRoute(target) {
        const button = target === 'start'
            ? this.elements.useCurrentLocationStart
            : this.elements.useCurrentLocationEnd;
        const input = target === 'start'
            ? this.elements.routeStartAddress
            : this.elements.routeEndAddress;

        button.disabled = true;

        try {
            // Get current GPS position
            const position = await getCurrentPosition();

            // Reverse geocode to get address
            let address = '';
            try {
                const reverseResult = await reverseGeocode(position.lat, position.lng);
                if (reverseResult.address && reverseResult.address !== 'Address unavailable') {
                    address = reverseResult.address;
                }
            } catch (e) {
                console.warn('Reverse geocoding failed:', e);
            }

            // Fill input with address or coordinates
            input.value = address || `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;

            // Store validated coordinates and show success indicator
            if (target === 'start') {
                this.routeStartValidated = true;
                this.validatedRouteStartCoords = { lat: position.lat, lng: position.lng };
                this.clearRouteStartError();
                this.showValidationIndicator(this.elements.routeStartValidationIcon, this.elements.routeStartAddress, 'success');
            } else {
                this.routeEndValidated = true;
                this.validatedRouteEndCoords = { lat: position.lat, lng: position.lng };
                this.clearRouteEndError();
                this.showValidationIndicator(this.elements.routeEndValidationIcon, this.elements.routeEndAddress, 'success');
            }

            // Try to show route preview if both addresses are validated
            this.tryShowRoutePreview();

        } catch (error) {
            const showError = target === 'start' ? this.showRouteStartError.bind(this) : this.showRouteEndError.bind(this);
            const iconElement = target === 'start' ? this.elements.routeStartValidationIcon : this.elements.routeEndValidationIcon;
            const inputElement = target === 'start' ? this.elements.routeStartAddress : this.elements.routeEndAddress;
            this.showValidationIndicator(iconElement, inputElement, 'error');
            showError(error.message || 'Could not get your location');
        } finally {
            button.disabled = false;
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

            // Use pre-validated coords if available, otherwise geocode
            if (this.endAddressValidated && this.validatedEndCoords) {
                end = { lat: this.validatedEndCoords.lat, lng: this.validatedEndCoords.lng, address: endAddr };
            } else {
                try {
                    const endCoords = await geocodeAddress(endAddr);
                    end = { lat: endCoords.lat, lng: endCoords.lng, address: endAddr };
                } catch (e) {
                    this.showError('Could not find end address. Please check and try again.');
                    return;
                }
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

        // Helper to create stat element
        const createStat = (value, label) => {
            const stat = document.createElement('div');
            stat.className = 'itinerary-stat';
            const valueSpan = document.createElement('span');
            valueSpan.className = 'itinerary-stat-value';
            valueSpan.textContent = value;
            const labelSpan = document.createElement('span');
            labelSpan.className = 'itinerary-stat-label';
            labelSpan.textContent = label;
            stat.appendChild(valueSpan);
            stat.appendChild(labelSpan);
            return stat;
        };

        stats.appendChild(createStat(formatItineraryDuration(itinerary.summary.totalTripTime), 'Total Trip Time'));
        stats.appendChild(createStat(`${(itinerary.summary.totalDistance * 0.621371).toFixed(1)} mi`, 'Total Distance'));
        stats.appendChild(createStat(formatItineraryDuration(itinerary.summary.totalTravelTime), 'Driving Time'));
        stats.appendChild(createStat(formatItineraryDuration(itinerary.summary.totalVisitTime), 'Birding Time'));
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
            legEl.appendChild(createSVGIcon('car', 16));
            const distSpan = document.createElement('span');
            distSpan.textContent = `${(leg.distance * 0.621371).toFixed(1)} mi`;
            legEl.appendChild(distSpan);
            const dividerSpan = document.createElement('span');
            dividerSpan.textContent = '|';
            legEl.appendChild(dividerSpan);
            const durationSpan = document.createElement('span');
            durationSpan.textContent = formatItineraryDuration(leg.duration / 60);
            legEl.appendChild(durationSpan);
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
            arrivalSpan.appendChild(createSVGIcon('schedule', 14));
            arrivalSpan.appendChild(document.createTextNode(` Arrive ${formatItineraryTime(stop.arrivalTime)}`));
            metaDiv.appendChild(arrivalSpan);
        }

        if (stop.suggestedVisitTime > 0) {
            const visitSpan = document.createElement('span');
            visitSpan.appendChild(createSVGIcon('eye', 14));
            visitSpan.appendChild(document.createTextNode(` ${formatItineraryDuration(stop.suggestedVisitTime)} birding`));
            metaDiv.appendChild(visitSpan);
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

        this.showLoading('Generating route PDF...', 0);

        try {
            // Get start and end from itinerary stops
            const startStop = this.currentItinerary.stops.find(s => s.type === 'start');
            const endStop = this.currentItinerary.stops.find(s => s.type === 'end') || startStop;

            const routeData = {
                start: {
                    address: startStop.address || startStop.name,
                    lat: startStop.lat,
                    lng: startStop.lng
                },
                end: {
                    address: endStop.address || endStop.name,
                    lat: endStop.lat,
                    lng: endStop.lng
                },
                itinerary: this.currentItinerary,
                generatedDate: new Date().toLocaleDateString()
            };

            const pdf = await generateRoutePDFReport(routeData, (msg, pct) => {
                this.updateLoading(msg, pct);
            });

            downloadRoutePDF(pdf);
            this.hideLoading();
            this.showSuccessToast('Route PDF downloaded!');
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

        // Add OpenStreetMap tiles (flat top-down style)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
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

        // Abort in-flight fetch requests
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        this.hideLoading();
    }

    /**
     * Handle "New Search" button click
     */
    handleNewSearch() {
        // Switch back to single-column layout
        document.querySelector('.main-content').classList.remove('has-results');

        // Clean up all maps
        this.cleanupMaps();

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

        // Hide and clear route hotspots selection
        this.elements.routeHotspotsSection.classList.add('hidden');
        clearElement(this.elements.routeHotspotsList);
        this.routeHotspots = [];

        // Show sort buttons again (may have been hidden for species search)
        this.elements.sortBySpecies.parentElement.classList.remove('hidden');

        // Show export PDF button again (may have been hidden for route mode)
        this.elements.exportPdfBtn.classList.remove('hidden');

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
        // 4s duration for accessibility - allows time to read
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    /**
     * Show a brief warning toast message for partial failures
     * @param {string} message - Warning message to display
     */
    showWarningToast(message) {
        const toast = document.createElement('div');
        toast.className = 'warning-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.textContent = message;

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Longer delay for warnings so users can read them
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    /**
     * Show warning toast if there were partial failures during search
     */
    showPartialFailureWarning() {
        if (this.partialFailures.length === 0) return;

        const message = this.partialFailures.length === 1
            ? `Some data unavailable: ${this.partialFailures[0]}`
            : `Some data unavailable: ${this.partialFailures.slice(0, 2).join(', ')}${this.partialFailures.length > 2 ? '...' : ''}`;

        this.showWarningToast(message);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Store app instance for debugging (accessible via window.app)
    window.app = new BirdingHotspotsApp();
});
