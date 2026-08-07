import { assert } from '../run-tests.js';
import { applyHotspotFilters } from '../../js/services/hotspot-filters.js';

function makeHotspots() {
    return [
        { locId: 'plain', speciesCount: 5, birds: [{ isNotable: false, isLifer: false }] },
        { locId: 'notable', speciesCount: 8, birds: [{ isNotable: true, isLifer: false }] },
        { locId: 'lifer', speciesCount: 3, birds: [{ isNotable: false, isLifer: true }] },
        { locId: 'target', speciesCount: 12, birds: [{ isNotable: false, isLifer: false }], hasTargetSpecies: true }
    ];
}

export async function testApplyHotspotFiltersNoFiltersReturnsAll() {
    const hotspots = makeHotspots();
    const result = applyHotspotFilters(hotspots);
    assert(result.length === 4, `Expected all 4 hotspots with no filters, got ${result.length}`);
}

export async function testApplyHotspotFiltersNotableOnly() {
    const result = applyHotspotFilters(makeHotspots(), { notableOnly: true });
    assert(result.length === 1 && result[0].locId === 'notable', 'notableOnly should keep only the notable hotspot');
}

export async function testApplyHotspotFiltersLifersOnly() {
    const result = applyHotspotFilters(makeHotspots(), { lifersOnly: true });
    assert(result.length === 1 && result[0].locId === 'lifer', 'lifersOnly should keep only the lifer hotspot');
}

export async function testApplyHotspotFiltersTargetOnly() {
    const result = applyHotspotFilters(makeHotspots(), { targetOnly: true });
    assert(result.length === 1 && result[0].locId === 'target', 'targetOnly should keep only the target-species hotspot');
}

export async function testApplyHotspotFiltersMinSpecies() {
    const result = applyHotspotFilters(makeHotspots(), { minSpecies: 8 });
    const ids = result.map(h => h.locId).sort();
    assert(ids.join(',') === 'notable,target', `Expected notable,target for minSpecies=8, got ${ids.join(',')}`);
}

export async function testApplyHotspotFiltersCombinesWithAnd() {
    const result = applyHotspotFilters(makeHotspots(), { targetOnly: true, minSpecies: 20 });
    assert(result.length === 0, 'Combined filters should AND together, excluding everything when no hotspot satisfies both');
}

export async function testApplyHotspotFiltersDoesNotMutateInput() {
    const hotspots = makeHotspots();
    applyHotspotFilters(hotspots, { notableOnly: true });
    assert(hotspots.length === 4, 'applyHotspotFilters should not mutate the input array');
}
