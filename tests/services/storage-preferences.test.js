import { assert } from '../run-tests.js';

// Mock localStorage before importing the storage module
const _store = {};
global.localStorage = {
    getItem: (k) => _store[k] ?? null,
    setItem: (k, v) => { _store[k] = v; },
    removeItem: (k) => { delete _store[k]; }
};

const { storage, SEARCH_OPTION_VALUES } = await import('../../js/services/storage.js');
const { CONFIG } = await import('../../js/utils/constants.js');

function reset() {
    for (const key of Object.keys(_store)) delete _store[key];
}

export async function testLifeListLabelDefaultsToEmpty() {
    reset();
    assert(storage.getLifeListLabel() === '', 'Label should default to empty string');
}

export async function testLifeListLabelRoundTripTrimsAndTruncates() {
    reset();
    storage.setLifeListLabel('  2026 Minnesota list  ');
    assert(storage.getLifeListLabel() === '2026 Minnesota list', 'Label should be trimmed');

    storage.setLifeListLabel('x'.repeat(41));
    assert(storage.getLifeListLabel().length === 40, 'Label should be capped at 40 characters');
}

export async function testLifeListLabelEmptyClearsKey() {
    reset();
    storage.setLifeListLabel('County list');
    storage.setLifeListLabel('   ');
    assert(_store[CONFIG.STORAGE_KEYS.LIFE_LIST_LABEL] === undefined, 'Empty label should remove the key');
    assert(storage.getLifeListLabel() === '', 'Label reads back as empty');
}

export async function testSearchOptionsDefaultEmpty() {
    reset();
    const opts = storage.getSearchOptions();
    assert(typeof opts === 'object' && Object.keys(opts).length === 0, 'No saved options gives an empty object');
}

export async function testSearchOptionsRoundTrip() {
    reset();
    storage.setSearchOptions({ sort: 'distance', range: '32', count: 20 });
    const opts = storage.getSearchOptions();
    assert(opts.sort === 'distance', `sort should round trip, got ${opts.sort}`);
    assert(opts.range === '32', `range should round trip, got ${opts.range}`);
    assert(opts.count === '20', `count should round trip as a string, got ${opts.count}`);
}

export async function testSearchOptionsDropsInvalidValues() {
    reset();
    storage.setSearchOptions({ sort: 'evil', range: '999', count: '20' });
    const opts = storage.getSearchOptions();
    assert(opts.sort === undefined, 'Unknown sort must be dropped');
    assert(opts.range === undefined, 'Unknown range must be dropped');
    assert(opts.count === '20', 'Valid count must be kept');

    // Tampered storage is also filtered on read
    _store[CONFIG.STORAGE_KEYS.SEARCH_OPTIONS] = JSON.stringify({ sort: '<script>', count: '10' });
    const tampered = storage.getSearchOptions();
    assert(tampered.sort === undefined && tampered.count === '10', 'Read path must filter too');
    assert(SEARCH_OPTION_VALUES.sort.includes('recency'), 'Allowlist should expose the recency sort');
}

export async function testAddSavedItineraryStoresSummaryAndLegs() {
    reset();
    const saved = storage.addSavedItinerary({
        name: 'Trip',
        stops: [{ type: 'start', lat: 0, lng: 0 }, { type: 'hotspot', lat: 1, lng: 1, name: 'H' }],
        totalDistance: 1234,
        summary: { totalStops: 1, totalDistance: 1234, totalTravelTime: 10, totalVisitTime: 30, totalTripTime: 40 },
        legs: [{ distance: 1234, duration: 600, geometry: 'should-be-dropped' }],
        origin: { lat: 0, lng: 0, address: 'Home' },
        isRoundTrip: true
    });
    assert(saved.summary.totalTripTime === 40, 'Summary should be stored');
    assert(saved.legs.length === 1 && saved.legs[0].geometry === undefined, 'Legs should be stored lean');
    assert(saved.origin.address === 'Home', 'Origin should be stored');
    assert(saved.isRoundTrip === true, 'Round-trip flag should be stored');

    const back = storage.getSavedItineraries()[0];
    assert(back.legs[0].duration === 600, 'Legs should survive the JSON round trip');
}
