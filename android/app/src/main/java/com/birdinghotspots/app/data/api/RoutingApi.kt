package com.birdinghotspots.app.data.api

import com.birdinghotspots.app.data.model.RouteResponse
import com.birdinghotspots.app.data.model.TripResponse
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * OSRM (Open Source Routing Machine) API interface.
 * Documentation: http://project-osrm.org/docs/v5.24.0/api/
 */
interface RoutingApi {

    /**
     * Get driving route between two or more points.
     *
     * @param coordinates Semicolon-separated coordinate pairs: "lng1,lat1;lng2,lat2"
     * @param overview Level of detail for route geometry (full, simplified, false)
     * @param geometries Format of route geometry (geojson, polyline, polyline6)
     * @param steps Include turn-by-turn instructions
     */
    @GET("route/v1/driving/{coordinates}")
    suspend fun getRoute(
        @Path("coordinates") coordinates: String,
        @Query("overview") overview: String = "full",
        @Query("geometries") geometries: String = "geojson",
        @Query("steps") steps: Boolean = false
    ): RouteResponse

    /**
     * Solve traveling salesman problem - optimize visit order.
     *
     * @param coordinates Semicolon-separated coordinate pairs: "lng1,lat1;lng2,lat2;..."
     * @param source Which waypoint to use as start (first, last, any)
     * @param destination Which waypoint to use as end (first, last, any)
     * @param roundtrip Whether to return to start (true/false)
     * @param overview Level of detail for route geometry
     * @param geometries Format of route geometry
     */
    @GET("trip/v1/driving/{coordinates}")
    suspend fun getOptimizedTrip(
        @Path("coordinates") coordinates: String,
        @Query("source") source: String = "first",
        @Query("destination") destination: String = "last",
        @Query("roundtrip") roundtrip: Boolean = false,
        @Query("overview") overview: String = "full",
        @Query("geometries") geometries: String = "geojson"
    ): TripResponse
}
