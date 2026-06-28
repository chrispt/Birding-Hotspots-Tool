import { assert } from '../run-tests.js';
import { batchReverseGeocode, reverseGeocode } from '../../js/api/reverse-geo.js';

/**
 * Basic mock for global fetch; individual tests can override behavior.
 */
function installFetchMock(handler) {
    global.fetch = async (...args) => handler(...args);
}

/**
 * Helper to wait a bit in tests.
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function testBatchReverseGeocodeReturnsSameLength() {
    installFetchMock(async () => ({
        ok: true,
        json: async () => ({
            display_name: 'Test Address',
            address: { road: 'Test Rd', city: 'Test City' }
        })
    }));

    const locations = [
        { lat: 10, lng: 20 },
        { lat: 30, lng: 40 },
        { lat: 50, lng: 60 }
    ];

    const results = await batchReverseGeocode(locations);
    assert(Array.isArray(results), 'Expected results to be an array');
    assert(results.length === locations.length, 'Results length should match input length');
}

export async function testBatchReverseGeocodeProgressCallback() {
    installFetchMock(async () => ({
        ok: true,
        json: async () => ({
            display_name: 'Test Address',
            address: { road: 'Test Rd', city: 'Test City' }
        })
    }));

    const locations = [
        { lat: 10, lng: 20 },
        { lat: 30, lng: 40 },
        { lat: 50, lng: 60 }
    ];

    const progressCalls = [];
    await batchReverseGeocode(locations, (current, total) => {
        progressCalls.push({ current, total });
    });

    assert(progressCalls.length === locations.length, 'Progress should be called once per location');
    assert(progressCalls[0].current === 1 && progressCalls[0].total === 3, 'First progress value incorrect');
    assert(progressCalls[2].current === 3 && progressCalls[2].total === 3, 'Last progress value incorrect');
}

export async function testBatchReverseGeocodeRespectsCaching() {
    // Count how many times fetch is called to verify caching reduces calls.
    let fetchCount = 0;
    installFetchMock(async () => {
        fetchCount++;
        await sleep(10);
        return {
            ok: true,
            json: async () => ({
                display_name: 'Cached Address',
                address: { road: 'Cached Rd', city: 'Cached City' }
            })
        };
    });

    const repeatedLocation = { lat: 12.345678, lng: 98.765432 };
    const locations = [
        repeatedLocation,
        repeatedLocation,
        repeatedLocation
    ];

    await batchReverseGeocode(locations);

    // Due to in-module caching, only one network call should be needed for identical coordinates.
    assert(fetchCount === 1, `Expected 1 fetch call for cached coordinates, got ${fetchCount}`);
}

export async function testBatchReverseGeocodeWithAbortedSignalReturnsFallbacks() {
    let fetchCount = 0;
    installFetchMock(async () => {
        fetchCount++;
        return {
            ok: true,
            json: async () => ({ display_name: 'Should not appear', address: { road: 'Rd' } })
        };
    });

    // Use unique coordinates so the in-memory cache doesn't interfere
    const locations = [
        { lat: 71.0, lng: 171.0 },
        { lat: 72.0, lng: 172.0 },
        { lat: 73.0, lng: 173.0 }
    ];

    const controller = new AbortController();
    controller.abort(); // pre-abort the signal

    const results = await batchReverseGeocode(locations, null, controller.signal);

    assert(Array.isArray(results), 'Should return an array even when aborted');
    assert(results.length === locations.length, 'Array length should match input');
    // No fetch calls should have been fired because signal was already aborted
    assert(fetchCount === 0, `Expected 0 fetches for pre-aborted signal, got ${fetchCount}`);
    // All results should be fallback values
    results.forEach((r, i) => {
        assert(r.address === 'Address unavailable', `Result ${i} should be fallback when aborted`);
    });
}

export async function testReverseGeocodeWithAbortedSignalReturnsFallback() {
    installFetchMock(async () => ({
        ok: true,
        json: async () => ({ display_name: 'Unreachable', address: {} })
    }));

    const controller = new AbortController();
    controller.abort();

    // Use unique coords to avoid hitting the in-memory cache from other tests
    const result = await reverseGeocode(89.0, 179.0, controller.signal);

    assert(result.address === 'Address unavailable', 'Aborted reverseGeocode should return fallback');
}

