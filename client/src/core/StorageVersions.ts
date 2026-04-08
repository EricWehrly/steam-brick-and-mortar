/**
 * StorageVersions
 *
 * Central registry of schema version constants for all persistent storage.
 *
 * Format: YYYYMMDD integer. Increment the date when the schema for that store
 * changes in a breaking way. Consumers decide policy (blow away vs migrate):
 * - Caches (pixel data, artwork URLs): blow away on mismatch — data is re-fetchable.
 * - Settings (AppSettings, GameSettings): attempt migration or reset to defaults.
 *
 * Do NOT use floating point or semver here — IDB requires a positive integer,
 * and we want a single format across all stores.
 */

export const StorageVersions = {
    /** IndexedDB pixel data cache (PixelDataCache / pixel-cache.worker.ts) */
    PIXEL_CACHE: 20260408,

    /** localStorage artwork URL failure/success caches (GameArtworkProvider) */
    ARTWORK_URL_CACHE: 20260408,

    /** localStorage application settings (AppSettings) */
    APP_SETTINGS: 20260408,

    /** localStorage game settings panel (GameSettingsPanel) */
    GAME_SETTINGS: 20260408,

    /** localStorage Steam API response cache (CacheManager / SimpleCacheManager) */
    STEAM_API_CACHE: 20260408,
} as const

export type StorageVersionKey = keyof typeof StorageVersions
