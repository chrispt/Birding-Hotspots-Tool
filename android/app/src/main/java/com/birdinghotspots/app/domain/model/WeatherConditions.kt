package com.birdinghotspots.app.domain.model

/**
 * Weather conditions for a location.
 */
data class WeatherConditions(
    val temperature: Double,          // Fahrenheit
    val temperatureCelsius: Double,   // Celsius
    val humidity: Int,                // Percentage
    val windSpeed: Double,            // mph
    val windDirection: Int,           // degrees
    val precipitationProbability: Int, // Percentage
    val weatherCode: Int,             // WMO code
    val isDay: Boolean = true
) {
    /**
     * Human-readable weather description.
     */
    val description: String
        get() = getWeatherDescription(weatherCode)

    /**
     * Weather icon name based on conditions.
     */
    val icon: String
        get() = getWeatherIcon(weatherCode, isDay)

    /**
     * Birding conditions rating (0-100).
     */
    val birdingScore: Int
        get() = calculateBirdingScore()

    /**
     * Birding conditions rating as text.
     */
    val birdingRating: BirdingRating
        get() = when {
            birdingScore >= 80 -> BirdingRating.EXCELLENT
            birdingScore >= 60 -> BirdingRating.GOOD
            birdingScore >= 40 -> BirdingRating.FAIR
            else -> BirdingRating.POOR
        }

    private fun calculateBirdingScore(): Int {
        var score = 100

        // Temperature penalty (ideal: 50-70F)
        score -= when {
            temperature < 32 -> 30
            temperature < 40 -> 20
            temperature < 50 -> 10
            temperature > 90 -> 25
            temperature > 80 -> 15
            temperature > 70 -> 5
            else -> 0
        }

        // Wind penalty (calm is best)
        score -= when {
            windSpeed > 25 -> 30
            windSpeed > 15 -> 20
            windSpeed > 10 -> 10
            windSpeed > 5 -> 5
            else -> 0
        }

        // Precipitation penalty
        score -= when {
            precipitationProbability > 70 -> 25
            precipitationProbability > 50 -> 15
            precipitationProbability > 30 -> 10
            precipitationProbability > 10 -> 5
            else -> 0
        }

        // Weather code penalty
        score -= when (weatherCode) {
            in 95..99 -> 40  // Thunderstorm
            in 80..82 -> 30  // Rain showers
            in 71..77 -> 25  // Snow
            in 61..67 -> 20  // Rain
            in 51..57 -> 15  // Drizzle
            in 45..48 -> 10  // Fog
            else -> 0
        }

        return score.coerceIn(0, 100)
    }

    companion object {
        fun getWeatherDescription(code: Int): String = when (code) {
            0 -> "Clear sky"
            1 -> "Mainly clear"
            2 -> "Partly cloudy"
            3 -> "Overcast"
            45 -> "Foggy"
            48 -> "Depositing rime fog"
            51 -> "Light drizzle"
            53 -> "Moderate drizzle"
            55 -> "Dense drizzle"
            56 -> "Light freezing drizzle"
            57 -> "Dense freezing drizzle"
            61 -> "Slight rain"
            63 -> "Moderate rain"
            65 -> "Heavy rain"
            66 -> "Light freezing rain"
            67 -> "Heavy freezing rain"
            71 -> "Slight snow fall"
            73 -> "Moderate snow fall"
            75 -> "Heavy snow fall"
            77 -> "Snow grains"
            80 -> "Slight rain showers"
            81 -> "Moderate rain showers"
            82 -> "Violent rain showers"
            85 -> "Slight snow showers"
            86 -> "Heavy snow showers"
            95 -> "Thunderstorm"
            96 -> "Thunderstorm with slight hail"
            99 -> "Thunderstorm with heavy hail"
            else -> "Unknown"
        }

        fun getWeatherIcon(code: Int, isDay: Boolean): String = when (code) {
            0 -> if (isDay) "sunny" else "clear_night"
            1, 2 -> if (isDay) "partly_cloudy" else "partly_cloudy_night"
            3 -> "cloudy"
            45, 48 -> "fog"
            51, 53, 55, 56, 57 -> "drizzle"
            61, 63, 65, 66, 67 -> "rain"
            71, 73, 75, 77, 85, 86 -> "snow"
            80, 81, 82 -> "showers"
            95, 96, 99 -> "thunderstorm"
            else -> "unknown"
        }
    }
}

enum class BirdingRating(val label: String) {
    EXCELLENT("Excellent"),
    GOOD("Good"),
    FAIR("Fair"),
    POOR("Poor")
}
