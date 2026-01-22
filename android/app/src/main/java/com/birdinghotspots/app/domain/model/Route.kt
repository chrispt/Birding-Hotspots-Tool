package com.birdinghotspots.app.domain.model

/**
 * A driving route between two or more points.
 */
data class Route(
    val origin: Location,
    val destination: Location,
    val waypoints: List<Location> = emptyList(),
    val distanceMeters: Double,
    val durationSeconds: Long,
    val geometry: List<Pair<Double, Double>> = emptyList() // lat, lng pairs
) {
    /**
     * Distance in miles.
     */
    val distanceMiles: Double
        get() = distanceMeters / 1609.344

    /**
     * Duration in minutes.
     */
    val durationMinutes: Int
        get() = (durationSeconds / 60).toInt()

    /**
     * Formatted distance (e.g., "25.3 mi").
     */
    val formattedDistance: String
        get() = "%.1f mi".format(distanceMiles)

    /**
     * Formatted duration (e.g., "45 min" or "1 hr 30 min").
     */
    val formattedDuration: String
        get() {
            val minutes = durationMinutes
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
}

/**
 * A leg of a route between consecutive waypoints.
 */
data class RouteLeg(
    val startLocation: Location,
    val endLocation: Location,
    val distanceMeters: Double,
    val durationSeconds: Long
) {
    val distanceMiles: Double get() = distanceMeters / 1609.344
    val durationMinutes: Int get() = (durationSeconds / 60).toInt()
}
