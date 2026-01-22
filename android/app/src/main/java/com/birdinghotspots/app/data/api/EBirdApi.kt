package com.birdinghotspots.app.data.api

import com.birdinghotspots.app.data.model.HotspotResponse
import com.birdinghotspots.app.data.model.ObservationResponse
import com.birdinghotspots.app.data.model.TaxonomyResponse
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * eBird API v2 interface.
 * Documentation: https://documenter.getpostman.com/view/664302/S1ENwy59
 */
interface EBirdApi {

    /**
     * Get nearby hotspots.
     *
     * @param apiKey eBird API token
     * @param lat Latitude
     * @param lng Longitude
     * @param dist Distance in kilometers (max 50)
     * @param back Number of days to look back (max 30)
     */
    @GET("ref/hotspot/geo")
    suspend fun getNearbyHotspots(
        @Header("x-ebirdapitoken") apiKey: String,
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("dist") dist: Int = 50,
        @Query("back") back: Int = 30,
        @Query("fmt") fmt: String = "json"
    ): List<HotspotResponse>

    /**
     * Get recent observations at a hotspot.
     *
     * @param apiKey eBird API token
     * @param locId Location ID (e.g., "L123456")
     * @param back Number of days to look back (max 30)
     */
    @GET("data/obs/{locId}/recent")
    suspend fun getRecentObservations(
        @Header("x-ebirdapitoken") apiKey: String,
        @Path("locId") locId: String,
        @Query("back") back: Int = 30
    ): List<ObservationResponse>

    /**
     * Get recent nearby observations.
     *
     * @param apiKey eBird API token
     * @param lat Latitude
     * @param lng Longitude
     * @param dist Distance in kilometers (max 50)
     * @param back Number of days to look back (max 30)
     */
    @GET("data/obs/geo/recent")
    suspend fun getNearbyObservations(
        @Header("x-ebirdapitoken") apiKey: String,
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("dist") dist: Int = 50,
        @Query("back") back: Int = 30
    ): List<ObservationResponse>

    /**
     * Get recent notable observations nearby.
     *
     * @param apiKey eBird API token
     * @param lat Latitude
     * @param lng Longitude
     * @param dist Distance in kilometers (max 50)
     * @param back Number of days to look back (max 30)
     */
    @GET("data/obs/geo/recent/notable")
    suspend fun getNearbyNotableObservations(
        @Header("x-ebirdapitoken") apiKey: String,
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("dist") dist: Int = 50,
        @Query("back") back: Int = 30
    ): List<ObservationResponse>

    /**
     * Get recent observations of a specific species nearby.
     *
     * @param apiKey eBird API token
     * @param speciesCode eBird species code
     * @param lat Latitude
     * @param lng Longitude
     * @param dist Distance in kilometers (max 50)
     * @param back Number of days to look back (max 30)
     */
    @GET("data/obs/geo/recent/{speciesCode}")
    suspend fun getNearbySpeciesObservations(
        @Header("x-ebirdapitoken") apiKey: String,
        @Path("speciesCode") speciesCode: String,
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("dist") dist: Int = 50,
        @Query("back") back: Int = 30
    ): List<ObservationResponse>

    /**
     * Get nearest observations of a specific species.
     *
     * @param apiKey eBird API token
     * @param speciesCode eBird species code
     * @param lat Latitude
     * @param lng Longitude
     * @param back Number of days to look back (max 30)
     */
    @GET("data/nearest/geo/recent/{speciesCode}")
    suspend fun getNearestSpeciesObservations(
        @Header("x-ebirdapitoken") apiKey: String,
        @Path("speciesCode") speciesCode: String,
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("back") back: Int = 30
    ): List<ObservationResponse>

    /**
     * Get eBird taxonomy (list of all species).
     *
     * @param apiKey eBird API token
     * @param cat Category filter (e.g., "species", "issf")
     */
    @GET("ref/taxonomy/ebird")
    suspend fun getTaxonomy(
        @Header("x-ebirdapitoken") apiKey: String,
        @Query("cat") cat: String = "species",
        @Query("fmt") fmt: String = "json"
    ): List<TaxonomyResponse>
}
