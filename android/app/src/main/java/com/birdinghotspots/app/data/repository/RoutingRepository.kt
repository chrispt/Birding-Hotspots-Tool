package com.birdinghotspots.app.data.repository

import com.birdinghotspots.app.data.api.RoutingApi
import com.birdinghotspots.app.domain.model.Location
import com.birdinghotspots.app.domain.model.Route
import com.birdinghotspots.app.domain.model.RouteLeg
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for OSRM routing operations.
 * Calculates driving routes and optimizes trip order.
 */
@Singleton
class RoutingRepository @Inject constructor(
    private val routingApi: RoutingApi
) {
    /**
     * Get driving route between two points.
     */
    suspend fun getRoute(
        origin: Location,
        destination: Location
    ): Result<Route> = withContext(Dispatchers.IO) {
        try {
            val coordinates = "${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}"

            val response = routingApi.getRoute(
                coordinates = coordinates,
                overview = "full",
                geometries = "geojson",
                steps = false
            )

            val routes = response.routes
            if (routes.isNullOrEmpty()) {
                return@withContext Result.failure(Exception("No route found"))
            }

            val apiRoute = routes.first()
            val geometry = apiRoute.geometry?.coordinates?.map { coord ->
                Pair(coord[1], coord[0]) // GeoJSON is [lng, lat], we want [lat, lng]
            } ?: emptyList()

            val route = Route(
                origin = origin,
                destination = destination,
                distanceMeters = apiRoute.distance,
                durationSeconds = apiRoute.duration.toLong(),
                geometry = geometry
            )

            Result.success(route)
        } catch (e: Exception) {
            Timber.e(e, "Failed to get route")
            Result.failure(e)
        }
    }

    /**
     * Get driving distances/durations from one origin to multiple destinations.
     * Useful for enriching hotspot list with driving times.
     */
    suspend fun getDistancesToMany(
        origin: Location,
        destinations: List<Location>
    ): Result<List<RouteLeg>> = withContext(Dispatchers.IO) {
        try {
            if (destinations.isEmpty()) {
                return@withContext Result.success(emptyList())
            }

            val results = mutableListOf<RouteLeg>()

            // Process in batches to avoid overwhelming OSRM
            val batchSize = 5
            for (batch in destinations.chunked(batchSize)) {
                for (destination in batch) {
                    try {
                        val routeResult = getRoute(origin, destination)
                        routeResult.getOrNull()?.let { route ->
                            results.add(
                                RouteLeg(
                                    startLocation = origin,
                                    endLocation = destination,
                                    distanceMeters = route.distanceMeters,
                                    durationSeconds = route.durationSeconds
                                )
                            )
                        }
                    } catch (e: Exception) {
                        Timber.w(e, "Failed to get route to ${destination.latitude}, ${destination.longitude}")
                    }
                }
                // Rate limiting between batches
                kotlinx.coroutines.delay(200)
            }

            Result.success(results)
        } catch (e: Exception) {
            Timber.e(e, "Failed to get distances to multiple destinations")
            Result.failure(e)
        }
    }

    /**
     * Optimize trip order through multiple waypoints (Traveling Salesman).
     */
    suspend fun getOptimizedTrip(
        origin: Location,
        waypoints: List<Location>,
        destination: Location? = null, // null = return to origin
        roundTrip: Boolean = true
    ): Result<Route> = withContext(Dispatchers.IO) {
        try {
            if (waypoints.isEmpty()) {
                return@withContext Result.failure(Exception("No waypoints provided"))
            }

            // Build coordinates string: origin;waypoint1;waypoint2;...;destination
            val allPoints = buildList {
                add(origin)
                addAll(waypoints)
                if (!roundTrip && destination != null) {
                    add(destination)
                }
            }

            val coordinates = allPoints.joinToString(";") { "${it.longitude},${it.latitude}" }

            val response = routingApi.getOptimizedTrip(
                coordinates = coordinates,
                source = "first",
                destination = if (roundTrip) "last" else "any",
                roundtrip = roundTrip,
                overview = "full",
                geometries = "geojson"
            )

            val trips = response.trips
            if (trips.isNullOrEmpty()) {
                return@withContext Result.failure(Exception("No optimized route found"))
            }

            val trip = trips.first()
            val geometry = trip.geometry?.coordinates?.map { coord ->
                Pair(coord[1], coord[0])
            } ?: emptyList()

            // Reorder waypoints based on optimized indices
            val optimizedWaypoints = response.waypoints.orEmpty()
                .drop(1) // Skip origin
                .let { if (roundTrip) it else it.dropLast(1) } // Skip destination if not roundtrip
                .sortedBy { it.waypointIndex }
                .mapNotNull { wp ->
                    val idx = wp.waypointIndex - 1 // Adjust for origin
                    waypoints.getOrNull(idx)
                }

            val route = Route(
                origin = origin,
                destination = destination ?: origin,
                waypoints = optimizedWaypoints,
                distanceMeters = trip.distance,
                durationSeconds = trip.duration.toLong(),
                geometry = geometry
            )

            Result.success(route)
        } catch (e: Exception) {
            Timber.e(e, "Failed to optimize trip")
            Result.failure(e)
        }
    }

    /**
     * Get route along a path (for finding hotspots along a route).
     */
    suspend fun getRouteGeometry(
        origin: Location,
        destination: Location
    ): Result<List<Pair<Double, Double>>> = withContext(Dispatchers.IO) {
        val routeResult = getRoute(origin, destination)
        routeResult.fold(
            onSuccess = { route -> Result.success(route.geometry) },
            onFailure = { error -> Result.failure(error) }
        )
    }
}
