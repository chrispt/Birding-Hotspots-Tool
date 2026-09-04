import { assert } from '../run-tests.js';
import { computeQuickPicks } from '../../js/services/quick-picks.js';

const HOTSPOTS = [
    { locId: 'A', name: 'Alpha Marsh', speciesCount: 40, distance: 12 },
    { locId: 'B', name: 'Bravo Pond', speciesCount: 25, distance: 2 },
    { locId: 'C', name: 'Charlie Ridge', speciesCount: 10, distance: 8 }
];

export async function testQuickPicksPicksThreeDistinctWinners() {
    const freshness = h => ({ A: 10, B: 5, C: 1 })[h.locId];
    const picks = computeQuickPicks(HOTSPOTS, { freshnessDays: freshness });
    assert(picks.length === 3, `Expected 3 picks, got ${picks.length}`);
    assert(picks[0].locId === 'A' && picks[0].labels[0] === 'Most species', 'Alpha should win most species');
    assert(picks[1].locId === 'B' && picks[1].labels[0] === 'Closest', 'Bravo should win closest');
    assert(picks[2].locId === 'C' && picks[2].labels[0] === 'Freshest activity', 'Charlie should win freshest');
}

export async function testQuickPicksCollapsesDuplicateWinner() {
    const hotspots = [
        { locId: 'A', name: 'Alpha', speciesCount: 40, distance: 1 },
        { locId: 'B', name: 'Bravo', speciesCount: 25, distance: 2 }
    ];
    const picks = computeQuickPicks(hotspots, { freshnessDays: () => Infinity });
    assert(picks.length === 1, `Expected one collapsed pick, got ${picks.length}`);
    assert(picks[0].labels.join(',') === 'Most species,Closest', `Labels should be ordered, got ${picks[0].labels}`);
}

export async function testQuickPicksSkipsFreshnessWhenNoData() {
    const picks = computeQuickPicks(HOTSPOTS, { freshnessDays: () => Infinity });
    assert(!picks.some(p => p.labels.includes('Freshest activity')), 'No freshness chip when nothing is fresh');
    const noFn = computeQuickPicks(HOTSPOTS);
    assert(noFn.length === 2, 'Without a freshness function only two picks are made');
}

export async function testQuickPicksEmptyForSingleHotspot() {
    assert(computeQuickPicks([HOTSPOTS[0]]).length === 0, 'Single hotspot yields no picks');
    assert(computeQuickPicks([]).length === 0, 'Empty input yields no picks');
    assert(computeQuickPicks(null).length === 0, 'Null input yields no picks');
}

export async function testQuickPicksIgnoresMissingDistance() {
    const hotspots = [
        { locId: 'A', name: 'Alpha', speciesCount: 5 },
        { locId: 'B', name: 'Bravo', speciesCount: 3, distance: 4 }
    ];
    const picks = computeQuickPicks(hotspots);
    const closest = picks.find(p => p.labels.includes('Closest'));
    assert(closest && closest.locId === 'B', 'Hotspot without a distance cannot win closest');
}
