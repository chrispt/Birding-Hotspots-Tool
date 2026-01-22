package com.birdinghotspots.app.domain.model

/**
 * Generic location used for search origins, favorites, etc.
 */
data class Location(
    val latitude: Double,
    val longitude: Double,
    val address: String? = null,
    val name: String? = null
)
