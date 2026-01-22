# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep Moshi JSON adapters
-keepclassmembers class * {
    @com.squareup.moshi.Json <fields>;
}
-keep class com.squareup.moshi.** { *; }

# Keep Retrofit interfaces
-keepattributes Signature
-keepattributes *Annotation*

# Keep Room entities
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Timber
-dontwarn timber.log.Timber

# osmdroid
-keep class org.osmdroid.** { *; }
-dontwarn org.osmdroid.**
