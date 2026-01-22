package com.birdinghotspots.app.ui.screens.results

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.birdinghotspots.app.data.repository.EBirdRepository
import com.birdinghotspots.app.data.repository.RoutingRepository
import com.birdinghotspots.app.data.repository.WeatherRepository
import com.birdinghotspots.app.data.repository.WeatherSummary
import com.birdinghotspots.app.domain.model.Hotspot
import com.birdinghotspots.app.domain.model.Location
import com.birdinghotspots.app.ui.screens.home.SortBy
import com.birdinghotspots.app.ui.state.SearchStateHolder
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * UI state for the Results screen.
 */
data class ResultsUiState(
    val isLoading: Boolean = true,
    val loadingMessage: String = "Searching for hotspots...",
    val loadingProgress: Float = 0f,
    val hotspots: List<Hotspot> = emptyList(),
    val sortBy: SortBy = SortBy.SPECIES,
    val originAddress: String = "",
    val originLocation: Location? = null,
    val weatherSummary: WeatherSummary? = null,
    val errorMessage: String? = null,
    val expandedHotspotId: String? = null // For expandable cards
)

/**
 * ViewModel for the Results screen.
 * Performs the actual hotspot search and manages results.
 */
@HiltViewModel
class ResultsViewModel @Inject constructor(
    private val searchStateHolder: SearchStateHolder,
    private val eBirdRepository: EBirdRepository,
    private val routingRepository: RoutingRepository,
    private val weatherRepository: WeatherRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ResultsUiState())
    val uiState: StateFlow<ResultsUiState> = _uiState.asStateFlow()

    private var currentApiKey: String = ""
    private var hasSearched: Boolean = false

    init {
        // Check if we have search params waiting
        viewModelScope.launch {
            searchStateHolder.searchParams.collect { params ->
                if (params != null && !hasSearched) {
                    performSearch(params)
                }
            }
        }
    }

    private fun performSearch(params: com.birdinghotspots.app.ui.state.SearchParams) {
        hasSearched = true
        currentApiKey = params.apiKey

        _uiState.update {
            it.copy(
                isLoading = true,
                loadingMessage = "Searching for hotspots...",
                loadingProgress = 0.1f,
                sortBy = params.sortBy,
                originAddress = params.originAddress,
                originLocation = Location(params.latitude, params.longitude, params.originAddress),
                errorMessage = null
            )
        }

        viewModelScope.launch {
            try {
                // Collect hotspots with observations
                eBirdRepository.getNearbyHotspotsWithObservations(
                    apiKey = params.apiKey,
                    lat = params.latitude,
                    lng = params.longitude,
                    distanceKm = params.radiusKm,
                    daysBack = 30,
                    maxHotspots = params.maxResults
                ).collect { result ->
                    result.getOrNull()?.let { hotspots ->
                        val progress = if (hotspots.any { it.observations.isNotEmpty() }) 0.6f else 0.3f

                        _uiState.update {
                            it.copy(
                                hotspots = sortHotspots(hotspots, params.sortBy),
                                loadingMessage = "Loading species data...",
                                loadingProgress = progress
                            )
                        }
                    } ?: run {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = "Failed to load hotspots: ${result.exceptionOrNull()?.message}"
                            )
                        }
                    }
                }

                // After all observations loaded, get driving distances
                _uiState.update {
                    it.copy(loadingMessage = "Calculating driving times...", loadingProgress = 0.7f)
                }

                val currentHotspots = _uiState.value.hotspots
                if (currentHotspots.isNotEmpty()) {
                    enrichWithDrivingDistances(params.latitude, params.longitude, currentHotspots)
                }

                // Get weather summary
                _uiState.update {
                    it.copy(loadingMessage = "Getting weather conditions...", loadingProgress = 0.9f)
                }

                getWeatherSummary(params.latitude, params.longitude)

                // Done loading
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        loadingProgress = 1f,
                        hotspots = sortHotspots(_uiState.value.hotspots, params.sortBy)
                    )
                }

                Timber.d("Search complete: ${_uiState.value.hotspots.size} hotspots")

            } catch (e: Exception) {
                Timber.e(e, "Search failed")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Search failed: ${e.message}"
                    )
                }
            }
        }
    }

    private suspend fun enrichWithDrivingDistances(
        originLat: Double,
        originLng: Double,
        hotspots: List<Hotspot>
    ) {
        try {
            val origin = Location(originLat, originLng)
            val destinations = hotspots.map { Location(it.latitude, it.longitude) }

            val routeResult = routingRepository.getDistancesToMany(origin, destinations)
            routeResult.getOrNull()?.let { routes ->
                val enrichedHotspots = hotspots.mapIndexed { index, hotspot ->
                    val route = routes.getOrNull(index)
                    if (route != null) {
                        hotspot.copy(
                            drivingDistance = route.distanceMiles,
                            drivingDuration = route.durationSeconds
                        )
                    } else {
                        hotspot
                    }
                }

                _uiState.update {
                    it.copy(hotspots = sortHotspots(enrichedHotspots, it.sortBy))
                }
            }
        } catch (e: Exception) {
            Timber.w(e, "Failed to get driving distances")
        }
    }

    private suspend fun getWeatherSummary(lat: Double, lng: Double) {
        try {
            val result = weatherRepository.getWeather(lat, lng)
            result.getOrNull()?.let { weather ->
                _uiState.update {
                    it.copy(
                        weatherSummary = WeatherSummary(
                            averageScore = weather.birdingScore,
                            averageTemperature = weather.temperature,
                            maxWindSpeed = weather.windSpeed,
                            maxPrecipitationProbability = weather.precipitationProbability,
                            overallRating = weather.birdingRating.label,
                            locationCount = 1
                        )
                    )
                }
            }
        } catch (e: Exception) {
            Timber.w(e, "Failed to get weather")
        }
    }

    fun updateSortBy(sortBy: SortBy) {
        _uiState.update {
            it.copy(
                sortBy = sortBy,
                hotspots = sortHotspots(it.hotspots, sortBy)
            )
        }
    }

    fun toggleHotspotExpanded(locId: String) {
        _uiState.update {
            it.copy(
                expandedHotspotId = if (it.expandedHotspotId == locId) null else locId
            )
        }
    }

    private fun sortHotspots(hotspots: List<Hotspot>, sortBy: SortBy): List<Hotspot> {
        return when (sortBy) {
            SortBy.SPECIES -> hotspots.sortedByDescending { it.recentSpeciesCount }
            SortBy.DISTANCE -> hotspots.sortedBy { it.straightLineDistance ?: Double.MAX_VALUE }
            SortBy.DRIVING -> hotspots.sortedBy { it.drivingDuration ?: Long.MAX_VALUE }
        }
    }

    fun retry() {
        hasSearched = false
        searchStateHolder.searchParams.value?.let { params ->
            performSearch(params)
        }
    }
}
