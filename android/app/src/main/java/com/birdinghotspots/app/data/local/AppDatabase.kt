package com.birdinghotspots.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.birdinghotspots.app.data.local.dao.FavoriteDao
import com.birdinghotspots.app.data.local.dao.TaxonomyDao
import com.birdinghotspots.app.data.local.entity.FavoriteEntity
import com.birdinghotspots.app.data.local.entity.TaxonomyEntity

/**
 * Room database for the Birding Hotspots app.
 *
 * Contains:
 * - favorites: Saved locations for quick access
 * - taxonomy: Cached eBird species list (expires after 7 days)
 */
@Database(
    entities = [
        FavoriteEntity::class,
        TaxonomyEntity::class
    ],
    version = 1,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun favoriteDao(): FavoriteDao
    abstract fun taxonomyDao(): TaxonomyDao

    companion object {
        const val DATABASE_NAME = "birding_hotspots_db"
    }
}
