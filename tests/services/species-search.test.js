import { assert } from '../run-tests.js';
import { SpeciesSearch } from '../../js/services/species-search.js';

function createMockTaxonomy() {
    return [
        { category: 'species', speciesCode: 'sp1', comName: 'American Robin', sciName: 'Turdus migratorius', familyComName: 'Thrushes' },
        { category: 'species', speciesCode: 'sp2', comName: 'American Crow', sciName: 'Corvus brachyrhynchos', familyComName: 'Crows' },
        { category: 'species', speciesCode: 'sp3', comName: 'European Starling', sciName: 'Sturnus vulgaris', familyComName: 'Starlings' },
        { category: 'species', speciesCode: 'sp4', comName: 'Bald Eagle', sciName: 'Haliaeetus leucocephalus', familyComName: 'Hawks' }
    ];
}

export async function testSpeciesSearchPrefixAndContainsMatches() {
    // Mock ebirdApi with only getTaxonomy used by SpeciesSearch.
    const mockApi = {
        async getTaxonomy() {
            return createMockTaxonomy();
        }
    };

    const search = new SpeciesSearch(mockApi);
    await search.loadTaxonomy();

    const prefixResults = search.searchSpecies('American', 10);
    assert(prefixResults.length === 2, 'Expected two species starting with "American"');

    const containsResults = search.searchSpecies('Starling', 10);
    assert(containsResults.length === 1, 'Expected one species containing "Starling"');
    assert(containsResults[0].commonName === 'European Starling', 'Expected European Starling match');
}

export async function testSpeciesSearchRespectsLimit() {
    const mockApi = {
        async getTaxonomy() {
            return createMockTaxonomy();
        }
    };

    const search = new SpeciesSearch(mockApi);
    await search.loadTaxonomy();

    const results = search.searchSpecies('a', 2); // query too short should return empty
    assert(results.length === 0, 'Queries shorter than 2 characters should return empty array');

    const longerResults = search.searchSpecies('American', 1);
    assert(longerResults.length === 1, 'Expected limit to be enforced');
}

