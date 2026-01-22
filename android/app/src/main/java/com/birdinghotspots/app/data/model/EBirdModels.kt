package com.birdinghotspots.app.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * eBird hotspot response.
 */
@JsonClass(generateAdapter = true)
data class HotspotResponse(
    @Json(name = "locId") val locId: String,
    @Json(name = "locName") val locName: String,
    @Json(name = "countryCode") val countryCode: String?,
    @Json(name = "subnational1Code") val subnational1Code: String?,
    @Json(name = "subnational2Code") val subnational2Code: String?,
    @Json(name = "lat") val lat: Double,
    @Json(name = "lng") val lng: Double,
    @Json(name = "numSpeciesAllTime") val numSpeciesAllTime: Int?
)

/**
 * eBird observation response.
 */
@JsonClass(generateAdapter = true)
data class ObservationResponse(
    @Json(name = "speciesCode") val speciesCode: String,
    @Json(name = "comName") val comName: String,
    @Json(name = "sciName") val sciName: String,
    @Json(name = "locId") val locId: String,
    @Json(name = "locName") val locName: String,
    @Json(name = "obsDt") val obsDt: String,
    @Json(name = "howMany") val howMany: Int?,
    @Json(name = "lat") val lat: Double,
    @Json(name = "lng") val lng: Double,
    @Json(name = "obsValid") val obsValid: Boolean?,
    @Json(name = "obsReviewed") val obsReviewed: Boolean?,
    @Json(name = "locationPrivate") val locationPrivate: Boolean?
)

/**
 * eBird taxonomy response (species list).
 */
@JsonClass(generateAdapter = true)
data class TaxonomyResponse(
    @Json(name = "speciesCode") val speciesCode: String,
    @Json(name = "comName") val comName: String,
    @Json(name = "sciName") val sciName: String,
    @Json(name = "familyComName") val familyComName: String?,
    @Json(name = "familySciName") val familySciName: String?,
    @Json(name = "order") val order: String?,
    @Json(name = "category") val category: String?
)
