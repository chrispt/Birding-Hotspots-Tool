package com.birdinghotspots.app.data.model

import com.squareup.moshi.Json

/**
 * LocationIQ forward geocoding response.
 */
data class GeocodingResponse(
    @Json(name = "place_id") val placeId: String,
    @Json(name = "licence") val licence: String?,
    @Json(name = "lat") val lat: String,
    @Json(name = "lon") val lon: String,
    @Json(name = "display_name") val displayName: String,
    @Json(name = "type") val type: String?,
    @Json(name = "importance") val importance: Double?,
    @Json(name = "address") val address: Address?
)

/**
 * LocationIQ reverse geocoding response.
 */
data class ReverseGeocodingResponse(
    @Json(name = "place_id") val placeId: String,
    @Json(name = "licence") val licence: String?,
    @Json(name = "lat") val lat: String,
    @Json(name = "lon") val lon: String,
    @Json(name = "display_name") val displayName: String,
    @Json(name = "address") val address: Address?
)

/**
 * Address details from LocationIQ.
 */
data class Address(
    @Json(name = "house_number") val houseNumber: String?,
    @Json(name = "road") val road: String?,
    @Json(name = "neighbourhood") val neighbourhood: String?,
    @Json(name = "suburb") val suburb: String?,
    @Json(name = "city") val city: String?,
    @Json(name = "town") val town: String?,
    @Json(name = "village") val village: String?,
    @Json(name = "county") val county: String?,
    @Json(name = "state") val state: String?,
    @Json(name = "postcode") val postcode: String?,
    @Json(name = "country") val country: String?,
    @Json(name = "country_code") val countryCode: String?
) {
    /**
     * Get a readable city/town name.
     */
    fun getCityName(): String? = city ?: town ?: village ?: suburb
}
