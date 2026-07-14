/**
 * Resolves the numeric genre/category ids appinfo.vdf gives locally (see
 * desktop/tauri-app/src/steam/appinfo.rs) into human-readable {id, description} pairs, by
 * harvesting the id->name mapping opportunistically from the pre-baked appdetails bundle
 * (client/public/steam-cache/app-details.json.gz) rather than a live network/Lambda fetch - see
 * docs/plans/taxonomy-data-event-plan.md for the decision. Genre/category ids are global and
 * stable across the whole Steam catalog, so a mapping learned from the bundle's ~1300 apps
 * applies to any other app's local numeric ids, including ones the bundle never fetched itself.
 *
 * Module-level cache: the bundle is fetched and scanned once per app session, not once per call.
 */

import { BakedCacheLoader } from './cache/BakedCacheLoader'
import type { SteamCategory, SteamGenre } from './types/SteamMetadata'
import { Logger } from '../utils/Logger'

export class TaxonomyIdResolver {
    private static readonly logger = Logger.createLogFunctions(TaxonomyIdResolver.name)
    private static genreNames: Map<string, string> | undefined
    private static categoryNames: Map<string, string> | undefined
    private static loadPromise: Promise<void> | undefined

    /** IDs with no entry in the harvested table are skipped, not failed - same convention as
     *  the local tag-id resolution in appinfo.rs/localization.rs (a missing entry means the
     *  bundle never happened to cover that id, not that the id is invalid). */
    public static async resolveGenres(ids: readonly number[]): Promise<SteamGenre[]> {
        await TaxonomyIdResolver.ensureLoaded()
        const names = TaxonomyIdResolver.genreNames!
        const resolved: SteamGenre[] = []
        for (const id of ids) {
            const description = names.get(String(id))
            if (description) {
                resolved.push({ id: String(id), description })
            }
        }
        return resolved
    }

    public static async resolveCategories(ids: readonly number[]): Promise<SteamCategory[]> {
        await TaxonomyIdResolver.ensureLoaded()
        const names = TaxonomyIdResolver.categoryNames!
        const resolved: SteamCategory[] = []
        for (const id of ids) {
            const description = names.get(String(id))
            if (description) {
                resolved.push({ id, description })
            }
        }
        return resolved
    }

    /** Test-only: clears the module-level cache so each test starts from an unloaded state. */
    public static resetCache(): void {
        TaxonomyIdResolver.genreNames = undefined
        TaxonomyIdResolver.categoryNames = undefined
        TaxonomyIdResolver.loadPromise = undefined
    }

    private static async ensureLoaded(): Promise<void> {
        if (TaxonomyIdResolver.genreNames && TaxonomyIdResolver.categoryNames) {
            return
        }
        if (!TaxonomyIdResolver.loadPromise) {
            TaxonomyIdResolver.loadPromise = TaxonomyIdResolver.loadFromBundle()
        }
        await TaxonomyIdResolver.loadPromise
    }

    private static async loadFromBundle(): Promise<void> {
        const genreNames = new Map<string, string>()
        const categoryNames = new Map<string, string>()

        const bundle = await BakedCacheLoader.fetchBundle()
        if (bundle) {
            for (const entry of Object.values(bundle.games)) {
                const fullData = entry.data.full_data as
                    | { genres?: SteamGenre[]; categories?: SteamCategory[] }
                    | undefined
                const genres = entry.data.genres ?? fullData?.genres
                const categories = entry.data.categories ?? fullData?.categories
                genres?.forEach(genre => genreNames.set(String(genre.id), genre.description))
                categories?.forEach(category => categoryNames.set(String(category.id), category.description))
            }
        }

        TaxonomyIdResolver.genreNames = genreNames
        TaxonomyIdResolver.categoryNames = categoryNames
        TaxonomyIdResolver.logger.info(
            `Loaded genre/category id->name table from baked bundle: ${genreNames.size} genres, ${categoryNames.size} categories`
        )
    }
}
