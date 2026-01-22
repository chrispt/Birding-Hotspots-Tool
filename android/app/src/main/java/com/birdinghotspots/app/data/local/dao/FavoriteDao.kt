package com.birdinghotspots.app.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.birdinghotspots.app.data.local.entity.FavoriteEntity
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for favorite locations.
 */
@Dao
interface FavoriteDao {

    /**
     * Get all favorites as a Flow (reactive).
     */
    @Query("SELECT * FROM favorites ORDER BY createdAt DESC")
    fun getAllFavorites(): Flow<List<FavoriteEntity>>

    /**
     * Get all favorites (one-shot).
     */
    @Query("SELECT * FROM favorites ORDER BY createdAt DESC")
    suspend fun getAllFavoritesOnce(): List<FavoriteEntity>

    /**
     * Get a favorite by ID.
     */
    @Query("SELECT * FROM favorites WHERE id = :id")
    suspend fun getFavoriteById(id: Long): FavoriteEntity?

    /**
     * Insert a new favorite.
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFavorite(favorite: FavoriteEntity): Long

    /**
     * Update an existing favorite.
     */
    @Update
    suspend fun updateFavorite(favorite: FavoriteEntity)

    /**
     * Delete a favorite.
     */
    @Delete
    suspend fun deleteFavorite(favorite: FavoriteEntity)

    /**
     * Delete a favorite by ID.
     */
    @Query("DELETE FROM favorites WHERE id = :id")
    suspend fun deleteFavoriteById(id: Long)

    /**
     * Get count of favorites.
     */
    @Query("SELECT COUNT(*) FROM favorites")
    suspend fun getFavoriteCount(): Int

    /**
     * Check if a location is already a favorite (by coordinates).
     */
    @Query("SELECT EXISTS(SELECT 1 FROM favorites WHERE latitude = :lat AND longitude = :lng)")
    suspend fun isFavorite(lat: Double, lng: Double): Boolean
}
