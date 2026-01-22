@file:OptIn(ExperimentalMaterial3Api::class)

package com.birdinghotspots.app.ui.screens.home

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.PermissionChecker
import androidx.hilt.navigation.compose.hiltViewModel
import com.birdinghotspots.app.R

/**
 * Home screen - main entry point for the app.
 * Contains API key input, location search, and search options.
 */
@Composable
fun HomeScreen(
    onNavigateToResults: () -> Unit,
    onNavigateToSpeciesSearch: () -> Unit,
    onNavigateToRoutePlanning: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    // Permission launcher for location
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true
        val coarseLocationGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true

        if (fineLocationGranted || coarseLocationGranted) {
            // Permission granted, get location
            viewModel.getCurrentLocation()
        } else {
            // Permission denied
            viewModel.onLocationPermissionDenied()
        }
    }

    // Function to request location with permission check
    val requestLocationWithPermission: () -> Unit = {
        val fineLocationPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        )
        val coarseLocationPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )

        if (fineLocationPermission == PermissionChecker.PERMISSION_GRANTED ||
            coarseLocationPermission == PermissionChecker.PERMISSION_GRANTED
        ) {
            // Already have permission
            viewModel.getCurrentLocation()
        } else {
            // Request permission
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // App header
            AppHeader()

            Spacer(modifier = Modifier.height(16.dp))

            // API Key section
            ApiKeySection(
                apiKey = uiState.apiKey,
                onApiKeyChange = viewModel::updateApiKey,
                showApiKey = uiState.showApiKey,
                onToggleShowApiKey = viewModel::toggleShowApiKey,
                rememberApiKey = uiState.rememberApiKey,
                onRememberApiKeyChange = viewModel::updateRememberApiKey
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Search type toggle (Location Search / Route Planning)
            SearchTypeToggle(
                selectedType = uiState.searchType,
                onTypeSelected = viewModel::updateSearchType
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Location input section
            LocationInputSection(
                inputMode = uiState.inputMode,
                onInputModeChange = viewModel::updateInputMode,
                address = uiState.address,
                onAddressChange = viewModel::updateAddress,
                latitude = uiState.latitude,
                onLatitudeChange = viewModel::updateLatitude,
                longitude = uiState.longitude,
                onLongitudeChange = viewModel::updateLongitude,
                onCurrentLocationClick = requestLocationWithPermission,
                isGettingLocation = uiState.isGettingLocation
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Search options (radius, count, sort)
            SearchOptionsSection(
                searchRadius = uiState.searchRadius,
                onSearchRadiusChange = viewModel::updateSearchRadius,
                resultsCount = uiState.resultsCount,
                onResultsCountChange = viewModel::updateResultsCount,
                sortBy = uiState.sortBy,
                onSortByChange = viewModel::updateSortBy
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Search button
            Button(
                onClick = {
                    viewModel.performSearch()
                    onNavigateToResults()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                enabled = uiState.isSearchEnabled
            ) {
                if (uiState.isSearching) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = null,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text(
                        text = stringResource(R.string.find_hotspots),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }

            // Error message
            uiState.errorMessage?.let { error ->
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

@Composable
private fun AppHeader() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Birding Hotspots",
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.primary
        )
        Text(
            text = "Find the best birding spots near you",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun ApiKeySection(
    apiKey: String,
    onApiKeyChange: (String) -> Unit,
    showApiKey: Boolean,
    onToggleShowApiKey: () -> Unit,
    rememberApiKey: Boolean,
    onRememberApiKeyChange: (Boolean) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = stringResource(R.string.api_key_label),
                style = MaterialTheme.typography.titleSmall
            )

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedTextField(
                value = apiKey,
                onValueChange = onApiKeyChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text(stringResource(R.string.api_key_hint)) },
                visualTransformation = if (showApiKey) {
                    VisualTransformation.None
                } else {
                    PasswordVisualTransformation()
                },
                singleLine = true
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = stringResource(R.string.api_key_help),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun SearchTypeToggle(
    selectedType: SearchType,
    onTypeSelected: (SearchType) -> Unit
) {
    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
        SegmentedButton(
            selected = selectedType == SearchType.LOCATION,
            onClick = { onTypeSelected(SearchType.LOCATION) },
            shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2)
        ) {
            Text(stringResource(R.string.location_search))
        }
        SegmentedButton(
            selected = selectedType == SearchType.ROUTE,
            onClick = { onTypeSelected(SearchType.ROUTE) },
            shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2)
        ) {
            Text(stringResource(R.string.route_planning))
        }
    }
}

@Composable
private fun LocationInputSection(
    inputMode: InputMode,
    onInputModeChange: (InputMode) -> Unit,
    address: String,
    onAddressChange: (String) -> Unit,
    latitude: String,
    onLatitudeChange: (String) -> Unit,
    longitude: String,
    onLongitudeChange: (String) -> Unit,
    onCurrentLocationClick: () -> Unit,
    isGettingLocation: Boolean
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Input mode toggle (Address / GPS)
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                SegmentedButton(
                    selected = inputMode == InputMode.ADDRESS,
                    onClick = { onInputModeChange(InputMode.ADDRESS) },
                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2)
                ) {
                    Text(stringResource(R.string.address_input))
                }
                SegmentedButton(
                    selected = inputMode == InputMode.GPS,
                    onClick = { onInputModeChange(InputMode.GPS) },
                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2)
                ) {
                    Text(stringResource(R.string.gps_input))
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            when (inputMode) {
                InputMode.ADDRESS -> {
                    OutlinedTextField(
                        value = address,
                        onValueChange = onAddressChange,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(stringResource(R.string.address_input)) },
                        placeholder = { Text(stringResource(R.string.address_hint)) },
                        singleLine = true
                    )
                }

                InputMode.GPS -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = latitude,
                            onValueChange = onLatitudeChange,
                            modifier = Modifier.weight(1f),
                            label = { Text(stringResource(R.string.latitude)) },
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = longitude,
                            onValueChange = onLongitudeChange,
                            modifier = Modifier.weight(1f),
                            label = { Text(stringResource(R.string.longitude)) },
                            singleLine = true
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Current location button
            Button(
                onClick = onCurrentLocationClick,
                enabled = !isGettingLocation,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (isGettingLocation) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.MyLocation,
                        contentDescription = null,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text(stringResource(R.string.current_location))
                }
            }
        }
    }
}

@Composable
private fun SearchOptionsSection(
    searchRadius: SearchRadius,
    onSearchRadiusChange: (SearchRadius) -> Unit,
    resultsCount: ResultsCount,
    onResultsCountChange: (ResultsCount) -> Unit,
    sortBy: SortBy,
    onSortByChange: (SortBy) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Search radius
            Text(
                text = stringResource(R.string.search_radius),
                style = MaterialTheme.typography.titleSmall
            )
            Spacer(modifier = Modifier.height(8.dp))
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                SearchRadius.entries.forEachIndexed { index, radius ->
                    SegmentedButton(
                        selected = searchRadius == radius,
                        onClick = { onSearchRadiusChange(radius) },
                        shape = SegmentedButtonDefaults.itemShape(
                            index = index,
                            count = SearchRadius.entries.size
                        )
                    ) {
                        Text("${radius.miles} mi")
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Results count
            Text(
                text = stringResource(R.string.results_count),
                style = MaterialTheme.typography.titleSmall
            )
            Spacer(modifier = Modifier.height(8.dp))
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                ResultsCount.entries.forEachIndexed { index, count ->
                    SegmentedButton(
                        selected = resultsCount == count,
                        onClick = { onResultsCountChange(count) },
                        shape = SegmentedButtonDefaults.itemShape(
                            index = index,
                            count = ResultsCount.entries.size
                        )
                    ) {
                        Text("${count.count}")
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Sort by
            Text(
                text = stringResource(R.string.sort_by),
                style = MaterialTheme.typography.titleSmall
            )
            Spacer(modifier = Modifier.height(8.dp))
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                SortBy.entries.forEachIndexed { index, sort ->
                    SegmentedButton(
                        selected = sortBy == sort,
                        onClick = { onSortByChange(sort) },
                        shape = SegmentedButtonDefaults.itemShape(
                            index = index,
                            count = SortBy.entries.size
                        )
                    ) {
                        Text(sort.label)
                    }
                }
            }
        }
    }
}

// Enums for UI state
enum class SearchType {
    LOCATION,
    ROUTE
}

enum class InputMode {
    ADDRESS,
    GPS
}

enum class SearchRadius(val miles: Int, val km: Int) {
    TEN(10, 16),
    TWENTY(20, 32),
    THIRTY_ONE(31, 50)
}

enum class ResultsCount(val count: Int) {
    TEN(10),
    TWENTY(20),
    THIRTY(30)
}

enum class SortBy(val label: String) {
    SPECIES("Species"),
    DISTANCE("Distance"),
    DRIVING("Drive Time")
}
