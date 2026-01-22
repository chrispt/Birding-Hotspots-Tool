package com.birdinghotspots.app.ui.state

import com.birdinghotspots.app.ui.screens.home.SortBy
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Holds search parameters between HomeScreen and ResultsScreen.
 * This allows the search to be initiated from HomeScreen but
 * executed in ResultsViewModel when the screen is displayed.
 */
@Singleton
class SearchStateHolder @Inject constructor() {

    private val _searchParams = MutableStateFlow<SearchParams?>(null)
    val searchParams: StateFlow<SearchParams?> = _searchParams.asStateFlow()

    /**
     * Set search parameters (called from HomeViewModel).
     */
    fun setSearchParams(
        apiKey: String,
        latitude: Double,
        longitude: Double,
        radiusKm: Int,
        maxResults: Int,
        sortBy: SortBy,
        originAddress: String
    ) {
        _searchParams.value = SearchParams(
            apiKey = apiKey,
            latitude = latitude,
            longitude = longitude,
            radiusKm = radiusKm,
            maxResults = maxResults,
            sortBy = sortBy,
            originAddress = originAddress,
            timestamp = System.currentTimeMillis()
        )
    }

    /**
     * Get current search params (and optionally clear them).
     */
    fun consumeSearchParams(): SearchParams? {
        val params = _searchParams.value
        _searchParams.value = null
        return params
    }

    /**
     * Clear search params.
     */
    fun clear() {
        _searchParams.value = null
    }
}

/**
 * Search parameters data class.
 */
data class SearchParams(
    val apiKey: String,
    val latitude: Double,
    val longitude: Double,
    val radiusKm: Int,
    val maxResults: Int,
    val sortBy: SortBy,
    val originAddress: String,
    val timestamp: Long = System.currentTimeMillis()
)
