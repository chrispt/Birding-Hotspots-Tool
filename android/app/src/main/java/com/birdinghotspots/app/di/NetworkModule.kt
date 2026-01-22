package com.birdinghotspots.app.di

import com.birdinghotspots.app.data.api.EBirdApi
import com.birdinghotspots.app.data.api.GeocodingApi
import com.birdinghotspots.app.data.api.RoutingApi
import com.birdinghotspots.app.data.api.WeatherApi
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

/**
 * Hilt module providing network-related dependencies.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    private const val EBIRD_BASE_URL = "https://api.ebird.org/v2/"
    private const val LOCATIONIQ_BASE_URL = "https://us1.locationiq.com/v1/"
    private const val OSRM_BASE_URL = "https://router.project-osrm.org/"
    private const val WEATHER_BASE_URL = "https://api.open-meteo.com/v1/"

    /**
     * Provides Moshi instance for JSON parsing.
     */
    @Provides
    @Singleton
    fun provideMoshi(): Moshi {
        return Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()
    }

    /**
     * Provides OkHttpClient with logging and timeouts.
     */
    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        return OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    /**
     * Provides Retrofit instance for eBird API.
     */
    @Provides
    @Singleton
    @Named("ebird")
    fun provideEBirdRetrofit(okHttpClient: OkHttpClient, moshi: Moshi): Retrofit {
        return Retrofit.Builder()
            .baseUrl(EBIRD_BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
    }

    /**
     * Provides eBird API interface.
     */
    @Provides
    @Singleton
    fun provideEBirdApi(@Named("ebird") retrofit: Retrofit): EBirdApi {
        return retrofit.create(EBirdApi::class.java)
    }

    /**
     * Provides Retrofit instance for LocationIQ geocoding API.
     */
    @Provides
    @Singleton
    @Named("geocoding")
    fun provideGeocodingRetrofit(okHttpClient: OkHttpClient, moshi: Moshi): Retrofit {
        return Retrofit.Builder()
            .baseUrl(LOCATIONIQ_BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
    }

    /**
     * Provides LocationIQ geocoding API interface.
     */
    @Provides
    @Singleton
    fun provideGeocodingApi(@Named("geocoding") retrofit: Retrofit): GeocodingApi {
        return retrofit.create(GeocodingApi::class.java)
    }

    /**
     * Provides Retrofit instance for OSRM routing API.
     */
    @Provides
    @Singleton
    @Named("routing")
    fun provideRoutingRetrofit(okHttpClient: OkHttpClient, moshi: Moshi): Retrofit {
        return Retrofit.Builder()
            .baseUrl(OSRM_BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
    }

    /**
     * Provides OSRM routing API interface.
     */
    @Provides
    @Singleton
    fun provideRoutingApi(@Named("routing") retrofit: Retrofit): RoutingApi {
        return retrofit.create(RoutingApi::class.java)
    }

    /**
     * Provides Retrofit instance for Open-Meteo weather API.
     */
    @Provides
    @Singleton
    @Named("weather")
    fun provideWeatherRetrofit(okHttpClient: OkHttpClient, moshi: Moshi): Retrofit {
        return Retrofit.Builder()
            .baseUrl(WEATHER_BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
    }

    /**
     * Provides Open-Meteo weather API interface.
     */
    @Provides
    @Singleton
    fun provideWeatherApi(@Named("weather") retrofit: Retrofit): WeatherApi {
        return retrofit.create(WeatherApi::class.java)
    }
}
