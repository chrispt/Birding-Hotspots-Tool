package com.birdinghotspots.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.birdinghotspots.app.domain.model.Species

/**
 * Room entity for cached eBird taxonomy (species list).
 * Cached for 7 days to avoid repeated large API calls.
 */
@Entity(tableName = "taxonomy")
data class TaxonomyEntity(
    @PrimaryKey
    val speciesCode: String,
    val commonName: String,
    val scientificName: String,
    val familyCommonName: String?,
    val familyScientificName: String?,
    val order: String?,
    val category: String?,
    val cachedAt: Long = System.currentTimeMillis()
) {
    /**
     * Convert to domain Species model.
     */
    fun toSpecies(): Species = Species(
        speciesCode = speciesCode,
        commonName = commonName,
        scientificName = scientificName,
        familyCommonName = familyCommonName,
        familyScientificName = familyScientificName,
        order = order,
        category = category
    )

    companion object {
        // Cache expires after 7 days
        const val CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000L

        /**
         * Create from domain Species model.
         */
        fun fromSpecies(species: Species): TaxonomyEntity {
            return TaxonomyEntity(
                speciesCode = species.speciesCode,
                commonName = species.commonName,
                scientificName = species.scientificName,
                familyCommonName = species.familyCommonName,
                familyScientificName = species.familyScientificName,
                order = species.order,
                category = species.category
            )
        }

        /**
         * Check if cached data is still valid.
         */
        fun isCacheValid(cachedAt: Long): Boolean {
            return System.currentTimeMillis() - cachedAt < CACHE_DURATION_MS
        }
    }
}
