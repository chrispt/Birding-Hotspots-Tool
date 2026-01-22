package com.birdinghotspots.app.data.repository

import com.birdinghotspots.app.data.api.EBirdApi
import com.birdinghotspots.app.data.local.dao.TaxonomyDao
import com.birdinghotspots.app.data.local.entity.TaxonomyEntity
import com.birdinghotspots.app.data.model.HotspotResponse
import com.birdinghotspots.app.data.model.ObservationResponse
import com.birdinghotspots.app.domain.model.Hotspot
import com.birdinghotspots.app.domain.model.Observation
import com.birdinghotspots.app.domain.model.Species
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Repository for eBird API operations.
 * Handles hotspot searches, observations, and taxonomy caching.
 */
@Singleton
class EBirdRepository @Inject constructor(
    private val eBirdApi: EBirdApi,
    private val taxonomyDao: TaxonomyDao
) {
    /**
     * Get nearby hotspots with optional observation enrichment.
     */
    suspend fun getNearbyHotspots(
        apiKey: String,
        lat: Double,
        lng: Double,
        distanceKm: Int = 50,
        daysBack: Int = 30
    ): Result<List<Hotspot>> = withContext(Dispatchers.IO) {
        try {
            val response = eBirdApi.getNearbyHotspots(
                apiKey = apiKey,
                lat = lat,
                lng = lng,
                dist = distanceKm,
                back = daysBack
            )

            val hotspots = response.map { it.toHotspot(lat, lng) }
            Result.success(hotspots)
        } catch (e: Exception) {
            Timber.e(e, "Failed to get nearby hotspots")
            Result.failure(e)
        }
    }

    /**
     * Get nearby hotspots and enrich with recent observations.
     */
    suspend fun getNearbyHotspotsWithObservations(
        apiKey: String,
        lat: Double,
        lng: Double,
        distanceKm: Int = 50,
        daysBack: Int = 30,
        maxHotspots: Int = 20
    ): Flow<Result<List<Hotspot>>> = flow {
        try {
            // First get the hotspots
            val hotspotsResult = getNearbyHotspots(apiKey, lat, lng, distanceKm, daysBack)

            if (hotspotsResult.isFailure) {
                emit(Result.failure(hotspotsResult.exceptionOrNull() ?: Exception("Unknown error")))
                return@flow
            }

            val hotspots = (hotspotsResult.getOrNull() ?: emptyList()).take(maxHotspots).toMutableList()

            // Emit initial results without observations
            emit(Result.success(hotspots.toList()))

            // Enrich each hotspot with observations (with rate limiting)
            for (i in hotspots.indices) {
                try {
                    delay(200) // Rate limiting: 5 requests per second max
                    val observations = getRecentObservations(apiKey, hotspots[i].locId, daysBack)

                    observations.getOrNull()?.let { obs ->
                        hotspots[i] = hotspots[i].copy(
                            observations = obs,
                            recentSpeciesCount = obs.distinctBy { it.speciesCode }.size,
                            hasNotableSpecies = obs.any { it.isNotable }
                        )
                    }
                } catch (e: Exception) {
                    Timber.w(e, "Failed to get observations for ${hotspots[i].locId}")
                }

                // Emit updated results periodically
                if ((i + 1) % 5 == 0 || i == hotspots.lastIndex) {
                    emit(Result.success(hotspots.toList()))
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to get hotspots with observations")
            emit(Result.failure(e))
        }
    }

    /**
     * Get recent observations at a specific hotspot.
     */
    suspend fun getRecentObservations(
        apiKey: String,
        locId: String,
        daysBack: Int = 30
    ): Result<List<Observation>> = withContext(Dispatchers.IO) {
        try {
            val response = eBirdApi.getRecentObservations(
                apiKey = apiKey,
                locId = locId,
                back = daysBack
            )
            Result.success(response.map { it.toObservation() })
        } catch (e: Exception) {
            Timber.e(e, "Failed to get observations for $locId")
            Result.failure(e)
        }
    }

    /**
     * Get notable (rare) observations nearby.
     */
    suspend fun getNotableObservations(
        apiKey: String,
        lat: Double,
        lng: Double,
        distanceKm: Int = 50,
        daysBack: Int = 14
    ): Result<List<Observation>> = withContext(Dispatchers.IO) {
        try {
            val response = eBirdApi.getNearbyNotableObservations(
                apiKey = apiKey,
                lat = lat,
                lng = lng,
                dist = distanceKm,
                back = daysBack
            )
            Result.success(response.map { it.toObservation(isNotable = true) })
        } catch (e: Exception) {
            Timber.e(e, "Failed to get notable observations")
            Result.failure(e)
        }
    }

    /**
     * Search for observations of a specific species nearby.
     */
    suspend fun searchSpeciesNearby(
        apiKey: String,
        speciesCode: String,
        lat: Double,
        lng: Double,
        distanceKm: Int = 50,
        daysBack: Int = 30
    ): Result<List<Observation>> = withContext(Dispatchers.IO) {
        try {
            val response = eBirdApi.getNearbySpeciesObservations(
                apiKey = apiKey,
                speciesCode = speciesCode,
                lat = lat,
                lng = lng,
                dist = distanceKm,
                back = daysBack
            )
            Result.success(response.map { it.toObservation() })
        } catch (e: Exception) {
            Timber.e(e, "Failed to search for species $speciesCode")
            Result.failure(e)
        }
    }

    /**
     * Get taxonomy (species list). Uses cache if available and valid.
     */
    suspend fun getTaxonomy(apiKey: String, forceRefresh: Boolean = false): Result<List<Species>> =
        withContext(Dispatchers.IO) {
            try {
                // Check cache first
                if (!forceRefresh) {
                    val cached = taxonomyDao.getSpeciesOnly()
                    if (cached.isNotEmpty()) {
                        val oldestTime = taxonomyDao.getOldestCacheTime() ?: 0L
                        if (TaxonomyEntity.isCacheValid(oldestTime)) {
                            Timber.d("Using cached taxonomy (${cached.size} species)")
                            return@withContext Result.success(cached.map { it.toSpecies() })
                        }
                    }
                }

                // Fetch from API
                Timber.d("Fetching taxonomy from eBird API")
                val response = eBirdApi.getTaxonomy(apiKey = apiKey)

                // Cache the results
                val entities = response.map { TaxonomyEntity.fromSpecies(it.toSpecies()) }
                taxonomyDao.clearAll()
                taxonomyDao.insertAll(entities)

                Timber.d("Cached ${entities.size} species")
                Result.success(response.map { it.toSpecies() })
            } catch (e: Exception) {
                Timber.e(e, "Failed to get taxonomy")

                // Try to return cached data even if expired
                val cached = taxonomyDao.getSpeciesOnly()
                if (cached.isNotEmpty()) {
                    Timber.d("Returning stale cached taxonomy")
                    Result.success(cached.map { it.toSpecies() })
                } else {
                    Result.failure(e)
                }
            }
        }

    /**
     * Search species in cached taxonomy.
     */
    suspend fun searchSpeciesInTaxonomy(query: String, limit: Int = 10): List<Species> =
        withContext(Dispatchers.IO) {
            if (query.length < 2) return@withContext emptyList()
            taxonomyDao.searchSpecies(query, limit).map { it.toSpecies() }
        }

    /**
     * Check if taxonomy is cached.
     */
    suspend fun isTaxonomyCached(): Boolean = !taxonomyDao.isEmpty()

    // Extension functions to convert API responses to domain models

    private fun HotspotResponse.toHotspot(originLat: Double, originLng: Double): Hotspot {
        return Hotspot(
            locId = locId,
            name = locName,
            latitude = lat,
            longitude = lng,
            countryCode = countryCode,
            subnational1Code = subnational1Code,
            subnational2Code = subnational2Code,
            numSpeciesAllTime = numSpeciesAllTime,
            straightLineDistance = calculateDistance(originLat, originLng, lat, lng)
        )
    }

    private fun ObservationResponse.toObservation(isNotable: Boolean = false): Observation {
        return Observation(
            speciesCode = speciesCode,
            commonName = comName,
            scientificName = sciName,
            locationId = locId,
            locationName = locName,
            latitude = lat,
            longitude = lng,
            observationDate = obsDt,
            howMany = howMany,
            isNotable = isNotable,
            isValid = obsValid ?: true
        )
    }

    private fun com.birdinghotspots.app.data.model.TaxonomyResponse.toSpecies(): Species {
        return Species(
            speciesCode = speciesCode,
            commonName = comName,
            scientificName = sciName,
            familyCommonName = familyComName,
            familyScientificName = familySciName,
            order = order,
            category = category
        )
    }

    /**
     * Calculate distance between two points using Haversine formula.
     * @return Distance in miles.
     */
    private fun calculateDistance(
        lat1: Double, lng1: Double,
        lat2: Double, lng2: Double
    ): Double {
        val earthRadiusMiles = 3958.8

        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)

        val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLng / 2) * sin(dLng / 2)

        val c = 2 * atan2(sqrt(a), sqrt(1 - a))

        return earthRadiusMiles * c
    }
}
