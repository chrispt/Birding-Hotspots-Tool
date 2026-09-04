/**
 * Itinerary Builder Service
 * Creates optimized birding routes through multiple hotspots
 */

import { getOptimizedTrip, getRouteThrough } from '../api/routing.js';
import { calculateDistance } from '../utils/formatters.js';

/**
 * Calculate suggested visit time based on species count
 * Formula: 30 min base + 1 min per 10 species
 * @param {number} speciesCount - Number of species at the hotspot
 * @returns {number} Suggested visit time in minutes
 */
export function calculateVisitTime(speciesCount) {
    const baseTime = 30; // 30 minutes base
    const speciesBonus = Math.ceil(speciesCount / 10);
    return baseTime + speciesBonus;
}

/**
 * Calculate unique species contribution for a hotspot
 * @param {Object} hotspot - Hotspot with birds array
 * @param {Set} seenSpecies - Species codes already in selected stops
 * @returns {Object} Uniqueness score data
 */
export function calculateUniquenessScore(hotspot, seenSpecies) {
    if (!hotspot.birds || hotspot.birds.length === 0) {
        return {
            uniqueCount: 0,
            uniqueNotable: 0,
            uniqueLifers: 0,
            overlapPercent: 0,
            uniqueBirds: []
        };
    }

    const uniqueBirds = hotspot.birds.filter(b => !seenSpecies.has(b.speciesCode));
    const uniqueNotable = uniqueBirds.filter(b => b.isNotable);
    const uniqueLifers = uniqueBirds.filter(b => b.isLifer);
    const overlapPercent = hotspot.birds.length > 0
        ? Math.round((1 - uniqueBirds.length / hotspot.birds.length) * 100)
        : 0;

    return {
        uniqueCount: uniqueBirds.length,
        uniqueNotable: uniqueNotable.length,
        uniqueLifers: uniqueLifers.length,
        overlapPercent,
        uniqueBirds
    };
}

/**
 * Calculate seen species from selected hotspots
 * @param {Array} selectedHotspots - Array of selected hotspots
 * @returns {Set} Set of species codes from all selected hotspots
 */
export function getSeenSpeciesFromHotspots(selectedHotspots) {
    const seenSpecies = new Set();
    selectedHotspots.forEach(hotspot => {
        if (hotspot.birds) {
            hotspot.birds.forEach(bird => {
                seenSpecies.add(bird.speciesCode);
            });
        }
    });
    return seenSpecies;
}

/**
 * Score a hotspot for route optimization
 * @param {Object} hotspot - Hotspot data with speciesCount and distance
 * @param {number} maxSpecies - Max species count for normalization
 * @param {number} maxDistance - Max distance for normalization
 * @param {string} priority - 'species', 'distance', or 'balanced'
 * @returns {number} Score (higher is better)
 */
export function scoreHotspot(hotspot, maxSpecies, maxDistance, priority = 'balanced') {
    const normalizedSpecies = hotspot.speciesCount / maxSpecies;
    const normalizedDistance = 1 - (hotspot.distance / maxDistance);

    switch (priority) {
        case 'species':
            return 0.8 * normalizedSpecies + 0.2 * normalizedDistance;
        case 'distance':
            return 0.2 * normalizedSpecies + 0.8 * normalizedDistance;
        case 'balanced':
        default:
            return 0.5 * normalizedSpecies + 0.5 * normalizedDistance;
    }
}

/**
 * Select best hotspots for the itinerary
 * @param {Array} hotspots - Available hotspots
 * @param {number} maxStops - Maximum number of stops
 * @param {string} priority - Optimization priority
 * @returns {Array} Selected hotspots
 */
export function selectHotspots(hotspots, maxStops, priority = 'balanced') {
    if (hotspots.length <= maxStops) {
        return [...hotspots];
    }

    const maxSpecies = Math.max(...hotspots.map(h => h.speciesCount));
    const maxDistance = Math.max(...hotspots.map(h => h.distance));

    // Score and sort hotspots
    const scored = hotspots.map(h => ({
        ...h,
        score: scoreHotspot(h, maxSpecies, maxDistance, priority)
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, maxStops);
}

/**
 * Whether the generic "Build Itinerary" panel (which auto-selects hotspots
 * by score, with no per-hotspot picker) should be shown. It only makes sense
 * for location-mode hotspot searches: route mode has its own dedicated
 * pick-your-stops flow, and species-mode searches don't populate
 * `currentResults.hotspots` at all.
 * @param {string} searchType - 'location' or 'route'
 * @param {string} searchSubMode - 'hotspot' or 'species' (only meaningful for 'location')
 * @returns {boolean}
 */
export function canShowGenericItineraryButton(searchType, searchSubMode) {
    return searchType === 'location' && searchSubMode === 'hotspot';
}

/**
 * Build an optimized itinerary
 * @param {Object} start - Start location {lat, lng, address}
 * @param {Object} end - End location {lat, lng, address} (can be same as start for round trip)
 * @param {Array} hotspots - Available hotspots with species data
 * @param {Object} options - Itinerary options
 * @param {number} options.maxStops - Maximum number of hotspot stops (default: 5)
 * @param {string} options.priority - 'species', 'distance', or 'balanced' (default: 'balanced')
 * @param {Function} options.onProgress - Progress callback
 * @param {string} [options.startTime] - Itinerary start time as 'HH:MM' (24-hour); defaults to 7:00 AM
 * @returns {Promise<Object>} Itinerary data
 */
export async function buildItinerary(start, end, hotspots, options = {}) {
    const {
        maxStops = 5,
        priority = 'balanced',
        onProgress = null,
        startTime = null
    } = options;

    if (onProgress) onProgress('Selecting optimal hotspots...', 10);

    // Calculate distances from start for scoring
    const hotspotsWithDistance = hotspots.map(h => ({
        ...h,
        distance: calculateDistance(start.lat, start.lng, h.lat, h.lng)
    }));

    // Select best hotspots
    const selectedHotspots = selectHotspots(hotspotsWithDistance, maxStops, priority);

    if (selectedHotspots.length === 0) {
        throw new Error('No hotspots available for itinerary');
    }

    if (onProgress) onProgress('Optimizing route...', 30);

    // Build waypoints array: start -> hotspots -> end
    const ROUND_TRIP_TOLERANCE = 1e-6;
    const isRoundTrip =
        Math.abs(start.lat - end.lat) < ROUND_TRIP_TOLERANCE &&
        Math.abs(start.lng - end.lng) < ROUND_TRIP_TOLERANCE;
    const waypoints = [
        { lat: start.lat, lng: start.lng, name: 'Start', type: 'start', address: start.address },
        ...selectedHotspots.map(h => ({
            lat: h.lat,
            lng: h.lng,
            name: h.name,
            type: 'hotspot',
            locId: h.locId,
            speciesCount: h.speciesCount,
            address: h.address,
            birds: h.birds,
            weather: h.weather,
            recentObservations: h.recentObservations
        }))
    ];

    if (!isRoundTrip) {
        waypoints.push({
            lat: end.lat,
            lng: end.lng,
            name: 'End',
            type: 'end',
            address: end.address
        });
    }

    // Get optimized route
    const tripOptions = {
        roundtrip: isRoundTrip,
        source: 'first',
        destination: isRoundTrip ? 'any' : 'last'
    };

    let route = await getOptimizedTrip(waypoints, tripOptions);

    // Fallback to simple routing if optimization fails
    if (!route) {
        if (onProgress) onProgress('Using fallback routing...', 50);
        route = await getRouteThrough(waypoints);

        if (!route) {
            throw new Error('Could not calculate a route for this itinerary right now. This can happen if the routing service is temporarily unavailable - please try again in a moment.');
        }

        // Add stops info to fallback route
        route.stops = waypoints.map((wp, i) => ({
            ...wp,
            optimizedOrder: i,
            originalIndex: i
        }));
    }

    if (onProgress) onProgress('Calculating visit times...', 70);

    // Add visit times and arrival/departure estimates
    let currentTime = new Date();
    if (startTime) {
        const [startHour, startMinute] = startTime.split(':').map(Number);
        currentTime.setHours(startHour, startMinute, 0, 0);
    } else {
        currentTime.setHours(7, 0, 0, 0); // Default start at 7 AM
    }

    const stops = route.stops.map((stop, index) => {
        // Add travel time from previous stop before recording arrival, so the
        // reported arrival time actually reflects the drive to reach this stop
        if (index > 0 && route.legs[index - 1]) {
            currentTime = new Date(currentTime.getTime() + route.legs[index - 1].duration * 1000);
        }

        const arrivalTime = new Date(currentTime);

        const visitTime = stop.type === 'hotspot'
            ? calculateVisitTime(stop.speciesCount || 0)
            : 0;

        const departureTime = new Date(currentTime.getTime() + visitTime * 60 * 1000);
        currentTime = departureTime;

        return {
            ...stop,
            stopNumber: index + 1,
            arrivalTime: index > 0 ? arrivalTime : null,
            suggestedVisitTime: visitTime,
            departureTime: stop.type !== 'end' ? departureTime : null,
            legToNext: route.legs[index] || null
        };
    });

    if (onProgress) onProgress('Finalizing itinerary...', 90);

    // Calculate totals
    const totalVisitTime = stops
        .filter(s => s.type === 'hotspot')
        .reduce((sum, s) => sum + s.suggestedVisitTime, 0);

    const totalTravelTime = route.totalDuration / 60; // Convert to minutes

    return {
        stops,
        legs: route.legs,
        geometry: route.geometry,
        summary: {
            totalStops: stops.filter(s => s.type === 'hotspot').length,
            totalDistance: route.totalDistance,
            totalTravelTime,
            totalVisitTime,
            totalTripTime: totalTravelTime + totalVisitTime,
            estimatedEndTime: new Date(stops[0].departureTime?.getTime() || Date.now() +
                (totalTravelTime + totalVisitTime) * 60 * 1000)
        },
        isRoundTrip
    };
}

/**
 * Format duration for display
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted string like "2h 30m"
 */
export function formatItineraryDuration(minutes) {
    if (minutes < 60) {
        return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Format time for display
 * @param {Date} date - Date object
 * @returns {string} Formatted time like "7:30 AM"
 */
export function formatItineraryTime(date) {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

/**
 * Reduce itinerary stops to the fields a saved itinerary needs to be
 * reopened later (name, position, timing). Drops per-stop bird lists,
 * weather and raw observations, which are large and go stale anyway.
 * @param {Array} stops - Stops from buildItinerary()
 * @returns {Array} Lean stop objects with ISO-string arrivalTime
 */
export function toSavedItineraryStops(stops) {
    return (stops || []).map(stop => ({
        type: stop.type,
        name: stop.name,
        locId: stop.locId || null,
        lat: stop.lat,
        lng: stop.lng,
        address: stop.address || '',
        speciesCount: stop.speciesCount || 0,
        stopNumber: stop.stopNumber,
        suggestedVisitTime: stop.suggestedVisitTime || 0,
        arrivalTime: stop.arrivalTime ? new Date(stop.arrivalTime).toISOString() : null
    }));
}

/**
 * Rebuild a displayable itinerary from a saved record. Tolerates legacy
 * saves that have no summary/legs (only stops and totalDistance).
 * @param {Object} saved - Record from storage.getSavedItineraries()
 * @returns {Object} Itinerary shaped like buildItinerary()'s result
 */
export function reviveSavedItinerary(saved) {
    const stops = (saved.stops || []).map((stop, index) => ({
        ...stop,
        stopNumber: stop.stopNumber || index + 1,
        arrivalTime: stop.arrivalTime ? new Date(stop.arrivalTime) : null,
        departureTime: null,
        legToNext: null
    }));
    const hotspotStops = stops.filter(s => s.type === 'hotspot');
    const legs = Array.isArray(saved.legs) ? saved.legs : [];
    const totalVisitTime = hotspotStops.reduce((sum, s) => sum + (s.suggestedVisitTime || 0), 0);
    const totalTravelTime = legs.reduce((sum, l) => sum + (l.duration || 0), 0) / 60;

    const summary = saved.summary ? { ...saved.summary } : {
        totalStops: hotspotStops.length,
        totalDistance: saved.totalDistance || 0,
        totalTravelTime,
        totalVisitTime,
        totalTripTime: totalTravelTime + totalVisitTime
    };
    if (summary.estimatedEndTime) {
        summary.estimatedEndTime = new Date(summary.estimatedEndTime);
    }

    const first = stops[0];
    const last = stops[stops.length - 1];
    const isRoundTrip = typeof saved.isRoundTrip === 'boolean'
        ? saved.isRoundTrip
        : !(last && last.type === 'end');

    return {
        stops,
        legs,
        geometry: null,
        summary,
        isRoundTrip,
        name: saved.name || '',
        origin: saved.origin || (first ? { lat: first.lat, lng: first.lng, address: first.address } : null)
    };
}
