import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { assert } from '../run-tests.js';
import { validateAddress } from '../../js/utils/validators.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.resolve(testDir, '../../js/app.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(
        'class BirdingHotspotsApp {',
        'globalThis.BirdingHotspotsApp = class BirdingHotspotsApp {'
    );

const dependencies = {
    geocodeAddress: async () => { throw new Error('Unexpected geocode'); },
    getCurrentPosition: async () => { throw new Error('Unexpected geolocation'); },
    reverseGeocode: async () => ({ address: 'Address unavailable' }),
    getRouteThrough: async () => null,
    buildItinerary: async () => ({})
};

class FakeEBirdAPI {
    setAbortSignal() {}
    async getNearbyHotspots() { return []; }
}

const documentStub = {
    addEventListener() {},
    querySelector() { return { checked: false }; }
};

const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    document: documentStub,
    window: {},
    errorReporter: { init() {} },
    AbortController,
    CONFIG: { DEFAULT_DAYS_BACK: 7, ROUTE_SEARCH: { MAX_SAMPLE_POINTS: 25, MAX_ENRICHMENT_HOTSPOTS: 50 } },
    ErrorMessages: {},
    ErrorTypes: {},
    storage: { setApiKey() {} },
    validateApiKey: () => ({ valid: true, apiKey: 'test-key' }),
    validateAddress,
    clearElement: () => {},
    EBirdAPI: FakeEBirdAPI,
    geocodeAddress: (...args) => dependencies.geocodeAddress(...args),
    getCurrentPosition: (...args) => dependencies.getCurrentPosition(...args),
    reverseGeocode: (...args) => dependencies.reverseGeocode(...args),
    getRouteThrough: (...args) => dependencies.getRouteThrough(...args),
    buildItinerary: (...args) => dependencies.buildItinerary(...args)
});

vm.runInContext(appSource, context, { filename: 'js/app.js' });
const BirdingHotspotsApp = context.BirdingHotspotsApp;

function makeElement(value = '') {
    return {
        value,
        disabled: false,
        textContent: '',
        style: {},
        classList: {
            add() {},
            remove() {},
            toggle() {},
            contains() { return false; }
        },
        focus() {},
        appendChild() {},
        scrollIntoView() {},
        getAttribute() { return null; },
        querySelector() { return null; }
    };
}

function makeBareApp() {
    const app = Object.create(BirdingHotspotsApp.prototype);
    app.elements = {
        inputModeRadios: [{ checked: true, value: 'address' }],
        address: makeElement(),
        addressValidationIcon: makeElement(),
        endAddress: makeElement(),
        endAddressValidationIcon: makeElement(),
        routeStartAddress: makeElement(),
        routeStartValidationIcon: makeElement(),
        routeEndAddress: makeElement(),
        routeEndValidationIcon: makeElement(),
        useCurrentLocation: makeElement(),
        useCurrentLocationStart: makeElement(),
        useCurrentLocationEnd: makeElement(),
        addressInput: makeElement(),
        gpsInput: makeElement(),
        latitude: makeElement(),
        longitude: makeElement(),
        speciesSearchInput: makeElement(),
        selectedSpecies: makeElement(),
        resultsSection: makeElement(),
        mainContent: makeElement(),
        hotspotCards: makeElement(),
        routeStartError: makeElement(),
        routeEndError: makeElement(),
        routeMaxDetour: makeElement('5'),
        routeMaxDetourValue: makeElement('5'),
        routePreviewSection: makeElement(),
        routeHotspotsSection: makeElement(),
        routeHotspotsList: makeElement(),
        routeTargetSpeciesInput: makeElement(),
        endLocationSelect: makeElement('different'),
        endLocationInputs: makeElement(),
        apiKey: makeElement('test-key'),
        rememberKey: { checked: false },
        maxStops: makeElement('3'),
        itineraryStartTime: makeElement('07:00'),
        favoritesList: makeElement()
    };
    app.addressValidated = false;
    app.validatedCoords = null;
    app.validatedAddressInput = null;
    app.endAddressValidated = false;
    app.validatedEndCoords = null;
    app.routeStartValidated = false;
    app.validatedRouteStartCoords = null;
    app.routeEndValidated = false;
    app.validatedRouteEndCoords = null;
    app.addressValidationGeneration = 0;
    app.endAddressValidationGeneration = 0;
    app.routeStartValidationGeneration = 0;
    app.routeEndValidationGeneration = 0;
    app.addressDebounceTimer = null;

    app.clearAddressError = () => {};
    app.clearEndAddressError = () => {};
    app.clearRouteStartError = () => {};
    app.clearRouteEndError = () => {};
    app.showAddressError = () => {};
    app.showEndAddressError = () => {};
    app.showRouteStartError = () => {};
    app.showRouteEndError = () => {};
    app.showValidationIndicator = () => {};
    app.hideValidationIndicator = () => {};
    app.showMapPreview = () => {};
    app.hideMapPreview = () => {};
    app.hideRoutePreview = () => {};
    app.tryShowRoutePreview = () => {};
    app.toggleInputMode = () => {};
    app.resetLocationButton = () => {};
    app.hideError = () => {};
    app.hideLoading = () => {};
    app.showLoading = () => {};
    app.updateLoading = () => {};
    app.showError = () => {};
    app.setSearchSubMode = () => {};
    app.hideSpeciesDropdown = () => {};
    app.renderRouteTargetSpeciesTags = () => {};

    return app;
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
}

const validationCases = {
    location: {
        handler: 'handleAddressBlur',
        inputChange: 'handleAddressInputChange',
        input: 'address',
        validated: 'addressValidated',
        coords: 'validatedCoords',
        resolvedInput: true
    },
    itineraryEnd: {
        handler: 'handleEndAddressBlur',
        inputChange: 'handleEndAddressInputChange',
        input: 'endAddress',
        validated: 'endAddressValidated',
        coords: 'validatedEndCoords',
        resolvedInput: false
    },
    routeStart: {
        handler: 'handleRouteStartBlur',
        inputChange: 'handleRouteStartInputChange',
        input: 'routeStartAddress',
        validated: 'routeStartValidated',
        coords: 'validatedRouteStartCoords',
        resolvedInput: true
    },
    routeEnd: {
        handler: 'handleRouteEndBlur',
        inputChange: 'handleRouteEndInputChange',
        input: 'routeEndAddress',
        validated: 'routeEndValidated',
        coords: 'validatedRouteEndCoords',
        resolvedInput: true
    }
};

async function exerciseValidationRace(caseName, staleRequestFails) {
    const config = validationCases[caseName];
    const app = makeBareApp();
    const oldRequest = deferred();
    const newRequest = deferred();

    dependencies.geocodeAddress = (address) => {
        if (address === 'Old address') return oldRequest.promise;
        if (address === 'New address') return newRequest.promise;
        throw new Error(`Unexpected address: ${address}`);
    };

    app.elements[config.input].value = 'Old address';
    const oldValidation = app[config.handler]();

    app.elements[config.input].value = 'New address';
    app[config.inputChange]();
    const newValidation = app[config.handler]();

    newRequest.resolve({ lat: 44.98, lng: -93.26, address: 'Resolved new address' });
    await newValidation;

    if (staleRequestFails) {
        oldRequest.reject(new Error('Old address failed'));
    } else {
        oldRequest.resolve({ lat: 35.0, lng: -80.0, address: 'Resolved old address' });
    }
    await oldValidation;

    assert(app[config.validated] === true, `${caseName} should retain the newer successful validation`);
    assert(app[config.coords]?.lat === 44.98, `${caseName} should retain the newer latitude`);
    assert(app[config.coords]?.lng === -93.26, `${caseName} should retain the newer longitude`);
    const expectedInput = config.resolvedInput ? 'Resolved new address' : 'New address';
    assert(app.elements[config.input].value === expectedInput, `${caseName} should retain the newer input text`);
}

export async function testCurrentLocationSetsPreciseValidatedCoordinates() {
    const app = makeBareApp();
    const precisePosition = { lat: 44.977753, lng: -93.265011 };
    dependencies.getCurrentPosition = async () => precisePosition;
    dependencies.reverseGeocode = async () => ({ address: 'Minneapolis, Minnesota' });
    documentStub.querySelector = () => ({ checked: false });

    await app.handleUseCurrentLocation();

    assert(app.addressValidated === true, 'Current location should be marked as validated');
    assert(app.validatedCoords?.lat === precisePosition.lat, 'Current location should retain the precise latitude');
    assert(app.validatedCoords?.lng === precisePosition.lng, 'Current location should retain the precise longitude');
}

export async function testCurrentLocationInvalidatesPendingAddressValidation() {
    const app = makeBareApp();
    const oldRequest = deferred();
    dependencies.geocodeAddress = async () => oldRequest.promise;
    dependencies.getCurrentPosition = async () => ({ lat: 44.977753, lng: -93.265011 });
    dependencies.reverseGeocode = async () => ({ address: 'Minneapolis, Minnesota' });

    app.elements.address.value = 'Old address';
    const oldValidation = app.handleAddressBlur();
    await app.handleUseCurrentLocation();
    oldRequest.resolve({ lat: 35.0, lng: -80.0, address: 'Resolved old address' });
    await oldValidation;

    assert(app.validatedCoords?.lat === 44.977753, 'Current location should supersede pending address latitude');
    assert(app.validatedCoords?.lng === -93.265011, 'Current location should supersede pending address longitude');
    assert(app.elements.address.value === 'Minneapolis, Minnesota', 'Current location text should not be replaced by an old address');
}

async function exerciseRouteCurrentLocationSupersedesPendingAddress(target) {
    const app = makeBareApp();
    const config = validationCases[target === 'start' ? 'routeStart' : 'routeEnd'];
    const oldRequest = deferred();
    dependencies.geocodeAddress = async () => oldRequest.promise;
    dependencies.getCurrentPosition = async () => ({ lat: 44.977753, lng: -93.265011 });
    dependencies.reverseGeocode = async () => ({ address: 'Minneapolis, Minnesota' });

    app.elements[config.input].value = 'Old address';
    const oldValidation = app[config.handler]();
    await app.handleUseCurrentLocationForRoute(target);
    oldRequest.resolve({ lat: 35.0, lng: -80.0, address: 'Resolved old address' });
    await oldValidation;

    assert(app[config.coords]?.lat === 44.977753, `Route ${target} current location should supersede pending address latitude`);
    assert(app[config.coords]?.lng === -93.265011, `Route ${target} current location should supersede pending address longitude`);
    assert(app.elements[config.input].value === 'Minneapolis, Minnesota', `Route ${target} text should not be replaced by an old address`);
}

export async function testRouteStartCurrentLocationInvalidatesPendingAddressValidation() {
    await exerciseRouteCurrentLocationSupersedesPendingAddress('start');
}

export async function testRouteEndCurrentLocationInvalidatesPendingAddressValidation() {
    await exerciseRouteCurrentLocationSupersedesPendingAddress('end');
}

export async function testGetCoordinatesUsesValidatedCoordinatesInsteadOfGeocodingDisplayAddress() {
    const app = makeBareApp();
    app.elements.address.value = 'Minneapolis, Minnesota';
    app.addressValidated = true;
    app.validatedCoords = { lat: 44.977753, lng: -93.265011 };
    app.validatedAddressInput = app.elements.address.value;
    let geocodeCalls = 0;
    dependencies.geocodeAddress = async () => {
        geocodeCalls += 1;
        return { lat: 44.95, lng: -93.1, address: 'Approximate Minneapolis result' };
    };

    const result = await app.getCoordinates();

    assert(result.lat === 44.977753, 'Search should use the validated precise latitude');
    assert(result.lng === -93.265011, 'Search should use the validated precise longitude');
    assert(geocodeCalls === 0, 'Search should not geocode an already validated display address');
}

export async function testGetCoordinatesAcceptsValidatedGpsFallbackText() {
    const app = makeBareApp();
    app.elements.address.value = '44.977753, -93.265011';
    app.addressValidated = true;
    app.validatedCoords = { lat: 44.977753, lng: -93.265011 };
    app.validatedAddressInput = app.elements.address.value;

    const result = await app.getCoordinates();

    assert(result.lat === 44.977753, 'Validated GPS fallback text should use its precise latitude');
    assert(result.lng === -93.265011, 'Validated GPS fallback text should use its precise longitude');
}

export async function testGetCoordinatesIgnoresValidationForReplacedAddressText() {
    const app = makeBareApp();
    app.elements.address.value = 'Old address';
    app.addressValidated = true;
    app.validatedCoords = { lat: 35.0, lng: -80.0 };
    app.validatedAddressInput = app.elements.address.value;
    app.elements.address.value = 'New address';
    dependencies.geocodeAddress = async () => ({
        lat: 44.98,
        lng: -93.26,
        address: 'Resolved new address'
    });

    const result = await app.getCoordinates();

    assert(result.lat === 44.98, 'Replaced address text should not reuse an earlier validated latitude');
    assert(result.lng === -93.26, 'Replaced address text should not reuse an earlier validated longitude');
}

export async function testLocationValidationIgnoresStaleSuccess() {
    await exerciseValidationRace('location', false);
}

export async function testLocationValidationIgnoresStaleFailure() {
    await exerciseValidationRace('location', true);
}

export async function testItineraryEndValidationIgnoresStaleSuccess() {
    await exerciseValidationRace('itineraryEnd', false);
}

export async function testItineraryEndValidationIgnoresStaleFailure() {
    await exerciseValidationRace('itineraryEnd', true);
}

export async function testRouteStartValidationIgnoresStaleSuccess() {
    await exerciseValidationRace('routeStart', false);
}

export async function testRouteStartValidationIgnoresStaleFailure() {
    await exerciseValidationRace('routeStart', true);
}

export async function testRouteEndValidationIgnoresStaleSuccess() {
    await exerciseValidationRace('routeEnd', false);
}

export async function testRouteEndValidationIgnoresStaleFailure() {
    await exerciseValidationRace('routeEnd', true);
}

export async function testReportSubmissionStopsWhenAddressChangesDuringGeocoding() {
    const app = makeBareApp();
    const request = deferred();
    let continued = 0;
    dependencies.geocodeAddress = async () => request.promise;
    app.isProcessing = false;
    app.searchType = 'location';
    app.searchSubMode = 'hotspot';
    app.elements.address.value = 'Old address';
    app.getCoordinates = async () => {
        continued += 1;
        return { lat: 35, lng: -80, address: 'Old address' };
    };
    app.getSearchRange = () => 50;

    const search = app.handleGenerateReport();
    app.elements.address.value = 'New address';
    request.resolve({ lat: 35, lng: -80, address: 'Resolved old address' });
    await search;

    assert(app.addressValidated === false, 'Stale report geocoding should not validate the old address');
    assert(continued === 0, 'Report search should not continue with stale geocoding');
}

export async function testSpeciesOriginStopsWhenAddressChangesDuringGeocoding() {
    const app = makeBareApp();
    const request = deferred();
    let continued = 0;
    dependencies.geocodeAddress = async () => request.promise;
    app.elements.address.value = 'Old address';
    app.getCoordinates = async () => {
        continued += 1;
        return { lat: 35, lng: -80, address: 'Old address' };
    };

    const originPromise = app.getSearchOrigin();
    app.elements.address.value = 'New address';
    request.resolve({ lat: 35, lng: -80, address: 'Resolved old address' });
    const origin = await originPromise;

    assert(origin === null, 'Species origin should be abandoned when its address becomes stale');
    assert(app.addressValidated === false, 'Stale species geocoding should not validate the old address');
    assert(continued === 0, 'Species search should not continue with stale geocoding');
}

export async function testRouteSubmissionStopsWhenStartChangesDuringGeocoding() {
    const app = makeBareApp();
    const startRequest = deferred();
    let endGeocodes = 0;
    let routeCalls = 0;
    app.isProcessing = true;
    app.elements.routeStartAddress.value = 'Old start';
    app.elements.routeEndAddress.value = 'Stable end';
    dependencies.geocodeAddress = async (address) => {
        if (address === 'Old start') return startRequest.promise;
        endGeocodes += 1;
        return { lat: 45, lng: -93, address };
    };
    dependencies.getRouteThrough = async () => {
        routeCalls += 1;
        return null;
    };

    const routeSearch = app.handleRouteSearch();
    app.elements.routeStartAddress.value = 'New start';
    startRequest.resolve({ lat: 35, lng: -80, address: 'Resolved old start' });
    await routeSearch;

    assert(app.routeStartValidated === false, 'Stale route start should not be committed');
    assert(endGeocodes === 0, 'Route search should stop before geocoding the end address');
    assert(routeCalls === 0, 'Route search should not calculate a route from stale start coordinates');
}

export async function testRouteSubmissionStopsWhenEndChangesDuringGeocoding() {
    const app = makeBareApp();
    const endRequest = deferred();
    let routeCalls = 0;
    app.isProcessing = true;
    app.elements.routeStartAddress.value = 'Stable start';
    app.elements.routeEndAddress.value = 'Old end';
    app.routeStartValidated = true;
    app.validatedRouteStartCoords = { lat: 44, lng: -92 };
    dependencies.geocodeAddress = async () => endRequest.promise;
    dependencies.getRouteThrough = async () => {
        routeCalls += 1;
        return null;
    };

    const routeSearch = app.handleRouteSearch();
    app.elements.routeEndAddress.value = 'New end';
    endRequest.resolve({ lat: 35, lng: -80, address: 'Resolved old end' });
    await routeSearch;

    assert(app.routeEndValidated === false, 'Stale route end should not be committed');
    assert(routeCalls === 0, 'Route search should not calculate a route from stale end coordinates');
}

export async function testItinerarySubmissionStopsWhenEndChangesDuringGeocoding() {
    const app = makeBareApp();
    const request = deferred();
    let buildCalls = 0;
    app.currentResults = { hotspots: [{ locId: 'L1' }] };
    app.currentLocation = { lat: 44, lng: -93, address: 'Start' };
    app.elements.endAddress.value = 'Old end';
    dependencies.geocodeAddress = async () => request.promise;
    dependencies.buildItinerary = async () => {
        buildCalls += 1;
        return {};
    };
    documentStub.querySelector = () => ({ value: 'distance' });

    const itinerary = app.handleGenerateItinerary();
    app.elements.endAddress.value = 'New end';
    request.resolve({ lat: 35, lng: -80, address: 'Resolved old end' });
    await itinerary;

    assert(buildCalls === 0, 'Itinerary should not build with stale end coordinates');
}

export async function testLocationResetInvalidatesPendingValidation() {
    const app = makeBareApp();
    const request = deferred();
    dependencies.geocodeAddress = async () => request.promise;
    app.elements.address.value = 'Old address';

    const validation = app.handleAddressBlur();
    app.resetLocationSearch();
    request.resolve({ lat: 35, lng: -80, address: 'Resolved old address' });
    await validation;

    assert(app.addressValidated === false, 'Location reset should remain unvalidated');
    assert(app.validatedCoords === null, 'Location reset should not regain stale coordinates');
    assert(app.elements.address.value === '', 'Location reset should keep the address empty');
}

export async function testRouteResetInvalidatesPendingValidations() {
    const app = makeBareApp();
    const startRequest = deferred();
    const endRequest = deferred();
    dependencies.geocodeAddress = async (address) => address === 'Old start' ? startRequest.promise : endRequest.promise;
    app.elements.routeStartAddress.value = 'Old start';
    app.elements.routeEndAddress.value = 'Old end';

    const startValidation = app.handleRouteStartBlur();
    const endValidation = app.handleRouteEndBlur();
    app.resetRouteSearch();
    startRequest.resolve({ lat: 35, lng: -80, address: 'Resolved old start' });
    endRequest.resolve({ lat: 36, lng: -81, address: 'Resolved old end' });
    await Promise.all([startValidation, endValidation]);

    assert(app.routeStartValidated === false, 'Route reset should keep start unvalidated');
    assert(app.routeEndValidated === false, 'Route reset should keep end unvalidated');
    assert(app.elements.routeStartAddress.value === '', 'Route reset should keep start empty');
    assert(app.elements.routeEndAddress.value === '', 'Route reset should keep end empty');
}

export async function testInputModeSwitchInvalidatesPendingAddressValidation() {
    const app = makeBareApp();
    const request = deferred();
    dependencies.geocodeAddress = async () => request.promise;
    app.toggleInputMode = BirdingHotspotsApp.prototype.toggleInputMode.bind(app);
    app.elements.address.value = 'Old address';

    const validation = app.handleAddressBlur();
    app.toggleInputMode('gps');
    request.resolve({ lat: 35, lng: -80, address: 'Resolved old address' });
    await validation;

    assert(app.addressValidated === false, 'Mode switch should keep the old address unvalidated');
    assert(app.validatedCoords === null, 'Mode switch should not regain stale address coordinates');
}

export async function testSavedLocationChoiceInvalidatesPendingAddressValidation() {
    const app = makeBareApp();
    const request = deferred();
    let clickHandler;
    app.elements.favoritesList.addEventListener = (_type, handler) => { clickHandler = handler; };
    app.toggleInputMode = BirdingHotspotsApp.prototype.toggleInputMode.bind(app);
    dependencies.geocodeAddress = async () => request.promise;
    app.elements.address.value = 'Old address';
    app.initializeFavoritesDelegation();

    const validation = app.handleAddressBlur();
    const info = { dataset: { lat: '44.98', lng: '-93.26', address: 'Saved address' } };
    const item = { querySelector: (selector) => selector === '.favorite-info' ? info : null };
    clickHandler({
        target: {
            closest(selector) {
                if (selector === '.favorite-item') return item;
                return null;
            }
        }
    });
    request.resolve({ lat: 35, lng: -80, address: 'Resolved old address' });
    await validation;

    assert(app.elements.address.value === 'Saved address', 'Saved location text should not be replaced by old validation');
    assert(app.validatedCoords === null, 'Saved location choice should invalidate pending address coordinates');
}

export async function testRoundTripSwitchInvalidatesPendingEndValidation() {
    const app = makeBareApp();
    const request = deferred();
    dependencies.geocodeAddress = async () => request.promise;
    app.elements.endAddress.value = 'Old end';

    const validation = app.handleEndAddressBlur();
    app.elements.endLocationSelect.value = 'same';
    app.handleEndLocationChange();
    request.resolve({ lat: 35, lng: -80, address: 'Resolved old end' });
    await validation;

    assert(app.endAddressValidated === false, 'Round trip switch should remain unvalidated');
    assert(app.validatedEndCoords === null, 'Round trip switch should not regain stale end coordinates');
}

export async function testCurrentLocationIgnoresStaleFailure() {
    const app = makeBareApp();
    const request = deferred();
    let errors = 0;
    dependencies.getCurrentPosition = async () => request.promise;
    app.showError = () => { errors += 1; };

    const location = app.handleUseCurrentLocation();
    app.handleAddressInputChange();
    request.reject(new Error('Old location failed'));
    await location;

    assert(errors === 0, 'Stale current-location failure should not show an error');
}

export async function testCurrentLocationClearsValidatedAddressWhileLookupIsPending() {
    const app = makeBareApp();
    const positionRequest = deferred();
    let geocodeCalls = 0;
    app.elements.address.value = 'Previously validated address';
    app.addressValidated = true;
    app.validatedCoords = { lat: 35, lng: -80 };
    app.validatedAddressInput = app.elements.address.value;
    dependencies.getCurrentPosition = async () => positionRequest.promise;
    dependencies.geocodeAddress = async () => {
        geocodeCalls += 1;
        return { lat: 44.98, lng: -93.26, address: 'Fresh geocoded address' };
    };

    const location = app.handleUseCurrentLocation();
    const coordinates = await app.getCoordinates();

    assert(geocodeCalls === 1, 'Pending current location should not reuse previously validated coordinates');
    assert(coordinates.lat === 44.98, 'Coordinate lookup should use fresh geocoding while current location is pending');
    assert(app.addressValidated === false, 'Pending current location should clear prior address validation');
    assert(app.validatedCoords === null, 'Pending current location should clear prior address coordinates');
    assert(app.validatedAddressInput === null, 'Pending current location should clear prior validated input text');

    positionRequest.reject(new Error('Current location failed'));
    await location;

    assert(app.addressValidated === false, 'Failed current location should not restore prior validation');
    assert(app.validatedCoords === null, 'Failed current location should not restore prior coordinates');
    assert(app.validatedAddressInput === null, 'Failed current location should not restore prior input state');
}

async function exerciseRouteCurrentLocationStaleFailure(target) {
    const app = makeBareApp();
    const request = deferred();
    let errors = 0;
    dependencies.getCurrentPosition = async () => request.promise;
    app.showRouteStartError = () => { errors += 1; };
    app.showRouteEndError = () => { errors += 1; };

    const location = app.handleUseCurrentLocationForRoute(target);
    if (target === 'start') app.handleRouteStartInputChange();
    else app.handleRouteEndInputChange();
    request.reject(new Error('Old route location failed'));
    await location;

    assert(errors === 0, `Stale route ${target} current-location failure should not show an error`);
}

export async function testRouteStartCurrentLocationIgnoresStaleFailure() {
    await exerciseRouteCurrentLocationStaleFailure('start');
}

export async function testRouteEndCurrentLocationIgnoresStaleFailure() {
    await exerciseRouteCurrentLocationStaleFailure('end');
}

async function exerciseRouteCurrentLocationClearsPriorValidation(target) {
    const app = makeBareApp();
    const positionRequest = deferred();
    const validatedKey = target === 'start' ? 'routeStartValidated' : 'routeEndValidated';
    const coordsKey = target === 'start' ? 'validatedRouteStartCoords' : 'validatedRouteEndCoords';
    app[validatedKey] = true;
    app[coordsKey] = { lat: 35, lng: -80 };
    dependencies.getCurrentPosition = async () => positionRequest.promise;

    const location = app.handleUseCurrentLocationForRoute(target);

    assert(app[validatedKey] === false, `Pending route ${target} current location should clear prior validation`);
    assert(app[coordsKey] === null, `Pending route ${target} current location should clear prior coordinates`);

    positionRequest.reject(new Error('Route current location failed'));
    await location;

    assert(app[validatedKey] === false, `Failed route ${target} current location should not restore prior validation`);
    assert(app[coordsKey] === null, `Failed route ${target} current location should not restore prior coordinates`);
}

export async function testRouteStartCurrentLocationClearsPriorValidationWhilePending() {
    await exerciseRouteCurrentLocationClearsPriorValidation('start');
}

export async function testRouteEndCurrentLocationClearsPriorValidationWhilePending() {
    await exerciseRouteCurrentLocationClearsPriorValidation('end');
}
