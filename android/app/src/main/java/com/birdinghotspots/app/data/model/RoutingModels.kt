package com.birdinghotspots.app.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * OSRM route response.
 */
@JsonClass(generateAdapter = true)
data class RouteResponse(
    @Json(name = "code") val code: String,
    @Json(name = "routes") val routes: List<Route>?,
    @Json(name = "waypoints") val waypoints: List<Waypoint>?
)

/**
 * OSRM trip (optimized route) response.
 */
@JsonClass(generateAdapter = true)
data class TripResponse(
    @Json(name = "code") val code: String,
    @Json(name = "trips") val trips: List<Trip>?,
    @Json(name = "waypoints") val waypoints: List<TripWaypoint>?
)

/**
 * A single route from OSRM.
 */
@JsonClass(generateAdapter = true)
data class Route(
    @Json(name = "distance") val distance: Double, // meters
    @Json(name = "duration") val duration: Double, // seconds
    @Json(name = "geometry") val geometry: Geometry?,
    @Json(name = "legs") val legs: List<RouteLeg>?
)

/**
 * A single trip (optimized route) from OSRM.
 */
@JsonClass(generateAdapter = true)
data class Trip(
    @Json(name = "distance") val distance: Double, // meters
    @Json(name = "duration") val duration: Double, // seconds
    @Json(name = "geometry") val geometry: Geometry?,
    @Json(name = "legs") val legs: List<RouteLeg>?
)

/**
 * A leg of a route (segment between two waypoints).
 */
@JsonClass(generateAdapter = true)
data class RouteLeg(
    @Json(name = "distance") val distance: Double, // meters
    @Json(name = "duration") val duration: Double, // seconds
    @Json(name = "summary") val summary: String?
)

/**
 * GeoJSON geometry.
 */
@JsonClass(generateAdapter = true)
data class Geometry(
    @Json(name = "type") val type: String,
    @Json(name = "coordinates") val coordinates: List<List<Double>>
)

/**
 * Waypoint from a route response.
 */
@JsonClass(generateAdapter = true)
data class Waypoint(
    @Json(name = "name") val name: String,
    @Json(name = "location") val location: List<Double>, // [lng, lat]
    @Json(name = "distance") val distance: Double? // distance to snapped location
)

/**
 * Waypoint from a trip (optimized) response.
 * Includes the optimized order via waypoint_index.
 */
@JsonClass(generateAdapter = true)
data class TripWaypoint(
    @Json(name = "name") val name: String,
    @Json(name = "location") val location: List<Double>, // [lng, lat]
    @Json(name = "waypoint_index") val waypointIndex: Int,
    @Json(name = "trips_index") val tripsIndex: Int,
    @Json(name = "distance") val distance: Double?
)
