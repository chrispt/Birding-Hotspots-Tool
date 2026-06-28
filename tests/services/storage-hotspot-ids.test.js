import { assert } from '../run-tests.js';

// Mock localStorage before importing the storage module
const _store = {};
global.localStorage = {
    getItem: (k) => _store[k] ?? null,
    setItem: (k, v) => { _store[k] = v; },
    removeItem: (k) => { delete _store[k]; }
};

// CONFIG is needed by storage.js's import of constants.js
// constants.js exports CONFIG from the module — no global needed here.

const { storage } = await import('../../js/services/storage.js');

function clearHotspots() {
    delete _store['birding_favorite_hotspots'];
}

export async function testGetFavoriteHotspotIdsReturnsEmptySetWhenNone() {
    clearHotspots();
    const ids = storage.getFavoriteHotspotIds();
    assert(ids instanceof Set, 'Should return a Set');
    assert(ids.size === 0, 'Set should be empty when no favorites exist');
}

export async function testGetFavoriteHotspotIdsContainsAddedHotspot() {
    clearHotspots();
    storage.addFavoriteHotspot({ locId: 'L12345', name: 'Test Marsh', lat: 37.5, lng: -122.1 });
    storage.addFavoriteHotspot({ locId: 'L67890', name: 'Shore Park', lat: 37.6, lng: -122.2 });

    const ids = storage.getFavoriteHotspotIds();
    assert(ids.size === 2, `Expected 2 entries, got ${ids.size}`);
    assert(ids.has('L12345'), 'Set should contain L12345');
    assert(ids.has('L67890'), 'Set should contain L67890');
    assert(!ids.has('L99999'), 'Set should not contain unknown locId');
}

export async function testGetFavoriteHotspotIdsReflectsRemoval() {
    clearHotspots();
    storage.addFavoriteHotspot({ locId: 'L11111', name: 'Pond', lat: 38.0, lng: -120.0 });
    storage.addFavoriteHotspot({ locId: 'L22222', name: 'Meadow', lat: 38.1, lng: -120.1 });
    storage.removeFavoriteHotspot('L11111');

    const ids = storage.getFavoriteHotspotIds();
    assert(!ids.has('L11111'), 'Removed hotspot should not be in Set');
    assert(ids.has('L22222'), 'Remaining hotspot should still be in Set');
}

export async function testGetFavoriteHotspotIdsMatchesIsFavoriteHotspot() {
    clearHotspots();
    storage.addFavoriteHotspot({ locId: 'L33333', name: 'Ridge Trail', lat: 39.0, lng: -121.0 });

    const ids = storage.getFavoriteHotspotIds();
    // Both APIs should agree on the same locIds
    assert(ids.has('L33333') === storage.isFavoriteHotspot('L33333'),
        'getFavoriteHotspotIds and isFavoriteHotspot should agree on favorited locId');
    assert(ids.has('L44444') === storage.isFavoriteHotspot('L44444'),
        'getFavoriteHotspotIds and isFavoriteHotspot should agree on non-favorited locId');
}
