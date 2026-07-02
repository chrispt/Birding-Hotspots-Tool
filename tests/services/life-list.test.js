import { assert } from '../run-tests.js';

// Mock localStorage before importing the service under test
const _store = {};
global.localStorage = {
    getItem: (k) => _store[k] ?? null,
    setItem: (k, v) => { _store[k] = v; },
    removeItem: (k) => { delete _store[k]; }
};

const { LifeListService } = await import('../../js/services/life-list.js');
const { CONFIG } = await import('../../js/utils/constants.js');

function clearLifeList() {
    delete _store[CONFIG.STORAGE_KEYS.LIFE_LIST];
}

const TAXONOMY = [
    { speciesCode: 'amecro', comName: 'American Crow', sciName: 'Corvus brachyrhynchos' },
    { speciesCode: 'norcar', comName: 'Northern Cardinal', sciName: 'Cardinalis cardinalis' }
];

export async function testImportFromCSVAcceptsValidLifeList() {
    clearLifeList();
    const service = new LifeListService();
    const csv = 'Common Name,Scientific Name\nAmerican Crow,Corvus brachyrhynchos\nNorthern Cardinal,Cardinalis cardinalis\n';

    const result = service.importFromCSV(csv, TAXONOMY);

    assert(result.errors.length === 0, `Expected no errors, got: ${result.errors.join(', ')}`);
    assert(result.imported === 2, `Expected 2 species imported, got ${result.imported}`);
}

export async function testImportFromCSVRejectsFileOverByteLimit() {
    clearLifeList();
    const service = new LifeListService();
    // One row over the configured byte limit, well under the row-count limit
    const oversizedContent = 'Common Name,Scientific Name\n' + 'A'.repeat(CONFIG.LIFE_LIST_IMPORT.MAX_FILE_SIZE_BYTES + 10);

    const result = service.importFromCSV(oversizedContent, TAXONOMY);

    assert(result.errors.length === 1, `Expected exactly one error, got ${result.errors.length}`);
    assert(result.errors[0].includes('too large'), `Expected a file-size error, got: ${result.errors[0]}`);
    assert(result.imported === 0, 'Should not import anything from an oversized file');
}

export async function testImportFromCSVAcceptsFileUnderByteLimit() {
    clearLifeList();
    const service = new LifeListService();
    // Build a CSV just under the byte limit, but with well-formed valid rows
    const header = 'Common Name,Scientific Name\n';
    const row = 'American Crow,Corvus brachyrhynchos\n';
    const targetRows = Math.floor((CONFIG.LIFE_LIST_IMPORT.MAX_FILE_SIZE_BYTES - header.length) / row.length) - 1;
    const csv = header + row.repeat(Math.max(1, Math.min(targetRows, 100))); // cap repeat count for test speed

    const result = service.importFromCSV(csv, TAXONOMY);

    assert(!result.errors.some(e => e.includes('too large')), 'Should not reject a file under the byte limit');
}

export async function testImportFromCSVRejectsRowCountOverLimit() {
    clearLifeList();
    const service = new LifeListService();
    const header = 'Common Name,Scientific Name\n';
    const row = 'American Crow,Corvus brachyrhynchos\n';
    // Enough rows to exceed MAX_ROWS but each row short enough to stay under MAX_FILE_SIZE_BYTES
    const csv = header + row.repeat(CONFIG.LIFE_LIST_IMPORT.MAX_ROWS + 10);

    const result = service.importFromCSV(csv, TAXONOMY);

    assert(result.errors.length === 1, `Expected exactly one error, got ${result.errors.length}`);
    assert(result.errors[0].includes('Too many rows'), `Expected a row-count error, got: ${result.errors[0]}`);
    assert(result.imported === 0, 'Should not import anything from a file over the row limit');
}

export async function testImportFromCSVSkipsAlreadyOwnedSpecies() {
    clearLifeList();
    const service = new LifeListService();
    service.importFromCSV('Common Name,Scientific Name\nAmerican Crow,Corvus brachyrhynchos\n', TAXONOMY);

    const result = service.importFromCSV('Common Name,Scientific Name\nAmerican Crow,Corvus brachyrhynchos\n', TAXONOMY);

    assert(result.imported === 0, 'Re-importing an already-owned species should not count as newly imported');
    assert(result.duplicates === 1, `Expected 1 duplicate, got ${result.duplicates}`);
}
