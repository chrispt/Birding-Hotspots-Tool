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
 * Build an optimized itinerary
 * @param {Object} start - Start location {lat, lng, address}
 * @param {Object} end - End location {lat, lng, address} (can be same as start for round trip)
 * @param {Array} hotspots - Available hotspots with species data
 * @param {Object} options - Itinerary options
 * @param {number} options.maxStops - Maximum number of hotspot stops (default: 5)
 * @param {string} options.priority - 'species', 'distance', or 'balanced' (default: 'balanced')
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Object>} Itinerary data
 */
export async function buildItinerary(start, end, hotspots, options = {}) {
    const {
        maxStops = 5,
        priority = 'balanced',
        onProgress = null
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
    const isRoundTrip = start.lat === end.lat && start.lng === end.lng;
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
            birds: h.birds
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
            throw new Error('Could not calculate route. Please try with fewer stops.');
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
    currentTime.setHours(7, 0, 0, 0); // Default start at 7 AM

    const stops = route.stops.map((stop, index) => {
        const arrivalTime = new Date(currentTime);

        // Add travel time from previous stop
        if (index > 0 && route.legs[index - 1]) {
            currentTime = new Date(currentTime.getTime() + route.legs[index - 1].duration * 1000);
        }

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
