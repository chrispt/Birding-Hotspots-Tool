@file:OptIn(ExperimentalMaterial3Api::class)

package com.birdinghotspots.app.ui.screens.results

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.birdinghotspots.app.domain.model.Hotspot
import com.birdinghotspots.app.domain.model.Observation
import com.birdinghotspots.app.ui.screens.home.SortBy

/**
 * Results screen showing hotspot search results.
 */
@Composable
fun ResultsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToDetail: (String) -> Unit,
    viewModel: ResultsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Birding Hotspots")
                        if (uiState.originAddress.isNotBlank()) {
                            Text(
                                text = uiState.originAddress,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                uiState.isLoading -> {
                    LoadingContent(
                        message = uiState.loadingMessage,
                        progress = uiState.loadingProgress
                    )
                }
                uiState.errorMessage != null -> {
                    ErrorContent(
                        message = uiState.errorMessage!!,
                        onRetry = viewModel::retry
                    )
                }
                uiState.hotspots.isEmpty() -> {
                    EmptyContent()
                }
                else -> {
                    ResultsContent(
                        uiState = uiState,
                        onSortByChange = viewModel::updateSortBy,
                        onHotspotClick = { viewModel.toggleHotspotExpanded(it.locId) },
                        onHotspotDetailClick = onNavigateToDetail,
                        expandedHotspotId = uiState.expandedHotspotId
                    )
                }
            }
        }
    }
}

@Composable
private fun LoadingContent(message: String, progress: Float) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(48.dp),
            color = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium
        )
        Spacer(modifier = Modifier.height(8.dp))
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
                .width(200.dp)
                .padding(horizontal = 16.dp)
        )
    }
}

@Composable
private fun ErrorContent(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Error",
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onRetry) {
            Text("Retry")
        }
    }
}

@Composable
private fun EmptyContent() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.LocationOn,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "No hotspots found",
            style = MaterialTheme.typography.headlineSmall
        )
        Text(
            text = "Try increasing the search radius or searching in a different area",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun ResultsContent(
    uiState: ResultsUiState,
    onSortByChange: (SortBy) -> Unit,
    onHotspotClick: (Hotspot) -> Unit,
    onHotspotDetailClick: (String) -> Unit,
    expandedHotspotId: String?
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Weather summary
        uiState.weatherSummary?.let { weather ->
            item {
                WeatherSummaryCard(weather)
            }
        }

        // Sort controls
        item {
            SortControls(
                currentSort = uiState.sortBy,
                onSortChange = onSortByChange,
                resultCount = uiState.hotspots.size
            )
        }

        // Hotspot cards
        itemsIndexed(
            items = uiState.hotspots,
            key = { _, hotspot -> hotspot.locId }
        ) { index, hotspot ->
            HotspotCard(
                hotspot = hotspot,
                index = index + 1,
                isExpanded = expandedHotspotId == hotspot.locId,
                onClick = { onHotspotClick(hotspot) },
                onDetailClick = { onHotspotDetailClick(hotspot.locId) }
            )
        }
    }
}

@Composable
private fun WeatherSummaryCard(weather: com.birdinghotspots.app.data.repository.WeatherSummary) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Birding Conditions",
                    style = MaterialTheme.typography.labelMedium
                )
                Text(
                    text = weather.overallRating,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            }
            Text(
                text = weather.formattedTemperature,
                style = MaterialTheme.typography.titleLarge
            )
        }
    }
}

@Composable
private fun SortControls(
    currentSort: SortBy,
    onSortChange: (SortBy) -> Unit,
    resultCount: Int
) {
    Column {
        Text(
            text = "$resultCount hotspots found",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(8.dp))
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            SortBy.entries.forEachIndexed { index, sortBy ->
                SegmentedButton(
                    selected = currentSort == sortBy,
                    onClick = { onSortChange(sortBy) },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = SortBy.entries.size)
                ) {
                    Text(sortBy.label)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HotspotCard(
    hotspot: Hotspot,
    index: Int,
    isExpanded: Boolean,
    onClick: () -> Unit,
    onDetailClick: () -> Unit
) {
    val context = LocalContext.current

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    // Index badge
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "$index",
                            color = MaterialTheme.colorScheme.onPrimary,
                            style = MaterialTheme.typography.labelMedium
                        )
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = hotspot.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (hotspot.hasNotableSpecies) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.Star,
                                    contentDescription = "Notable species",
                                    modifier = Modifier.size(14.dp),
                                    tint = Color(0xFFFF9800) // Orange
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = "Notable species reported",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color(0xFFFF9800)
                                )
                            }
                        }
                    }
                }

                // Expand icon
                Icon(
                    imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (isExpanded) "Collapse" else "Expand"
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Stats row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                StatItem(
                    label = "Species",
                    value = "${hotspot.recentSpeciesCount}",
                    icon = Icons.Default.Star
                )
                StatItem(
                    label = "Distance",
                    value = hotspot.formattedDistance ?: "—",
                    icon = Icons.Default.LocationOn
                )
                StatItem(
                    label = "Drive",
                    value = hotspot.formattedDrivingTime ?: "—",
                    icon = Icons.Default.DirectionsCar
                )
            }

            // Expanded content
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Column(modifier = Modifier.padding(top = 12.dp)) {
                    // Address
                    hotspot.address?.let { address ->
                        Text(
                            text = address,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                    }

                    // Species list
                    if (hotspot.uniqueSpecies.isNotEmpty()) {
                        Text(
                            text = "Recent Species (${hotspot.uniqueSpecies.size})",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            hotspot.uniqueSpecies.take(15).forEach { obs ->
                                SpeciesChip(observation = obs)
                            }
                            if (hotspot.uniqueSpecies.size > 15) {
                                Text(
                                    text = "+${hotspot.uniqueSpecies.size - 15} more",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(start = 8.dp, top = 4.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    // Action buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        AssistChip(
                            onClick = {
                                val uri = Uri.parse(
                                    "google.navigation:q=${hotspot.latitude},${hotspot.longitude}"
                                )
                                context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                            },
                            label = { Text("Directions") },
                            leadingIcon = {
                                Icon(
                                    Icons.Default.Map,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        )
                        AssistChip(
                            onClick = {
                                val uri = Uri.parse(
                                    "https://ebird.org/hotspot/${hotspot.locId}"
                                )
                                context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                            },
                            label = { Text("eBird") }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatItem(
    label: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun SpeciesChip(observation: Observation) {
    Surface(
        shape = RoundedCornerShape(4.dp),
        color = if (observation.isNotable) {
            Color(0xFFFFF3E0) // Light orange for notable
        } else {
            MaterialTheme.colorScheme.surfaceVariant
        }
    ) {
        Text(
            text = observation.commonName,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            color = if (observation.isNotable) {
                Color(0xFFE65100) // Dark orange
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            }
        )
    }
}
