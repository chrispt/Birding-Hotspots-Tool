package com.birdinghotspots.app.data.repository

import com.birdinghotspots.app.data.local.dao.FavoriteDao
import com.birdinghotspots.app.data.local.entity.FavoriteEntity
import com.birdinghotspots.app.domain.model.Location
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for saved favorite locations.
 * Provides access to locally stored favorite locations.
 */
@Singleton
class FavoritesRepository @Inject constructor(
    private val favoriteDao: FavoriteDao
) {
    /**
     * Get all favorites as a reactive Flow.
     */
    fun getFavorites(): Flow<List<FavoriteLocation>> {
        return favoriteDao.getAllFavorites().map { entities ->
            entities.map { entity ->
                FavoriteLocation(
                    id = entity.id,
                    name = entity.name,
                    location = entity.toLocation(),
                    createdAt = entity.createdAt
                )
            }
        }
    }

    /**
     * Get all favorites (one-shot).
     */
    suspend fun getFavoritesOnce(): List<FavoriteLocation> = withContext(Dispatchers.IO) {
        favoriteDao.getAllFavoritesOnce().map { entity ->
            FavoriteLocation(
                id = entity.id,
                name = entity.name,
                location = entity.toLocation(),
                createdAt = entity.createdAt
            )
        }
    }

    /**
     * Get a favorite by ID.
     */
    suspend fun getFavoriteById(id: Long): FavoriteLocation? = withContext(Dispatchers.IO) {
        favoriteDao.getFavoriteById(id)?.let { entity ->
            FavoriteLocation(
                id = entity.id,
                name = entity.name,
                location = entity.toLocation(),
                createdAt = entity.createdAt
            )
        }
    }

    /**
     * Add a new favorite location.
     */
    suspend fun addFavorite(location: Location, name: String): Long = withContext(Dispatchers.IO) {
        val entity = FavoriteEntity(
            name = name,
            address = location.address,
            latitude = location.latitude,
            longitude = location.longitude
        )
        val id = favoriteDao.insertFavorite(entity)
        Timber.d("Added favorite: $name (id=$id)")
        id
    }

    /**
     * Update an existing favorite.
     */
    suspend fun updateFavorite(
        id: Long,
        name: String? = null,
        location: Location? = null
    ) = withContext(Dispatchers.IO) {
        val existing = favoriteDao.getFavoriteById(id) ?: return@withContext

        val updated = existing.copy(
            name = name ?: existing.name,
            latitude = location?.latitude ?: existing.latitude,
            longitude = location?.longitude ?: existing.longitude,
            address = location?.address ?: existing.address
        )

        favoriteDao.updateFavorite(updated)
        Timber.d("Updated favorite: ${updated.name} (id=$id)")
    }

    /**
     * Delete a favorite by ID.
     */
    suspend fun deleteFavorite(id: Long) = withContext(Dispatchers.IO) {
        favoriteDao.deleteFavoriteById(id)
        Timber.d("Deleted favorite with id=$id")
    }

    /**
     * Check if a location is already saved as a favorite.
     */
    suspend fun isFavorite(lat: Double, lng: Double): Boolean = withContext(Dispatchers.IO) {
        favoriteDao.isFavorite(lat, lng)
    }

    /**
     * Get count of saved favorites.
     */
    suspend fun getFavoriteCount(): Int = withContext(Dispatchers.IO) {
        favoriteDao.getFavoriteCount()
    }
}

/**
 * Wrapper for favorite location with metadata.
 */
data class FavoriteLocation(
    val id: Long,
    val name: String,
    val location: Location,
    val createdAt: Long
) {
    val formattedDate: String
        get() {
            val sdf = java.text.SimpleDateFormat("MMM d, yyyy", java.util.Locale.getDefault())
            return sdf.format(java.util.Date(createdAt))
        }
}
