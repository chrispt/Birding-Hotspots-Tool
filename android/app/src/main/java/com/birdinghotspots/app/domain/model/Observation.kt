package com.birdinghotspots.app.domain.model

/**
 * A bird observation record from eBird.
 */
data class Observation(
    val speciesCode: String,
    val commonName: String,
    val scientificName: String,
    val locationId: String,
    val locationName: String,
    val latitude: Double,
    val longitude: Double,
    val observationDate: String,
    val howMany: Int? = null,
    val isNotable: Boolean = false,
    val isValid: Boolean = true,
    val observerName: String? = null
)
