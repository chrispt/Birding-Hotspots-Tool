import { assert } from '../run-tests.js';
import { getOptimizedTrip } from '../../js/api/routing.js';

export async function testOptimizedTripUsesWaypointIndexesForTripOrder() {
    const waypoints = [
        { name: 'Alpha', lat: 10, lng: 20 },
        { name: 'Bravo', lat: 30, lng: 40 },
        { name: 'Charlie', lat: 50, lng: 60 },
        { name: 'Delta', lat: 70, lng: 80 }
    ];

    const previousFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            code: 'Ok',
            trips: [{
                distance: 4000,
                duration: 240,
                legs: [
                    { distance: 1000, duration: 60 },
                    { distance: 1000, duration: 60 },
                    { distance: 2000, duration: 120 }
                ],
                geometry: { type: 'LineString', coordinates: [] }
            }],
            // OSRM returns waypoints in input order. waypoint_index is each
            // waypoint's position in the optimized trip order: 2, 0, 3, 1.
            waypoints: [
                { waypoint_index: 1, location: [20.1, 10.1] },
                { waypoint_index: 3, location: [40.1, 30.1] },
                { waypoint_index: 0, location: [60.1, 50.1] },
                { waypoint_index: 2, location: [80.1, 70.1] }
            ]
        })
    });

    try {
        const trip = await getOptimizedTrip(waypoints, {}, 1);

        assert(trip !== null, 'Expected an optimized trip result');
        assert(trip.stops.map(stop => stop.name).join(',') === 'Charlie,Alpha,Delta,Bravo',
            `Expected trip order Charlie,Alpha,Delta,Bravo, got ${trip.stops.map(stop => stop.name).join(',')}`);
        assert(trip.stops.map(stop => stop.originalIndex).join(',') === '2,0,3,1',
            `Expected original indexes 2,0,3,1, got ${trip.stops.map(stop => stop.originalIndex).join(',')}`);
        assert(trip.stops[0].snappedLocation.lat === 50.1 && trip.stops[0].snappedLocation.lng === 60.1,
            'The first stop should use the snapped location for the input waypoint at index 2');
    } finally {
        global.fetch = previousFetch;
    }
}
