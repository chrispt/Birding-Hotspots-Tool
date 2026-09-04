import { assert } from '../run-tests.js';

// Mock localStorage before importing the service under test
const _store = {};
global.localStorage = {
    getItem: (k) => _store[k] ?? null,
    setItem: (k, v) => { _store[k] = v; },
    removeItem: (k) => { delete _store[k]; }
};

const { LifeListService, collectLifersAcrossHotspots, formatLiferTargetsText } = await import('../../js/services/life-list.js');
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

export async function testImportFromCSVReplaceDiscardsExistingList() {
    clearLifeList();
    const service = new LifeListService();
    service.importFromCSV('Common Name,Scientific Name\nAmerican Crow,Corvus brachyrhynchos\n', TAXONOMY);

    const result = service.importFromCSV(
        'Common Name,Scientific Name\nNorthern Cardinal,Cardinalis cardinalis\n', TAXONOMY, { replace: true });

    assert(result.replaced === true, 'Result should report that the list was replaced');
    assert(result.imported === 1, `Expected 1 imported, got ${result.imported}`);
    assert(service.getCount() === 1, `Expected list of 1 after replace, got ${service.getCount()}`);
    assert(service.isOnLifeList('norcar'), 'New species should be on the list');
    assert(!service.isOnLifeList('amecro'), 'Old species should have been discarded');
}

export async function testImportFromCSVReplaceKeepsOldListWhenFileHasNoSpecies() {
    clearLifeList();
    const service = new LifeListService();
    service.importFromCSV('Common Name,Scientific Name\nAmerican Crow,Corvus brachyrhynchos\n', TAXONOMY);

    const result = service.importFromCSV('Common Name,Scientific Name\n', TAXONOMY, { replace: true });

    assert(result.replaced === false, 'Nothing should be replaced when the file has no species');
    assert(service.getCount() === 1, 'Existing list should be untouched');
    assert(service.isOnLifeList('amecro'), 'Existing species should remain');
}

export async function testImportFromCSVDefaultStillMerges() {
    clearLifeList();
    const service = new LifeListService();
    service.importFromCSV('Common Name,Scientific Name\nAmerican Crow,Corvus brachyrhynchos\n', TAXONOMY);

    const result = service.importFromCSV('Common Name,Scientific Name\nNorthern Cardinal,Cardinalis cardinalis\n', TAXONOMY);

    assert(result.replaced === false, 'Two-argument call must not replace');
    assert(service.getCount() === 2, `Expected merged list of 2, got ${service.getCount()}`);
}

const LIFER_HOTSPOTS = [
    { name: 'Marsh', birds: [
        { speciesCode: 'a', comName: 'Bird A', isLifer: true, lastSeen: '2026-09-01 08:00' },
        { speciesCode: 'x', comName: 'Seen Bird', isLifer: false, lastSeen: '2026-09-01 08:00' }
    ] },
    { name: 'Lake', birds: [
        { speciesCode: 'a', comName: 'Bird A', isLifer: true, lastSeen: '2026-08-30 08:00' },
        { speciesCode: 'b', comName: 'Bird B', isLifer: true, lastSeen: '2026-08-29 08:00' }
    ] },
    { name: 'Ridge', birds: [
        { speciesCode: 'a', comName: 'Bird A', isLifer: true, lastSeen: '2026-08-20 08:00' }
    ] }
];

export async function testCollectLifersCountsHotspotsPerSpecies() {
    const lifers = collectLifersAcrossHotspots(LIFER_HOTSPOTS);
    assert(lifers.length === 2, `Expected 2 unique lifers, got ${lifers.length}`);
    const a = lifers.find(l => l.speciesCode === 'a');
    assert(a.hotspotCount === 3, `Bird A should be counted at 3 hotspots, got ${a.hotspotCount}`);
    assert(a.hotspotName === 'Marsh', 'First hotspot should supply the display name');
    assert(a.lastSeen === '2026-09-01 08:00', 'First sighting should supply lastSeen');
    const b = lifers.find(l => l.speciesCode === 'b');
    assert(b.hotspotCount === 1, 'Bird B should be counted once');
}

export async function testCollectLifersIgnoresNonLifers() {
    const lifers = collectLifersAcrossHotspots(LIFER_HOTSPOTS);
    assert(!lifers.some(l => l.speciesCode === 'x'), 'Species already seen must not be listed');
    assert(collectLifersAcrossHotspots([]).length === 0, 'Empty input gives empty output');
    assert(collectLifersAcrossHotspots([{ name: 'No birds' }]).length === 0, 'Hotspot without birds is tolerated');
}

export async function testFormatLiferTargetsTextIncludesMoreSpotsSuffix() {
    const lifers = collectLifersAcrossHotspots(LIFER_HOTSPOTS);
    const text = formatLiferTargetsText(lifers, () => 'today', '2026 MN list');
    const lines = text.split('\n');
    assert(lines[0] === 'Target birds not on your 2026 MN list (2)', `Unexpected header: ${lines[0]}`);
    assert(lines[1] === '[ ] Bird A - Marsh (+2 more spots) (today)', `Unexpected line: ${lines[1]}`);
    assert(lines[2] === '[ ] Bird B - Lake (today)', `Unexpected line: ${lines[2]}`);
}

export async function testImportFromCSVStripsBomAndAcceptsBareCarriageReturns() {
    clearLifeList();
    const service = new LifeListService();
    const csv = '\uFEFFCommon Name,Scientific Name\rAmerican Crow,Corvus brachyrhynchos\rNorthern Cardinal,Cardinalis cardinalis\r';

    const result = service.importFromCSV(csv, TAXONOMY);

    assert(result.errors.length === 0, `Expected no errors, got: ${result.errors.join(', ')}`);
    assert(result.imported === 2, `Expected 2 species imported, got ${result.imported}`);
    assert(service.isOnLifeList('amecro') && service.isOnLifeList('norcar'), 'Both species should be matched to taxonomy codes');
}

export async function testImportFromCSVFindsHeaderAfterTitleLine() {
    clearLifeList();
    const service = new LifeListService();
    const csv = 'My eBird life list\n\nRow #,Taxon Order,Category,Common Name,Scientific Name,Count\n1,1,species,American Crow,Corvus brachyrhynchos,3\n';

    const result = service.importFromCSV(csv, TAXONOMY);

    assert(result.errors.length === 0, `Expected no errors, got: ${result.errors.join(', ')}`);
    assert(result.imported === 1, `Expected 1 species imported, got ${result.imported}`);
    assert(result.header.includes('Common Name'), 'Detected header should be reported');
    assert(result.rows === 1, `Expected 1 data row counted, got ${result.rows}`);
}

export async function testImportFromCSVReportsHeaderWhenRowsHaveNoNames() {
    clearLifeList();
    const service = new LifeListService();
    const csv = 'Common Name,Scientific Name\n,\n , \n';

    const result = service.importFromCSV(csv, TAXONOMY);

    assert(result.imported === 0 && result.errors.length === 0, 'Blank rows import nothing and are not an error');
    assert(result.rows === 2, `Expected 2 blank data rows counted, got ${result.rows}`);
    assert(result.header.join(',') === 'Common Name,Scientific Name', `Header should be reported, got ${result.header}`);
}
