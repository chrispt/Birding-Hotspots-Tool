package com.birdinghotspots.app.ui.navigation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.birdinghotspots.app.ui.screens.home.HomeScreen
import com.birdinghotspots.app.ui.screens.results.ResultsScreen

/**
 * Defines all navigation routes in the app.
 */
sealed class Screen(val route: String) {
    data object Home : Screen("home")
    data object Results : Screen("results")
    data object HotspotDetail : Screen("hotspot/{locId}") {
        fun createRoute(locId: String) = "hotspot/$locId"
    }
    data object SpeciesSearch : Screen("species_search")
    data object SpeciesResults : Screen("species_results/{speciesCode}") {
        fun createRoute(speciesCode: String) = "species_results/$speciesCode"
    }
    data object RoutePlanning : Screen("route_planning")
    data object RouteResults : Screen("route_results")
    data object Itinerary : Screen("itinerary")
    data object FullMap : Screen("full_map")
}

/**
 * Main navigation host for the app.
 * Handles navigation between all screens.
 */
@Composable
fun AppNavigation(
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController()
) {
    NavHost(
        navController = navController,
        startDestination = Screen.Home.route,
        modifier = modifier
    ) {
        // Home screen - main entry point
        composable(Screen.Home.route) {
            HomeScreen(
                onNavigateToResults = {
                    navController.navigate(Screen.Results.route)
                },
                onNavigateToSpeciesSearch = {
                    navController.navigate(Screen.SpeciesSearch.route)
                },
                onNavigateToRoutePlanning = {
                    navController.navigate(Screen.RoutePlanning.route)
                }
            )
        }

        // Results screen - displays hotspot search results
        composable(Screen.Results.route) {
            ResultsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToDetail = { locId ->
                    navController.navigate(Screen.HotspotDetail.createRoute(locId))
                }
            )
        }

        // Hotspot detail screen
        composable(
            route = Screen.HotspotDetail.route,
            arguments = listOf(navArgument("locId") { type = NavType.StringType })
        ) { backStackEntry ->
            val locId = backStackEntry.arguments?.getString("locId") ?: ""
            // TODO: HotspotDetailScreen(locId = locId)
            PlaceholderScreen(
                title = "Hotspot: $locId",
                onBack = { navController.popBackStack() }
            )
        }

        // Species search screen
        composable(Screen.SpeciesSearch.route) {
            // TODO: SpeciesSearchScreen
            PlaceholderScreen(
                title = "Species Search",
                onBack = { navController.popBackStack() }
            )
        }

        // Species results screen
        composable(
            route = Screen.SpeciesResults.route,
            arguments = listOf(navArgument("speciesCode") { type = NavType.StringType })
        ) { backStackEntry ->
            val speciesCode = backStackEntry.arguments?.getString("speciesCode") ?: ""
            // TODO: SpeciesResultsScreen(speciesCode = speciesCode)
            PlaceholderScreen(
                title = "Species: $speciesCode",
                onBack = { navController.popBackStack() }
            )
        }

        // Route planning screen
        composable(Screen.RoutePlanning.route) {
            // TODO: RoutePlanningScreen
            PlaceholderScreen(
                title = "Route Planning",
                onBack = { navController.popBackStack() }
            )
        }

        // Route results screen
        composable(Screen.RouteResults.route) {
            // TODO: RouteResultsScreen
            PlaceholderScreen(
                title = "Route Results",
                onBack = { navController.popBackStack() }
            )
        }

        // Itinerary screen
        composable(Screen.Itinerary.route) {
            // TODO: ItineraryScreen
            PlaceholderScreen(
                title = "Itinerary",
                onBack = { navController.popBackStack() }
            )
        }

        // Full map screen
        composable(Screen.FullMap.route) {
            // TODO: FullMapScreen
            PlaceholderScreen(
                title = "Map",
                onBack = { navController.popBackStack() }
            )
        }
    }
}

/**
 * Placeholder screen for screens that haven't been implemented yet.
 */
@Composable
private fun PlaceholderScreen(
    title: String,
    onBack: () -> Unit
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineMedium
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onBack) {
                Text("Back")
            }
        }
    }
}
