package com.birdinghotspots.app.di

import android.content.Context
import androidx.room.Room
import com.birdinghotspots.app.data.local.AppDatabase
import com.birdinghotspots.app.data.local.dao.FavoriteDao
import com.birdinghotspots.app.data.local.dao.TaxonomyDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt module providing database-related dependencies.
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    /**
     * Provides the Room database instance.
     */
    @Provides
    @Singleton
    fun provideAppDatabase(
        @ApplicationContext context: Context
    ): AppDatabase {
        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            AppDatabase.DATABASE_NAME
        )
            .fallbackToDestructiveMigration() // OK for cache data
            .build()
    }

    /**
     * Provides the FavoriteDao.
     */
    @Provides
    @Singleton
    fun provideFavoriteDao(database: AppDatabase): FavoriteDao {
        return database.favoriteDao()
    }

    /**
     * Provides the TaxonomyDao.
     */
    @Provides
    @Singleton
    fun provideTaxonomyDao(database: AppDatabase): TaxonomyDao {
        return database.taxonomyDao()
    }
}
