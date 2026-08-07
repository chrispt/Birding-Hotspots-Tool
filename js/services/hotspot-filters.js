/**
 * Post-search hotspot filtering. Pure, view-only filtering over an already
 * fetched/enriched hotspot list — never triggers new API calls and never
 * mutates the input array.
 */

/**
 * Filter an enriched hotspot list by notable/lifer/target species presence
 * and a minimum species count. All filters are AND-combined; an unset
 * (falsy/zero) filter is a no-op.
 * @param {Array} hotspots - Enriched hotspots with `.birds`, `.speciesCount`, and optional `.hasTargetSpecies`
 * @param {Object} [filters]
 * @param {boolean} [filters.notableOnly] - Keep only hotspots with a notable/rare bird
 * @param {boolean} [filters.lifersOnly] - Keep only hotspots with a potential lifer
 * @param {boolean} [filters.targetOnly] - Keep only hotspots with a target species (route mode)
 * @param {number} [filters.minSpecies] - Keep only hotspots with at least this many species
 * @returns {Array} Filtered hotspots (new array, does not mutate input)
 */
export function applyHotspotFilters(hotspots, filters = {}) {
    const { notableOnly = false, lifersOnly = false, targetOnly = false, minSpecies = 0 } = filters;

    return hotspots.filter(hotspot => {
        if (minSpecies > 0 && (hotspot.speciesCount ?? 0) < minSpecies) return false;
        if (notableOnly && !(hotspot.birds || []).some(bird => bird.isNotable)) return false;
        if (lifersOnly && !(hotspot.birds || []).some(bird => bird.isLifer)) return false;
        if (targetOnly && !hotspot.hasTargetSpecies) return false;
        return true;
    });
}
