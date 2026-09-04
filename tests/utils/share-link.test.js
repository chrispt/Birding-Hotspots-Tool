import { assert } from '../run-tests.js';
import { buildRouteShareHash, parseRouteShareHash, clampDetour } from '../../js/utils/share-link.js';

export async function testBuildRouteShareHashEncodesAddresses() {
    const hash = buildRouteShareHash({ from: '1 Main St & Elm, Duluth', to: 'Grand Marais, MN', detour: 7 });
    assert(hash.startsWith('mode=route&'), `Hash should start with mode=route, got ${hash}`);
    assert(!hash.includes(' ') && !/&Elm/.test(hash), 'Spaces and ampersands in addresses must be encoded');
    assert(hash.endsWith('detour=7'), `Detour should be last, got ${hash}`);
}

export async function testParseRouteShareHashRoundTrip() {
    const hash = buildRouteShareHash({ from: '1 Main St & Elm, Duluth', to: 'Grand Marais, MN', detour: 7 });
    const parsed = parseRouteShareHash('#' + hash);
    assert(parsed !== null, 'Round trip should parse');
    assert(parsed.from === '1 Main St & Elm, Duluth', `from mismatch: ${parsed.from}`);
    assert(parsed.to === 'Grand Marais, MN', `to mismatch: ${parsed.to}`);
    assert(parsed.detour === 7, `detour mismatch: ${parsed.detour}`);
}

export async function testParseRouteShareHashRejectsNonRouteOrShortAddresses() {
    assert(parseRouteShareHash('lat=44.9&lng=-93.2') === null, 'Location hash is not a route hash');
    assert(parseRouteShareHash('') === null, 'Empty hash is null');
    assert(parseRouteShareHash('mode=route&from=ab&to=Grand Marais') === null, 'Short from is rejected');
    assert(parseRouteShareHash('mode=route&from=Duluth') === null, 'Missing to is rejected');
}

export async function testParseRouteShareHashClampsDetour() {
    assert(parseRouteShareHash('mode=route&from=Duluth&to=Ely&detour=99').detour === 15, '99 clamps to 15');
    assert(parseRouteShareHash('mode=route&from=Duluth&to=Ely&detour=abc').detour === 5, 'Garbage defaults to 5');
    assert(parseRouteShareHash('mode=route&from=Duluth&to=Ely').detour === 5, 'Missing defaults to 5');
    assert(clampDetour(6) === 5 || clampDetour(6) === 7, '6 snaps to a neighbouring step');
    assert(clampDetour(0) === 3, '0 clamps to 3');
}

export async function testBuildRouteShareHashTruncatesLongAddresses() {
    const hash = buildRouteShareHash({ from: 'x'.repeat(500), to: 'Ely, MN' });
    const parsed = parseRouteShareHash(hash);
    assert(parsed.from.length === 200, `Long address should be capped at 200, got ${parsed.from.length}`);
}
