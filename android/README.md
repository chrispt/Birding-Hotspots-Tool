# Birding Hotspots - Android App

Native Android version of the Birding Hotspots Tool.

## Setup

### Prerequisites
1. Install [Android Studio](https://developer.android.com/studio) (latest stable version)
2. During installation, accept the default SDK components

### Opening the Project
1. Open Android Studio
2. Select "Open" (not "New Project")
3. Navigate to this `android` folder and select it
4. Wait for Gradle sync to complete (may take a few minutes on first run)

### First Run
1. Connect an Android phone via USB with Developer Mode enabled, OR
2. Create an emulator: Tools > Device Manager > Create Device
3. Click the green "Run" button (or Shift+F10)

### App Icons
The app needs launcher icons. To add them:
1. Right-click `app/src/main/res` > New > Image Asset
2. Select "Launcher Icons (Adaptive and Legacy)"
3. Use a bird-related image or the forest green color (#2E7D32)

## Project Structure

```
app/src/main/java/com/birdinghotspots/app/
├── BirdingHotspotsApp.kt    # Application class (Hilt)
├── MainActivity.kt           # Single activity
├── data/
│   ├── api/                  # Retrofit API interfaces
│   ├── local/                # SecureStorage, Room (TBD)
│   └── model/                # API response models
├── di/                       # Hilt dependency injection modules
└── ui/
    ├── navigation/           # Navigation routes
    ├── screens/              # Screen composables + ViewModels
    └── theme/                # Material 3 theme
```

## Current Status

### Completed
- [x] Project structure and Gradle configuration
- [x] Hilt dependency injection
- [x] Retrofit API clients (eBird, LocationIQ, OSRM, Open-Meteo)
- [x] Data models for all API responses
- [x] SecureStorage for encrypted API key
- [x] Material 3 theme (forest green)
- [x] Navigation structure
- [x] Home screen UI

### In Progress
- [ ] Room database for favorites and taxonomy cache
- [ ] Repository layer
- [ ] Location services integration
- [ ] Results screen
- [ ] Hotspot detail screen

### Pending
- [ ] Species search with autocomplete
- [ ] Route planning
- [ ] Itinerary builder
- [ ] PDF export
- [ ] GPX export

## Build APK

To create a release APK for sideloading:

```bash
# From the android folder
./gradlew assembleRelease

# APK will be at: app/build/outputs/apk/release/app-release-unsigned.apk
```

For a signed APK (for personal use, you can use a debug key):
```bash
./gradlew assembleDebug
# APK at: app/build/outputs/apk/debug/app-debug.apk
```

## Transfer APK to Phone
1. Copy APK via USB file transfer
2. On phone: Enable "Install from Unknown Sources" in Settings
3. Open the APK file to install

## API Keys

- **eBird API**: Users must provide their own key from https://ebird.org/api/keygen
- **LocationIQ**: Built-in key (same as web app, rate-limited)
- **OSRM**: No key required
- **Open-Meteo**: No key required
