/**
 * Quick picks: a three-chip answer to "which hotspot should I go to?"
 * Pure function so it can be unit tested without the DOM.
 */

/**
 * @param {Array} hotspots - Enriched hotspots with speciesCount, distance, locId, name
 * @param {Object} [options]
 * @param {Function} [options.freshnessDays] - hotspot => days since the freshest
 *   notable/lifer sighting (Infinity when none). Omit to skip the freshness pick.
 * @returns {Array<{locId: string, name: string, labels: string[]}>}
 */
export function computeQuickPicks(hotspots, { freshnessDays } = {}) {
    if (!Array.isArray(hotspots) || hotspots.length < 2) return [];

    const picks = [];
    const pick = (label, winner) => {
        if (!winner) return;
        const existing = picks.find(p => p.locId === winner.locId);
        if (existing) {
            existing.labels.push(label);
        } else {
            picks.push({ locId: winner.locId, name: winner.name, labels: [label] });
        }
    };

    pick('Most species', best(hotspots, h => -(h.speciesCount ?? -Infinity)));
    pick('Closest', best(hotspots, h => h.distance));
    if (typeof freshnessDays === 'function') {
        pick('Freshest activity', best(hotspots, h => freshnessDays(h)));
    }

    return picks;
}

/** Return the hotspot with the lowest finite metric, or null if none has one. */
function best(hotspots, metric) {
    let winner = null;
    let winnerValue = Infinity;
    for (const h of hotspots) {
        const value = metric(h);
        if (Number.isFinite(value) && value < winnerValue) {
            winner = h;
            winnerValue = value;
        }
    }
    return winner;
}
