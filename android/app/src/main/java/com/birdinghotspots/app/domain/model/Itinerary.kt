package com.birdinghotspots.app.domain.model

import java.time.LocalTime
import java.time.format.DateTimeFormatter

/**
 * A complete birding itinerary with stops and timing.
 */
data class Itinerary(
    val origin: Location,
    val destination: Location,
    val stops: List<ItineraryStop>,
    val totalDistanceMeters: Double,
    val totalDurationSeconds: Long,
    val totalVisitTimeMinutes: Int,
    val geometry: List<Pair<Double, Double>> = emptyList()
) {
    /**
     * Total trip time including driving and visits.
     */
    val totalTripMinutes: Int
        get() = (totalDurationSeconds / 60).toInt() + totalVisitTimeMinutes

    /**
     * Total distance in miles.
     */
    val totalDistanceMiles: Double
        get() = totalDistanceMeters / 1609.344

    /**
     * Formatted total distance.
     */
    val formattedTotalDistance: String
        get() = "%.1f mi".format(totalDistanceMiles)

    /**
     * Formatted total trip time.
     */
    val formattedTotalTime: String
        get() {
            val minutes = totalTripMinutes
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
 * A single stop in an itinerary.
 */
data class ItineraryStop(
    val hotspot: Hotspot,
    val stopNumber: Int,
    val arrivalTime: LocalTime? = null,
    val departureTime: LocalTime? = null,
    val visitDurationMinutes: Int,
    val travelFromPreviousMinutes: Int,
    val travelFromPreviousMiles: Double
) {
    private val timeFormatter = DateTimeFormatter.ofPattern("h:mm a")

    val formattedArrivalTime: String?
        get() = arrivalTime?.format(timeFormatter)

    val formattedDepartureTime: String?
        get() = departureTime?.format(timeFormatter)

    val formattedTravelFromPrevious: String
        get() = when {
            travelFromPreviousMinutes < 60 -> "$travelFromPreviousMinutes min"
            else -> {
                val hours = travelFromPreviousMinutes / 60
                val mins = travelFromPreviousMinutes % 60
                if (mins == 0) "$hours hr" else "$hours hr $mins min"
            }
        }
}

/**
 * Priority for itinerary optimization.
 */
enum class ItineraryPriority {
    BALANCED,   // Equal weight to species and distance
    SPECIES,    // Prioritize biodiversity
    DISTANCE    // Minimize driving
}
