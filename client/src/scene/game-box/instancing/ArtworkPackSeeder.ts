/**
 * Pre-seeds PixelDataCache from the baked F2P artwork pack (client/public/artwork-cache/pack.jpg
 * + pack-index.json - see scripts/bake-f2p-artwork.sh) so the demo store never touches Steam's
 * CDN for those games.
 *
 * The key design choice: entries are seeded under the *real* Steam CDN URL
 * (deriveArtworkFromAppId's library URL), not a synthetic local path. Everything downstream
 * (GameArtworkProvider.fetchPixels, buildUrlStrategy, resolveHighArtworkUrl) already checks
 * PixelDataCache before ever touching the network - a pre-seeded entry is just a cache hit,
 * indistinguishable from a returning visitor's warm cache. Nothing below this module needs to
 * know "baked artwork" exists as a concept. See docs/plans/f2p-artwork-bake-plan.md.
 */

import { deriveArtworkFromAppId } from '../../../steam/utils/ArtworkUrls'
import { Logger } from '../../../utils/Logger'
import { PixelDataCache } from './PixelDataCache'
import { TextureWorker } from './TextureWorker'
import type { ArtworkPackEntry } from './TextureWorker'

const PACK_INDEX_PATH = '/artwork-cache/pack-index.json'
const PACK_IMAGE_PATH = '/artwork-cache/pack.jpg'

// Matches getDefaultLodTierSpecs() in LodTypes.ts. Not read from AppSettings: a user who has
// customized their LOD ratios away from default simply won't get pre-seeded entries at their
// custom size - falls through to a normal CDN fetch, same as before this existed. Not worth the
// cross-layer coupling to LodArtworkOrchestrator's dynamic config for a niche settings tweak.
const MID_WIDTH = 150
const MID_HEIGHT = 225
const HIGH_WIDTH = 300
const HIGH_HEIGHT = 450

interface PackIndex {
    generated_at: string
    tileWidth: number
    tileHeight: number
    entries: Record<string, { x: number; y: number }>
}

export class ArtworkPackSeeder {
    private static readonly logger = Logger.createLogFunctions(ArtworkPackSeeder.name)

    /**
     * Seed PixelDataCache from the pack, unless it's already there. Never throws - any failure
     * (no pack shipped, fetch error, decode error) just leaves the cache as it was, and the
     * normal CDN fetch path picks up the slack exactly as if this seeder didn't run.
     */
    async seedIfNeeded(): Promise<void> {
        try {
            const index = await this.fetchIndex()
            if (!index) return

            const entries = Object.entries(index.entries)
            if (entries.length === 0) return

            const pixelCache = PixelDataCache.getInstance()

            if (await this.alreadySeeded(pixelCache, entries[0][0])) {
                ArtworkPackSeeder.logger.debug('Artwork pack already seeded - skipping')
                return
            }

            const packBlob = await this.fetchPackImage()
            if (!packBlob) return

            const packEntries: ArtworkPackEntry[] = entries.map(([appid, pos]) => ({
                appid: Number(appid),
                x: pos.x,
                y: pos.y
            }))

            const textureWorker = new TextureWorker()
            let tiles
            try {
                tiles = await textureWorker.decodeArtworkPack(
                    packBlob,
                    packEntries,
                    index.tileWidth,
                    index.tileHeight,
                    MID_WIDTH,
                    MID_HEIGHT,
                    HIGH_WIDTH,
                    HIGH_HEIGHT
                )
            } finally {
                textureWorker.dispose()
            }

            await Promise.all(tiles.flatMap(tile => {
                const url = deriveArtworkFromAppId(tile.appid).library
                return [
                    pixelCache.put(url, tile.midPixels, MID_WIDTH, MID_HEIGHT),
                    pixelCache.put(url, tile.highPixels, HIGH_WIDTH, HIGH_HEIGHT)
                ]
            }))

            ArtworkPackSeeder.logger.info(`Seeded ${tiles.length} games' artwork from the baked pack (generated_at: ${index.generated_at})`)
        } catch (error) {
            ArtworkPackSeeder.logger.warn('Failed to seed artwork pack:', error)
        }
    }

    private async alreadySeeded(pixelCache: PixelDataCache, firstAppid: string): Promise<boolean> {
        const url = deriveArtworkFromAppId(Number(firstAppid)).library
        const cached = await pixelCache.get(url, MID_WIDTH, MID_HEIGHT)
        return cached !== null
    }

    private async fetchIndex(): Promise<PackIndex | null> {
        try {
            const response = await fetch(PACK_INDEX_PATH)
            if (!response.ok) {
                ArtworkPackSeeder.logger.debug(`Artwork pack index unavailable (HTTP ${response.status}) - skipping`)
                return null
            }
            return await response.json() as PackIndex
        } catch (error) {
            ArtworkPackSeeder.logger.debug('Artwork pack index fetch failed:', error)
            return null
        }
    }

    private async fetchPackImage(): Promise<Blob | null> {
        try {
            const response = await fetch(PACK_IMAGE_PATH)
            if (!response.ok) {
                ArtworkPackSeeder.logger.warn(`Artwork pack image unavailable (HTTP ${response.status}) - skipping`)
                return null
            }
            return await response.blob()
        } catch (error) {
            ArtworkPackSeeder.logger.warn('Artwork pack image fetch failed:', error)
            return null
        }
    }
}
