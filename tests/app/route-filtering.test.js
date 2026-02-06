import { assert } from '../run-tests.js';

// The route preview filtering logic in js/app.js is currently inlined.
// For testing, we re-implement a small pure helper mirroring the behavior:
// A hotspot is considered near the route if:
//   dist(start, hotspot) + dist(end, hotspot) <= routeDistance + maxDetour * 2
// where dist is in km and maxDetour is in km.

function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // km
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function filterHotspotsNearRoute(start, end, hotspots, maxDetourKm) {
    const routeDistance = calculateDistance(start.lat, start.lng, end.lat, end.lng);
    return hotspots.filter(h => {
        const distFromStart = calculateDistance(start.lat, start.lng, h.lat, h.lng);
        const distFromEnd = calculateDistance(end.lat, end.lng, h.lat, h.lng);
        return (distFromStart + distFromEnd) <= (routeDistance + maxDetourKm * 2);
    });
}

export async function testFilterHotspotsNearRouteBasicBehavior() {
    const start = { lat: 40, lng: -75 };
    const end = { lat: 41, lng: -75 };

    const hotspots = [
        { id: 'onRoute', lat: 40.5, lng: -75 },
        { id: 'farEast', lat: 40.5, lng: -70 },
        { id: 'farWest', lat: 40.5, lng: -80 }
    ];

    const near = filterHotspotsNearRoute(start, end, hotspots, 20);
    const ids = near.map(h => h.id);

    assert(ids.includes('onRoute'), 'Hotspot on the route should be included');
    assert(!ids.includes('farEast') && !ids.includes('farWest'), 'Far hotspots should be excluded');
}

