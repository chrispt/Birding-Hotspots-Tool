package com.birdinghotspots.app.data.api

import com.birdinghotspots.app.data.model.WeatherResponse
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Open-Meteo Weather API interface.
 * Documentation: https://open-meteo.com/en/docs
 * Free, no API key required.
 */
interface WeatherApi {

    /**
     * Get current weather and forecast.
     *
     * @param latitude Latitude
     * @param longitude Longitude
     * @param current Current weather variables to include
     * @param temperatureUnit Temperature unit (celsius, fahrenheit)
     * @param windSpeedUnit Wind speed unit (kmh, mph, ms, kn)
     * @param timezone Timezone for times (auto = detect from coordinates)
     */
    @GET("forecast")
    suspend fun getWeather(
        @Query("latitude") latitude: Double,
        @Query("longitude") longitude: Double,
        @Query("current") current: String = "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m",
        @Query("temperature_unit") temperatureUnit: String = "fahrenheit",
        @Query("wind_speed_unit") windSpeedUnit: String = "mph",
        @Query("timezone") timezone: String = "auto"
    ): WeatherResponse
}
