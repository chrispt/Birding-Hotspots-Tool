package com.birdinghotspots.app.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import timber.log.Timber

/**
 * Secure storage for sensitive data like API keys.
 * Uses Android's EncryptedSharedPreferences with AES-256 encryption.
 */
class SecureStorage(private val context: Context) {

    private val masterKey: MasterKey by lazy {
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
    }

    private val encryptedPrefs: SharedPreferences by lazy {
        try {
            EncryptedSharedPreferences.create(
                context,
                PREFS_FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Timber.e(e, "Failed to create encrypted preferences, falling back to regular prefs")
            // Fallback to regular SharedPreferences if encryption fails
            // This should rarely happen but provides graceful degradation
            context.getSharedPreferences(PREFS_FILE_NAME, Context.MODE_PRIVATE)
        }
    }

    /**
     * Save the eBird API key securely.
     */
    fun saveApiKey(apiKey: String) {
        encryptedPrefs.edit()
            .putString(KEY_EBIRD_API_KEY, apiKey)
            .apply()
        Timber.d("API key saved securely")
    }

    /**
     * Retrieve the saved eBird API key.
     * Returns null if no key is saved.
     */
    fun getApiKey(): String? {
        return encryptedPrefs.getString(KEY_EBIRD_API_KEY, null)
    }

    /**
     * Check if an API key is saved.
     */
    fun hasApiKey(): Boolean {
        return !getApiKey().isNullOrBlank()
    }

    /**
     * Clear the saved API key.
     */
    fun clearApiKey() {
        encryptedPrefs.edit()
            .remove(KEY_EBIRD_API_KEY)
            .apply()
        Timber.d("API key cleared")
    }

    /**
     * Save the "remember API key" preference.
     */
    fun setRememberApiKey(remember: Boolean) {
        encryptedPrefs.edit()
            .putBoolean(KEY_REMEMBER_API_KEY, remember)
            .apply()
    }

    /**
     * Get the "remember API key" preference.
     * Defaults to true.
     */
    fun shouldRememberApiKey(): Boolean {
        return encryptedPrefs.getBoolean(KEY_REMEMBER_API_KEY, true)
    }

    companion object {
        private const val PREFS_FILE_NAME = "birding_hotspots_secure_prefs"
        private const val KEY_EBIRD_API_KEY = "ebird_api_key"
        private const val KEY_REMEMBER_API_KEY = "remember_api_key"
    }
}
