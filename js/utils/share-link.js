/**
 * Route-mode share links. The location-mode hash (lat/lng/addr/sort/range/
 * count) is handled in app.js; this module owns the `mode=route` variant.
 */

const MAX_ADDRESS_LENGTH = 200;
const MIN_ADDRESS_LENGTH = 3;
export const ROUTE_DETOUR_VALUES = [3, 5, 7, 9, 11, 13, 15];
export const DEFAULT_ROUTE_DETOUR = 5;

/**
 * @param {{from: string, to: string, detour?: number|string}} route
 * @returns {string} Hash body (no leading '#'), e.g. mode=route&from=...&to=...&detour=5
 */
export function buildRouteShareHash({ from, to, detour } = {}) {
    const params = new URLSearchParams();
    params.set('mode', 'route');
    params.set('from', String(from || '').trim().slice(0, MAX_ADDRESS_LENGTH));
    params.set('to', String(to || '').trim().slice(0, MAX_ADDRESS_LENGTH));
    params.set('detour', String(clampDetour(detour)));
    return params.toString();
}

/**
 * @param {string} hash - window.location.hash with or without the leading '#'
 * @returns {{from: string, to: string, detour: number}|null}
 */
export function parseRouteShareHash(hash) {
    const body = String(hash || '').replace(/^#/, '');
    if (!body) return null;
    const params = new URLSearchParams(body);
    if (params.get('mode') !== 'route') return null;

    const from = (params.get('from') || '').trim().slice(0, MAX_ADDRESS_LENGTH);
    const to = (params.get('to') || '').trim().slice(0, MAX_ADDRESS_LENGTH);
    if (from.length < MIN_ADDRESS_LENGTH || to.length < MIN_ADDRESS_LENGTH) return null;

    return { from, to, detour: clampDetour(params.get('detour')) };
}

/** Snap any value onto the detour slider's legal steps. */
export function clampDetour(value) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return DEFAULT_ROUTE_DETOUR;
    const min = ROUTE_DETOUR_VALUES[0];
    const max = ROUTE_DETOUR_VALUES[ROUTE_DETOUR_VALUES.length - 1];
    const bounded = Math.min(max, Math.max(min, n));
    return ROUTE_DETOUR_VALUES.reduce((closest, v) =>
        Math.abs(v - bounded) < Math.abs(closest - bounded) ? v : closest, ROUTE_DETOUR_VALUES[0]);
}
