package com.birdinghotspots.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import com.birdinghotspots.app.ui.navigation.AppNavigation
import com.birdinghotspots.app.ui.theme.BirdingHotspotsTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * Main entry point for the Birding Hotspots app.
 * Uses Jetpack Compose for the UI and Hilt for dependency injection.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            BirdingHotspotsTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    AppNavigation(
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }
    }
}
