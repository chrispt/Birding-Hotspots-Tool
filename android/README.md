# Birding Hotspots - Android App

A WebView wrapper for the Birding Hotspots Tool website.

## Features

- Loads https://www.birdinghotspotstool.com in a fullscreen WebView
- Supports geolocation for "Use My Location" feature
- Handles file downloads (PDF reports, GPX files)
- Opens external links (Google Maps, eBird) in browser
- Back button navigates within the app

## Building

1. Open the `android` folder in Android Studio
2. Sync Gradle files
3. Run on device or emulator (API 24+)

## Requirements

- Android Studio Hedgehog (2023.1.1) or newer
- JDK 17
- Android SDK 34
- Min SDK: 24 (Android 7.0)

## Signing for Release

Create a keystore and configure in `app/build.gradle.kts`:

```kotlin
signingConfigs {
    create("release") {
        storeFile = file("your-keystore.jks")
        storePassword = "your-password"
        keyAlias = "your-alias"
        keyPassword = "your-key-password"
    }
}
```
