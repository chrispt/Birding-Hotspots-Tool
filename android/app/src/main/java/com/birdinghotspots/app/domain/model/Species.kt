package com.birdinghotspots.app.domain.model

/**
 * Bird species from eBird taxonomy.
 */
data class Species(
    val speciesCode: String,
    val commonName: String,
    val scientificName: String,
    val familyCommonName: String? = null,
    val familyScientificName: String? = null,
    val order: String? = null,
    val category: String? = null
)
