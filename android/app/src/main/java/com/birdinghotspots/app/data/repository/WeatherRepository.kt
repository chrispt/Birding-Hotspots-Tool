package com.birdinghotspots.app.data.repository

import com.birdinghotspots.app.data.api.WeatherApi
import com.birdinghotspots.app.domain.model.WeatherConditions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for Open-Meteo weather API operations.
 * Gets current weather conditions for birding assessments.
 */
@Singleton
class WeatherRepository @Inject constructor(
    private val weatherApi: WeatherApi
) {
    /**
     * Get current weather conditions at a location.
     */
    suspend fun getWeather(lat: Double, lng: Double): Result<WeatherConditions> =
        withContext(Dispatchers.IO) {
            try {
                val response = weatherApi.getWeather(
                    latitude = lat,
                    longitude = lng,
                    current = "temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,is_day",
                    temperatureUnit = "fahrenheit",
                    windSpeedUnit = "mph",
                    timezone = "auto"
                )

                val current = response.current
                    ?: return@withContext Result.failure(Exception("No current weather data"))

                val conditions = WeatherConditions(
                    temperature = current.temperature ?: 0.0,
                    temperatureCelsius = fahrenheitToCelsius(current.temperature ?: 0.0),
                    humidity = current.relativeHumidity ?: 0,
                    windSpeed = current.windSpeed ?: 0.0,
                    windDirection = current.windDirection ?: 0,
                    precipitationProbability = current.precipitationProbability ?: 0,
                    weatherCode = current.weatherCode ?: 0,
                    isDay = (current.isDay ?: 1) == 1
                )

                Result.success(conditions)
            } catch (e: Exception) {
                Timber.e(e, "Failed to get weather for $lat, $lng")
                Result.failure(e)
            }
        }

    /**
     * Get weather for multiple locations in parallel.
     */
    suspend fun getWeatherForLocations(
        locations: List<Pair<Double, Double>>
    ): Map<Pair<Double, Double>, WeatherConditions> = withContext(Dispatchers.IO) {
        val results = mutableMapOf<Pair<Double, Double>, WeatherConditions>()

        // Open-Meteo allows parallel requests, but let's be respectful
        for (location in locations) {
            try {
                val result = getWeather(location.first, location.second)
                if (result.isSuccess) {
                    results[location] = result.getOrNull()!!
                }
            } catch (e: Exception) {
                Timber.w(e, "Failed to get weather for ${location.first}, ${location.second}")
            }
        }

        results
    }

    /**
     * Calculate average birding conditions for a set of locations.
     */
    suspend fun getAverageBirdingConditions(
        locations: List<Pair<Double, Double>>
    ): Result<WeatherSummary> = withContext(Dispatchers.IO) {
        try {
            val weatherMap = getWeatherForLocations(locations)

            if (weatherMap.isEmpty()) {
                return@withContext Result.failure(Exception("No weather data available"))
            }

            val conditions = weatherMap.values.toList()
            val avgScore = conditions.map { it.birdingScore }.average().toInt()
            val avgTemp = conditions.map { it.temperature }.average()
            val maxWind = conditions.maxOf { it.windSpeed }
            val maxPrecipProb = conditions.maxOf { it.precipitationProbability }

            val overallRating = when {
                avgScore >= 80 -> "Excellent"
                avgScore >= 60 -> "Good"
                avgScore >= 40 -> "Fair"
                else -> "Poor"
            }

            Result.success(
                WeatherSummary(
                    averageScore = avgScore,
                    averageTemperature = avgTemp,
                    maxWindSpeed = maxWind,
                    maxPrecipitationProbability = maxPrecipProb,
                    overallRating = overallRating,
                    locationCount = conditions.size
                )
            )
        } catch (e: Exception) {
            Timber.e(e, "Failed to calculate average birding conditions")
            Result.failure(e)
        }
    }

    private fun fahrenheitToCelsius(fahrenheit: Double): Double {
        return (fahrenheit - 32) * 5 / 9
    }
}

/**
 * Summary of weather conditions across multiple locations.
 */
data class WeatherSummary(
    val averageScore: Int,
    val averageTemperature: Double,
    val maxWindSpeed: Double,
    val maxPrecipitationProbability: Int,
    val overallRating: String,
    val locationCount: Int
) {
    val formattedTemperature: String
        get() = "%.0f°F".format(averageTemperature)
}
