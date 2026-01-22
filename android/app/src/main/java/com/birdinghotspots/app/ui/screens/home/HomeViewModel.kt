package com.birdinghotspots.app.ui.screens.home

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.birdinghotspots.app.data.local.SecureStorage
import com.birdinghotspots.app.data.repository.GeocodingRepository
import com.birdinghotspots.app.ui.state.SearchStateHolder
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import javax.inject.Inject

/**
 * UI state for the Home screen.
 */
data class HomeUiState(
    // API Key
    val apiKey: String = "",
    val showApiKey: Boolean = false,
    val rememberApiKey: Boolean = true,

    // Search type
    val searchType: SearchType = SearchType.LOCATION,

    // Location input
    val inputMode: InputMode = InputMode.ADDRESS,
    val address: String = "",
    val resolvedAddress: String? = null,
    val latitude: String = "",
    val longitude: String = "",
    val isGettingLocation: Boolean = false,
    val locationError: String? = null,

    // Search options
    val searchRadius: SearchRadius = SearchRadius.TWENTY,
    val resultsCount: ResultsCount = ResultsCount.TWENTY,
    val sortBy: SortBy = SortBy.SPECIES,

    // Search state
    val isSearching: Boolean = false,
    val errorMessage: String? = null
) {
    /**
     * Whether the search button should be enabled.
     */
    val isSearchEnabled: Boolean
        get() = apiKey.isNotBlank() &&
                !isSearching &&
                !isGettingLocation &&
                hasValidLocation

    /**
     * Whether we have a valid location to search.
     */
    private val hasValidLocation: Boolean
        get() = when (inputMode) {
            InputMode.ADDRESS -> address.isNotBlank()
            InputMode.GPS -> latitude.isNotBlank() && longitude.isNotBlank() &&
                    latitude.toDoubleOrNull() != null && longitude.toDoubleOrNull() != null
        }
}

/**
 * ViewModel for the Home screen.
 * Handles user input and coordinates search operations.
 */
@HiltViewModel
class HomeViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val secureStorage: SecureStorage,
    private val geocodingRepository: GeocodingRepository,
    private val searchStateHolder: SearchStateHolder
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    init {
        loadSavedPreferences()
    }

    private fun loadSavedPreferences() {
        viewModelScope.launch {
            try {
                // Load saved API key if user opted to remember
                if (secureStorage.shouldRememberApiKey() && secureStorage.hasApiKey()) {
                    val savedApiKey = secureStorage.getApiKey()
                    if (!savedApiKey.isNullOrBlank()) {
                        _uiState.update { it.copy(apiKey = savedApiKey, rememberApiKey = true) }
                        Timber.d("Loaded saved API key")
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to load saved preferences")
            }
        }
    }

    // API Key functions
    fun updateApiKey(apiKey: String) {
        _uiState.update { it.copy(apiKey = apiKey, errorMessage = null) }
    }

    fun toggleShowApiKey() {
        _uiState.update { it.copy(showApiKey = !it.showApiKey) }
    }

    fun updateRememberApiKey(remember: Boolean) {
        _uiState.update { it.copy(rememberApiKey = remember) }
        viewModelScope.launch {
            secureStorage.setRememberApiKey(remember)
            if (!remember) {
                secureStorage.clearApiKey()
            }
        }
    }

    // Search type functions
    fun updateSearchType(type: SearchType) {
        _uiState.update { it.copy(searchType = type, errorMessage = null) }
    }

    // Location input functions
    fun updateInputMode(mode: InputMode) {
        _uiState.update { it.copy(inputMode = mode, errorMessage = null) }
    }

    fun updateAddress(address: String) {
        _uiState.update { it.copy(address = address, resolvedAddress = null, errorMessage = null) }
    }

    fun updateLatitude(latitude: String) {
        _uiState.update { it.copy(latitude = latitude, errorMessage = null) }
    }

    fun updateLongitude(longitude: String) {
        _uiState.update { it.copy(longitude = longitude, errorMessage = null) }
    }

    // Permission is checked in HomeScreen before calling this function
    @SuppressLint("MissingPermission")
    fun getCurrentLocation() {
        viewModelScope.launch {
            _uiState.update { it.copy(isGettingLocation = true, errorMessage = null) }

            try {
                // Get current location
                val cancellationToken = CancellationTokenSource()
                val location: Location? = fusedLocationClient.getCurrentLocation(
                    Priority.PRIORITY_HIGH_ACCURACY,
                    cancellationToken.token
                ).await()

                if (location != null) {
                    // Try to reverse geocode for display
                    val addressResult = geocodingRepository.reverseGeocode(
                        location.latitude,
                        location.longitude
                    )

                    _uiState.update {
                        it.copy(
                            latitude = "%.6f".format(location.latitude),
                            longitude = "%.6f".format(location.longitude),
                            resolvedAddress = addressResult.getOrNull(),
                            inputMode = InputMode.GPS,
                            isGettingLocation = false
                        )
                    }
                    Timber.d("Got location: ${location.latitude}, ${location.longitude}")
                } else {
                    _uiState.update {
                        it.copy(
                            isGettingLocation = false,
                            errorMessage = "Could not get current location"
                        )
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to get current location")
                _uiState.update {
                    it.copy(
                        isGettingLocation = false,
                        errorMessage = "Failed to get location: ${e.message}"
                    )
                }
            }
        }
    }

    /**
     * Called when location permission is denied by the user.
     */
    fun onLocationPermissionDenied() {
        _uiState.update {
            it.copy(
                isGettingLocation = false,
                errorMessage = "Location permission denied. Please enable it in Settings to use your current location."
            )
        }
    }

    // Search options functions
    fun updateSearchRadius(radius: SearchRadius) {
        _uiState.update { it.copy(searchRadius = radius) }
    }

    fun updateResultsCount(count: ResultsCount) {
        _uiState.update { it.copy(resultsCount = count) }
    }

    fun updateSortBy(sortBy: SortBy) {
        _uiState.update { it.copy(sortBy = sortBy) }
    }

    // Search function
    fun performSearch() {
        val currentState = _uiState.value

        if (currentState.apiKey.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Please enter your eBird API key") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSearching = true, errorMessage = null) }

            try {
                // Save API key if remember is enabled
                if (currentState.rememberApiKey) {
                    secureStorage.saveApiKey(currentState.apiKey)
                }

                // Get coordinates
                val lat: Double
                val lng: Double
                var resolvedAddress: String? = currentState.resolvedAddress

                when (currentState.inputMode) {
                    InputMode.ADDRESS -> {
                        // Geocode address
                        val geocodeResult = geocodingRepository.geocode(currentState.address)
                        val location = geocodeResult.getOrNull()
                        if (location == null) {
                            _uiState.update {
                                it.copy(
                                    isSearching = false,
                                    errorMessage = "Could not find address: ${currentState.address}"
                                )
                            }
                            return@launch
                        }
                        lat = location.latitude
                        lng = location.longitude
                        resolvedAddress = location.address

                        // Update UI with resolved address
                        _uiState.update { it.copy(resolvedAddress = resolvedAddress) }
                        Timber.d("Geocoded address to: $lat, $lng")
                    }
                    InputMode.GPS -> {
                        lat = currentState.latitude.toDoubleOrNull() ?: run {
                            _uiState.update {
                                it.copy(isSearching = false, errorMessage = "Invalid latitude")
                            }
                            return@launch
                        }
                        lng = currentState.longitude.toDoubleOrNull() ?: run {
                            _uiState.update {
                                it.copy(isSearching = false, errorMessage = "Invalid longitude")
                            }
                            return@launch
                        }
                    }
                }

                // Store search parameters for ResultsScreen to use
                searchStateHolder.setSearchParams(
                    apiKey = currentState.apiKey,
                    latitude = lat,
                    longitude = lng,
                    radiusKm = currentState.searchRadius.km,
                    maxResults = currentState.resultsCount.count,
                    sortBy = currentState.sortBy,
                    originAddress = resolvedAddress ?: currentState.address
                )

                Timber.d("Search params set: $lat, $lng, radius=${currentState.searchRadius.km}km")
                _uiState.update { it.copy(isSearching = false) }

            } catch (e: Exception) {
                Timber.e(e, "Search setup failed")
                _uiState.update {
                    it.copy(
                        isSearching = false,
                        errorMessage = "Search failed: ${e.message}"
                    )
                }
            }
        }
    }
}
