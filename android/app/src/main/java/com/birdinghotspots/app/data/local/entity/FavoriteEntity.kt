package com.birdinghotspots.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.birdinghotspots.app.domain.model.Location

/**
 * Room entity for saved favorite locations.
 */
@Entity(tableName = "favorites")
data class FavoriteEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val name: String,
    val address: String?,
    val latitude: Double,
    val longitude: Double,
    val createdAt: Long = System.currentTimeMillis()
) {
    /**
     * Convert to domain Location model.
     */
    fun toLocation(): Location = Location(
        latitude = latitude,
        longitude = longitude,
        address = address,
        name = name
    )

    companion object {
        /**
         * Create from domain Location model.
         */
        fun fromLocation(location: Location, customName: String? = null): FavoriteEntity {
            return FavoriteEntity(
                name = customName ?: location.name ?: location.address ?: "Unnamed Location",
                address = location.address,
                latitude = location.latitude,
                longitude = location.longitude
            )
        }
    }
}
