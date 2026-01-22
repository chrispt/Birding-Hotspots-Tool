package com.birdinghotspots.app.data.repository

import com.birdinghotspots.app.BuildConfig
import com.birdinghotspots.app.data.api.GeocodingApi
import com.birdinghotspots.app.domain.model.Location
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for geocoding operations.
 * Converts addresses to coordinates and vice versa.
 */
@Singleton
class GeocodingRepository @Inject constructor(
    private val geocodingApi: GeocodingApi
) {
    // API key loaded from BuildConfig (can be overridden in local.properties)
    private val apiKey = BuildConfig.LOCATIONIQ_API_KEY

    // Simple in-memory cache for session
    private val geocodeCache = mutableMapOf<String, Location>()
    private val reverseCache = mutableMapOf<String, String>()

    /**
     * Geocode an address to coordinates.
     */
    suspend fun geocode(address: String): Result<Location> = withContext(Dispatchers.IO) {
        try {
            // Check cache first
            geocodeCache[address.lowercase()]?.let {
                Timber.d("Geocode cache hit for: $address")
                return@withContext Result.success(it)
            }

            val response = geocodingApi.geocode(
                query = address,
                key = apiKey,
                format = "json",
                limit = 1
            )

            if (response.isEmpty()) {
                return@withContext Result.failure(Exception("Address not found"))
            }

            val result = response.first()
            val location = Location(
                latitude = result.lat.toDouble(),
                longitude = result.lon.toDouble(),
                address = result.displayName,
                name = address
            )

            // Cache the result
            geocodeCache[address.lowercase()] = location

            Result.success(location)
        } catch (e: Exception) {
            Timber.e(e, "Geocoding failed for: $address")
            Result.failure(e)
        }
    }

    /**
     * Reverse geocode coordinates to an address.
     */
    suspend fun reverseGeocode(lat: Double, lng: Double): Result<String> =
        withContext(Dispatchers.IO) {
            try {
                val cacheKey = "$lat,$lng"

                // Check cache first
                reverseCache[cacheKey]?.let {
                    Timber.d("Reverse geocode cache hit for: $cacheKey")
                    return@withContext Result.success(it)
                }

                val response = geocodingApi.reverseGeocode(
                    lat = lat,
                    lon = lng,
                    key = apiKey,
                    format = "json"
                )

                val address = response.displayName

                // Cache the result
                reverseCache[cacheKey] = address

                Result.success(address)
            } catch (e: Exception) {
                Timber.e(e, "Reverse geocoding failed for: $lat, $lng")
                Result.failure(e)
            }
        }

    /**
     * Batch reverse geocode multiple locations (with rate limiting).
     */
    suspend fun batchReverseGeocode(
        locations: List<Pair<Double, Double>>
    ): Map<Pair<Double, Double>, String> = withContext(Dispatchers.IO) {
        val results = mutableMapOf<Pair<Double, Double>, String>()

        for (location in locations) {
            val (lat, lng) = location
            try {
                val result = reverseGeocode(lat, lng)
                result.getOrNull()?.let { address ->
                    results[location] = address
                }
                // Rate limit: 2 requests per second for LocationIQ free tier
                kotlinx.coroutines.delay(500)
            } catch (e: Exception) {
                Timber.w(e, "Failed to reverse geocode $lat, $lng")
            }
        }

        results
    }

    /**
     * Clear the geocoding cache.
     */
    fun clearCache() {
        geocodeCache.clear()
        reverseCache.clear()
    }
}
