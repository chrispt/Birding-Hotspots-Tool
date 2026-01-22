package com.birdinghotspots.app.domain.model

/**
 * A birding hotspot with all computed fields.
 */
data class Hotspot(
    val locId: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val countryCode: String? = null,
    val subnational1Code: String? = null,
    val subnational2Code: String? = null,
    val latestObsDate: String? = null,
    val numSpeciesAllTime: Int? = null,

    // Computed/enriched fields
    val recentSpeciesCount: Int = 0,
    val straightLineDistance: Double? = null,  // in miles
    val drivingDistance: Double? = null,       // in miles
    val drivingDuration: Long? = null,         // in seconds
    val address: String? = null,
    val observations: List<Observation> = emptyList(),
    val hasNotableSpecies: Boolean = false
) {
    /**
     * Get unique species from observations.
     */
    val uniqueSpecies: List<Observation>
        get() = observations.distinctBy { it.speciesCode }

    /**
     * Get notable species from observations.
     */
    val notableSpecies: List<Observation>
        get() = observations.filter { it.isNotable }.distinctBy { it.speciesCode }

    /**
     * Formatted driving time (e.g., "25 min" or "1 hr 15 min").
     */
    val formattedDrivingTime: String?
        get() {
            val seconds = drivingDuration ?: return null
            val minutes = (seconds / 60).toInt()
            return when {
                minutes < 60 -> "$minutes min"
                else -> {
                    val hours = minutes / 60
                    val remainingMinutes = minutes % 60
                    if (remainingMinutes == 0) "$hours hr"
                    else "$hours hr $remainingMinutes min"
                }
            }
        }

    /**
     * Formatted straight-line distance (e.g., "5.2 mi").
     */
    val formattedDistance: String?
        get() = straightLineDistance?.let { "%.1f mi".format(it) }

    /**
     * Formatted driving distance (e.g., "7.3 mi").
     */
    val formattedDrivingDistance: String?
        get() = drivingDistance?.let { "%.1f mi".format(it) }
}
