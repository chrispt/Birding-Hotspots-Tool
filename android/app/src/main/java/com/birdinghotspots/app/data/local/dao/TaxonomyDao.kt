package com.birdinghotspots.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.birdinghotspots.app.data.local.entity.TaxonomyEntity

/**
 * Data Access Object for cached eBird taxonomy.
 */
@Dao
interface TaxonomyDao {

    /**
     * Get all cached species.
     */
    @Query("SELECT * FROM taxonomy ORDER BY commonName ASC")
    suspend fun getAllSpecies(): List<TaxonomyEntity>

    /**
     * Get only species (not subspecies, hybrids, etc.) for search.
     * Category 'species' is the main species type in eBird taxonomy.
     */
    @Query("SELECT * FROM taxonomy WHERE category = 'species' ORDER BY commonName ASC")
    suspend fun getSpeciesOnly(): List<TaxonomyEntity>

    /**
     * Search species by common name (case-insensitive).
     */
    @Query("""
        SELECT * FROM taxonomy
        WHERE category = 'species'
        AND (commonName LIKE '%' || :query || '%' OR scientificName LIKE '%' || :query || '%')
        ORDER BY
            CASE WHEN commonName LIKE :query || '%' THEN 0 ELSE 1 END,
            commonName ASC
        LIMIT :limit
    """)
    suspend fun searchSpecies(query: String, limit: Int = 10): List<TaxonomyEntity>

    /**
     * Get species by code.
     */
    @Query("SELECT * FROM taxonomy WHERE speciesCode = :code")
    suspend fun getSpeciesByCode(code: String): TaxonomyEntity?

    /**
     * Insert multiple species (bulk insert for initial cache).
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(species: List<TaxonomyEntity>)

    /**
     * Clear all cached taxonomy.
     */
    @Query("DELETE FROM taxonomy")
    suspend fun clearAll()

    /**
     * Get count of cached species.
     */
    @Query("SELECT COUNT(*) FROM taxonomy")
    suspend fun getCount(): Int

    /**
     * Get the oldest cache timestamp.
     */
    @Query("SELECT MIN(cachedAt) FROM taxonomy")
    suspend fun getOldestCacheTime(): Long?

    /**
     * Check if cache is empty.
     */
    @Query("SELECT COUNT(*) = 0 FROM taxonomy")
    suspend fun isEmpty(): Boolean
}
