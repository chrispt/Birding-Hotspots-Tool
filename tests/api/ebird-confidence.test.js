import { assert } from '../run-tests.js';
import { getConfidenceTier, processObservations } from '../../js/api/ebird.js';

const REFERENCE_DATE = new Date('2026-08-20T12:00:00Z');

function daysAgoDate(days) {
    return new Date(REFERENCE_DATE - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function testConfidenceTierHighWithinThreshold() {
    const { tier, daysAgo } = getConfidenceTier(daysAgoDate(0), REFERENCE_DATE);
    assert(tier === 'high', `Expected high, got ${tier}`);
    assert(daysAgo === 0, `Expected 0 days ago, got ${daysAgo}`);
}

export async function testConfidenceTierHighAtBoundary() {
    const { tier } = getConfidenceTier(daysAgoDate(3), REFERENCE_DATE);
    assert(tier === 'high', `Expected high at 3-day boundary, got ${tier}`);
}

export async function testConfidenceTierMediumJustPastHighBoundary() {
    const { tier } = getConfidenceTier(daysAgoDate(4), REFERENCE_DATE);
    assert(tier === 'medium', `Expected medium at 4 days, got ${tier}`);
}

export async function testConfidenceTierMediumAtBoundary() {
    const { tier } = getConfidenceTier(daysAgoDate(7), REFERENCE_DATE);
    assert(tier === 'medium', `Expected medium at 7-day boundary, got ${tier}`);
}

export async function testConfidenceTierLowPastMediumBoundary() {
    const { tier } = getConfidenceTier(daysAgoDate(8), REFERENCE_DATE);
    assert(tier === 'low', `Expected low at 8 days, got ${tier}`);
}

export async function testConfidenceTierLowForOldSighting() {
    const { tier, daysAgo } = getConfidenceTier(daysAgoDate(29), REFERENCE_DATE);
    assert(tier === 'low', `Expected low at 29 days, got ${tier}`);
    assert(daysAgo === 29, `Expected 29 days ago, got ${daysAgo}`);
}

// processObservations calls getConfidenceTier with the real "now" (no injected
// reference date), so build obsDt values relative to actual current time here.
function realDaysAgoDate(days) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function testProcessObservationsAttachesConfidence() {
    const observations = [
        { speciesCode: 'amero', comName: 'American Robin', sciName: 'Turdus migratorius', howMany: 2, obsDt: realDaysAgoDate(1) }
    ];
    const [bird] = processObservations(observations);
    assert(bird.confidence !== undefined, 'Bird should have a confidence field');
    assert(bird.confidence.tier === 'high', `Expected high confidence, got ${bird.confidence.tier}`);
}

export async function testProcessObservationsUsesMostRecentSightingForConfidence() {
    const olderDt = realDaysAgoDate(20);
    const recentDt = realDaysAgoDate(1);
    const observations = [
        { speciesCode: 'amero', comName: 'American Robin', sciName: 'Turdus migratorius', howMany: 1, obsDt: olderDt },
        { speciesCode: 'amero', comName: 'American Robin', sciName: 'Turdus migratorius', howMany: 3, obsDt: recentDt }
    ];
    const [bird] = processObservations(observations);
    assert(bird.lastSeen === recentDt, 'Should keep the most recent sighting date');
    assert(bird.confidence.tier === 'high', `Expected confidence to reflect the most recent sighting, got ${bird.confidence.tier}`);
}
