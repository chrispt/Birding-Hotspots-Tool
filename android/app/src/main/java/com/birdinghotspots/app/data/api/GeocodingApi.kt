package com.birdinghotspots.app.data.api

import com.birdinghotspots.app.data.model.GeocodingResponse
import com.birdinghotspots.app.data.model.ReverseGeocodingResponse
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * LocationIQ Geocoding API interface.
 * Documentation: https://locationiq.com/docs
 */
interface GeocodingApi {

    /**
     * Forward geocoding - convert address to coordinates.
     *
     * @param query Address or place name to search
     * @param key API key
     * @param format Response format (json)
     * @param limit Maximum number of results
     */
    @GET("search")
    suspend fun geocode(
        @Query("q") query: String,
        @Query("key") key: String,
        @Query("format") format: String = "json",
        @Query("limit") limit: Int = 5
    ): List<GeocodingResponse>

    /**
     * Reverse geocoding - convert coordinates to address.
     *
     * @param lat Latitude
     * @param lon Longitude
     * @param key API key
     * @param format Response format (json)
     */
    @GET("reverse")
    suspend fun reverseGeocode(
        @Query("lat") lat: Double,
        @Query("lon") lon: Double,
        @Query("key") key: String,
        @Query("format") format: String = "json"
    ): ReverseGeocodingResponse
}
