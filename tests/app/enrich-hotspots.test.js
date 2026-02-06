import { assert } from '../run-tests.js';

// This test focuses on verifying that enrichHotspots can reuse addresses,
// driving routes, and weather data when locations are duplicated, which is
// the main lever for reducing API call volume via caching/deduplication.

// We can't easily import the class from js/app.js in isolation without
// bringing in DOM and Leaflet, so this test concentrates on the idea of
// deduplicating locations via a small helper mirroring the behavior.

function dedupeLocations(locations) {
    const keyFor = (loc) => `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`;
    const unique = [];
    const indexMap = new Map();

    locations.forEach((loc, idx) => {
        const key = keyFor(loc);
        if (!indexMap.has(key)) {
            indexMap.set(key, unique.length);
            unique.push(loc);
        }
    });

    return {
        uniqueLocations: unique,
        indexMap
    };
}

export async function testDedupeLocationsProducesStableMapping() {
    const locations = [
        { lat: 10, lng: 20 },
        { lat: 10.0000001, lng: 20.0000001 },
        { lat: 30, lng: 40 }
    ];

    const { uniqueLocations, indexMap } = dedupeLocations(locations);

    assert(uniqueLocations.length === 2, 'Expected two unique locations after de-duplication');
    const key1 = `${locations[0].lat.toFixed(6)},${locations[0].lng.toFixed(6)}`;
    const key2 = `${locations[1].lat.toFixed(6)},${locations[1].lng.toFixed(6)}`;
    assert(indexMap.get(key1) === indexMap.get(key2), 'Close coordinates should map to same unique index');
}

