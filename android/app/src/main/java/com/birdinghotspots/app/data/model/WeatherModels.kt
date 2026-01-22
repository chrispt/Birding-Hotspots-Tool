package com.birdinghotspots.app.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * Open-Meteo weather response.
 */
@JsonClass(generateAdapter = true)
data class WeatherResponse(
    @Json(name = "latitude") val latitude: Double,
    @Json(name = "longitude") val longitude: Double,
    @Json(name = "timezone") val timezone: String?,
    @Json(name = "current") val current: CurrentWeather?
)

/**
 * Current weather conditions.
 */
@JsonClass(generateAdapter = true)
data class CurrentWeather(
    @Json(name = "time") val time: String,
    @Json(name = "temperature_2m") val temperature: Double?,
    @Json(name = "relative_humidity_2m") val relativeHumidity: Int?,
    @Json(name = "precipitation_probability") val precipitationProbability: Int?,
    @Json(name = "weather_code") val weatherCode: Int?,
    @Json(name = "wind_speed_10m") val windSpeed: Double?,
    @Json(name = "wind_direction_10m") val windDirection: Int?,
    @Json(name = "is_day") val isDay: Int?
) {
    /**
     * Get weather description from WMO code.
     * Based on WMO weather interpretation codes.
     */
    fun getWeatherDescription(): String {
        return when (weatherCode) {
            0 -> "Clear sky"
            1 -> "Mainly clear"
            2 -> "Partly cloudy"
            3 -> "Overcast"
            45, 48 -> "Foggy"
            51, 53, 55 -> "Drizzle"
            56, 57 -> "Freezing drizzle"
            61, 63, 65 -> "Rain"
            66, 67 -> "Freezing rain"
            71, 73, 75 -> "Snow"
            77 -> "Snow grains"
            80, 81, 82 -> "Rain showers"
            85, 86 -> "Snow showers"
            95 -> "Thunderstorm"
            96, 99 -> "Thunderstorm with hail"
            else -> "Unknown"
        }
    }

    /**
     * Get weather icon name based on WMO code.
     */
    fun getWeatherIcon(): String {
        return when (weatherCode) {
            0 -> "sunny"
            1, 2 -> "partly_cloudy"
            3 -> "cloudy"
            45, 48 -> "foggy"
            51, 53, 55, 61, 63, 65, 80, 81, 82 -> "rainy"
            56, 57, 66, 67 -> "freezing_rain"
            71, 73, 75, 77, 85, 86 -> "snowy"
            95, 96, 99 -> "thunderstorm"
            else -> "unknown"
        }
    }

    /**
     * Get birding conditions rating.
     * Returns a score from 1-5 (5 being best for birding).
     */
    fun getBirdingConditionsRating(): Int {
        return when {
            // Bad conditions: heavy rain, snow, thunderstorms
            weatherCode in listOf(65, 75, 82, 95, 96, 99) -> 1
            // Poor conditions: moderate rain, fog, freezing precip
            weatherCode in listOf(63, 73, 81, 45, 48, 56, 57, 66, 67) -> 2
            // Fair conditions: light rain/snow, drizzle
            weatherCode in listOf(51, 53, 55, 61, 71, 80, 77, 85) -> 3
            // Good conditions: overcast, partly cloudy
            weatherCode in listOf(2, 3) -> 4
            // Best conditions: clear, mainly clear
            weatherCode in listOf(0, 1) -> 5
            else -> 3
        }
    }
}
