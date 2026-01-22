package com.birdinghotspots.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber

/**
 * Application class for Birding Hotspots.
 * Annotated with @HiltAndroidApp to enable Hilt dependency injection.
 */
@HiltAndroidApp
class BirdingHotspotsApp : Application() {

    override fun onCreate() {
        super.onCreate()

        // Initialize Timber for logging (debug builds only)
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }

        Timber.d("BirdingHotspotsApp initialized")
    }
}
