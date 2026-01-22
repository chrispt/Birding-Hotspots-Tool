package com.birdinghotspots.app.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColorScheme = lightColorScheme(
    primary = GreenPrimary,
    onPrimary = SurfaceLight,
    primaryContainer = GreenPrimaryContainer,
    onPrimaryContainer = OnGreenPrimaryContainer,
    secondary = TealSecondary,
    onSecondary = SurfaceLight,
    secondaryContainer = TealSecondaryContainer,
    onSecondaryContainer = OnTealSecondaryContainer,
    tertiary = OrangeTertiary,
    onTertiary = SurfaceLight,
    tertiaryContainer = OrangeTertiaryContainer,
    onTertiaryContainer = OnBackgroundLight,
    error = ErrorColor,
    onError = OnErrorColor,
    errorContainer = ErrorContainerLight,
    onErrorContainer = OnErrorContainerLight,
    background = BackgroundLight,
    onBackground = OnBackgroundLight,
    surface = SurfaceLight,
    onSurface = OnSurfaceLight,
    surfaceVariant = SurfaceVariantLight,
    onSurfaceVariant = OnSurfaceVariantLight
)

private val DarkColorScheme = darkColorScheme(
    primary = GreenPrimaryLight,
    onPrimary = GreenPrimaryDark,
    primaryContainer = GreenPrimary,
    onPrimaryContainer = GreenPrimaryContainer,
    secondary = TealSecondaryLight,
    onSecondary = OnTealSecondaryContainer,
    secondaryContainer = TealSecondary,
    onSecondaryContainer = TealSecondaryContainer,
    tertiary = OrangeTertiary,
    onTertiary = SurfaceDark,
    tertiaryContainer = OrangeTertiary,
    onTertiaryContainer = OrangeTertiaryContainer,
    error = ErrorColor,
    onError = OnErrorColor,
    background = BackgroundDark,
    onBackground = OnBackgroundDark,
    surface = SurfaceDark,
    onSurface = OnSurfaceDark,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = OnSurfaceVariantDark
)

/**
 * Main theme composable for Birding Hotspots app.
 *
 * @param darkTheme Whether to use dark theme. Defaults to system setting.
 * @param dynamicColor Whether to use Android 12+ dynamic colors. Defaults to false
 *                     to maintain the consistent forest green branding.
 * @param content The content to display with this theme applied.
 */
@Composable
fun BirdingHotspotsTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // Dynamic color is available on Android 12+
    // Set to false by default to keep our forest green branding consistent
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.primary.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
