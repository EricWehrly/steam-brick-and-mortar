import { LodArtworkRenderer, type LodArtworkConfig } from './LodArtworkRenderer'
import { HighTextureCache, type HighTextureCacheConfig } from './HighTextureCache'
import { HighTextureCacheDebug } from './HighTextureCacheDebug'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes } from '../../../types/InteractionEvents'
import { Logger } from '../../../utils/Logger'
import { DataManager } from '../../../core/data/DataManager'
import type { SteamGame } from '../../../steam/SteamApiClient'
/* eslint-disable @typescript-eslint/no-explicit-any */

const log = Logger.withContext('LodArtworkRendererDebug')

export interface LodArtworkRendererDebugConfig extends LodArtworkConfig {
    maxGames?: number
}

export class LodArtworkRendererDebug extends LodArtworkRenderer {
    private readonly maxGames: number
    
    constructor(config: LodArtworkRendererDebugConfig = {}) {
        super(config)
        this.maxGames = config.maxGames ?? 2000
        this.registerConsoleCommands()
        this.registerEventListeners()
    }

    private registerEventListeners(): void {
        EventManager.getInstance().registerEventHandler(GameEventTypes.AllBatchesComplete, () => {
            this.logMemoryStats()
        })
    }

    /** Override to use debug version of HighTextureCache */
    protected override createHighTextureCache(config: HighTextureCacheConfig): HighTextureCache {
        return new HighTextureCacheDebug(config)
    }

    private registerConsoleCommands(): void {
        ;(window as any).lodArtworkRenderer = this
        
        // Renderer stats
        ;(window as any).lodCacheStats = () => this.logHighTextureCacheStats()
        ;(window as any).diagnosePending = () => this.diagnosePendingState()
        
        // Artwork failure tracking
        ;(window as any).diagnoseArtworkFailures = () => {
            this.logFailureDiagnostics()
            return this.getFailureDiagnostics()
        }
        ;(window as any).clearArtworkFailures = () => {
            this.clearFailureCache()
            console.log('✅ Artwork failure cache cleared - failures will be retried on next load')
        }
        ;(window as any).auditArtworkFailures = () => this.auditFailedArtwork()

        // Loading experiments (needs maxGames)
        ;(window as any).experimentLoadingStrategies = (count = 9) => {
            const cache = this.getHighTextureCache() as HighTextureCacheDebug | null
            if (!cache) return console.log('❌ No HIGH texture cache available')
            const gameIndices: number[] = []
            for (let i = 0; i < this.maxGames && gameIndices.length < count; i++) {
                if (cache.getState(i) !== 'loaded') gameIndices.push(i)
            }
            console.log(`Testing with game indices: ${gameIndices.join(', ')}`)
            cache.experimentLoadingStrategies(gameIndices)
        }
        ;(window as any).experimentBatch = (count = 9) => {
            const cache = this.getHighTextureCache() as HighTextureCacheDebug | null
            if (!cache) return console.log('❌ No HIGH texture cache available')
            const gameIndices: number[] = []
            for (let i = 0; i < this.maxGames && gameIndices.length < count; i++) {
                if (cache.getState(i) !== 'loaded') gameIndices.push(i)
            }
            cache.experimentLoadingStrategies(gameIndices, [{ name: 'batch', maxConcurrent: 8 }])
        }

        // Frame Budget Scheduler (singleton)
        ;(window as any).diagnoseScheduler = async () => {
            const { FrameBudgetScheduler } = await import('../../../utils/FrameBudgetScheduler')
            FrameBudgetScheduler.getInstance().diagnose()
        }
        ;(window as any).schedulerStats = async () => {
            const { FrameBudgetScheduler } = await import('../../../utils/FrameBudgetScheduler')
            const stats = FrameBudgetScheduler.getInstance().getStats()
            console.log('📊 Scheduler Stats:', stats)
            return stats
        }
        ;(window as any).schedulerTune = async (maxTasksPerFrame: number) => {
            const { FrameBudgetScheduler } = await import('../../../utils/FrameBudgetScheduler')
            FrameBudgetScheduler.getInstance().setMaxTasksPerFrame(maxTasksPerFrame)
            console.log(`✅ Scheduler max tasks per frame set to ${maxTasksPerFrame}`)
        }

        // Pixel Data Cache (singleton)
        ;(window as any).diagnosePixelCache = async () => {
            const { PixelDataCache } = await import('./PixelDataCache')
            await PixelDataCache.getInstance().diagnose()
        }
        ;(window as any).clearPixelCache = async () => {
            const { PixelDataCache } = await import('./PixelDataCache')
            await PixelDataCache.getInstance().clear()
            console.log('✅ Pixel cache cleared')
        }

        console.log('🔧 LOD debug exports registered. Try: lodCacheStats(), lodDistribution(), diagnoseArtworkFailures()')
    }

    public getMemoryStats(): {
        lods: Record<string, { allocated: number; textureWidth: number; textureHeight: number; arrayDepth: number }>
        totalAllocated: number
        textureCount: number
        instanceCount: number
        failedArtworkCount: number
        failedArtwork: Map<string, { reason: string; url: string; timestamp: number }>
    } {
        const lods: Record<string, { allocated: number; textureWidth: number; textureHeight: number; arrayDepth: number }> = {}
        let totalAllocated = 0
        
        for (const [_level, state] of this.getLodTextures()) {
            // Support both square (textureSize) and non-square (textureWidth/Height) configs
            const width = state.config.textureWidth ?? state.config.textureSize ?? 128
            const height = state.config.textureHeight ?? state.config.textureSize ?? 128
            const depth = state.arrayDepth
            const allocated = state.dataArrayTexture 
                ? width * height * depth * 4
                : 0
            
            lods[state.config.name] = {
                allocated,
                textureWidth: width,
                textureHeight: height,
                arrayDepth: depth
            }
            totalAllocated += allocated
        }
        
        const failedArtwork = this.getFailedArtwork()
        
        return {
            lods,
            totalAllocated,
            textureCount: this.getNextTextureIndex(),
            instanceCount: this.getInstanceCount(),
            failedArtworkCount: failedArtwork.size,
            failedArtwork: new Map(
                Array.from(failedArtwork.entries()).map(([k, v]) => [k, { reason: v.reason, url: v.url, timestamp: v.timestamp }])
            )
        }
    }

    public logMemoryStats(): void {
        const stats = this.getMemoryStats()
        
        const lines: string[] = []
        for (const [name, lodStats] of Object.entries(stats.lods)) {
            const allocMB = (lodStats.allocated / (1024 * 1024)).toFixed(1)
            const dims = lodStats.textureWidth === lodStats.textureHeight 
                ? `${lodStats.textureWidth}px` 
                : `${lodStats.textureWidth}×${lodStats.textureHeight}px`
            lines.push(`  ${name} (${dims} × ${lodStats.arrayDepth} slots): ${allocMB}MB`)
        }
        lines.push(`  Total: ${(stats.totalAllocated / (1024 * 1024)).toFixed(1)}MB`)
        lines.push(`  Textures: ${stats.textureCount}, Instances: ${stats.instanceCount}, Failed: ${stats.failedArtworkCount}`)
        
        log.info(`🎨 LOD Artwork Memory Stats\n${lines.join('\n')}`)
    }

    // Call from console: `window.lodArtworkRenderer?.getFailureDiagnostics()`
    public getFailureDiagnostics(): {
        summary: { 
            total: number
            fallbackSuccessCount: number
            byReason: Record<string, number>
            byUrlPattern: Record<string, number>
            uniqueAppIds: number
        }
        failures: Array<{ game: string; reason: string; url: string; urlsTried: string[]; appid: string | null; timestamp: number }>
        fallbackSuccesses: Array<{ game: string; originalUrl: string; fallbackUrl: string; fallbackType: string }>
    } {
        const byReason: Record<string, number> = {}
        const byUrlPattern: Record<string, number> = {}
        const appIds = new Set<string>()
        const failures: Array<{ game: string; reason: string; url: string; urlsTried: string[]; appid: string | null; timestamp: number }> = []
        
        for (const [gameName, failure] of this.getFailedArtwork()) {
            byReason[failure.reason] = (byReason[failure.reason] || 0) + 1
            
            // Count each URL pattern that was tried
            for (const url of failure.urlsTried) {
                const urlPattern = this.extractUrlPattern(url)
                byUrlPattern[urlPattern] = (byUrlPattern[urlPattern] || 0) + 1
            }
            
            // Extract appid from URL
            const appidMatch = failure.url.match(/\/apps\/(\d+)\//)
            const appid = appidMatch ? appidMatch[1] : null
            if (appid) appIds.add(appid)
            
            failures.push({
                game: gameName,
                reason: failure.reason,
                url: failure.url,
                urlsTried: failure.urlsTried,
                appid,
                timestamp: failure.timestamp
            })
        }
        
        // Collect fallback successes
        const fallbackSuccesses: Array<{ game: string; originalUrl: string; fallbackUrl: string; fallbackType: string }> = []
        for (const [gameName, success] of this.getFallbackSuccesses()) {
            fallbackSuccesses.push({
                game: gameName,
                originalUrl: success.originalUrl,
                fallbackUrl: success.fallbackUrl,
                fallbackType: success.fallbackType
            })
        }
        
        return {
            summary: { 
                total: this.getFailedArtwork().size, 
                fallbackSuccessCount: this.getFallbackSuccesses().size,
                byReason,
                byUrlPattern,
                uniqueAppIds: appIds.size
            },
            failures,
            fallbackSuccesses
        }
    }

    private extractUrlPattern(url: string): string {
        const match = url.match(/\/([^/]+\.(?:jpg|png|webp))(?:\?|$)/i)
        return match ? match[1] : 'unknown'
    }

    public logFailureDiagnostics(): void {
        const diag = this.getFailureDiagnostics()
        
        const lines: string[] = [
            ``,
            `🎨 ARTWORK LOADING REPORT`,
            `${'═'.repeat(50)}`
        ]
        
        // Show fallback successes first (good news!)
        if (diag.summary.fallbackSuccessCount > 0) {
            lines.push(`✅ Fallback successes: ${diag.summary.fallbackSuccessCount} games`)
            
            // Group by fallback type
            const byType: Record<string, number> = {}
            for (const s of diag.fallbackSuccesses) {
                byType[s.fallbackType] = (byType[s.fallbackType] || 0) + 1
            }
            for (const [type, count] of Object.entries(byType)) {
                lines.push(`   • ${type}: ${count} games`)
            }
            
            // Show a couple examples
            const examples = diag.fallbackSuccesses.slice(0, 2)
            if (examples.length > 0) {
                lines.push(`   Examples:`)
                for (const ex of examples) {
                    lines.push(`     "${ex.game}" → ${ex.fallbackType}`)
                }
            }
            lines.push(``)
        }
        
        if (diag.summary.total === 0) {
            if (diag.summary.fallbackSuccessCount === 0) {
                lines.push(`✨ No artwork issues - all URLs succeeded on first try!`)
            } else {
                lines.push(`✨ No complete failures - all games have artwork (some via fallback)`)
            }
            log.info(lines.join('\n'))
            return
        }
        
        lines.push(`❌ Complete failures: ${diag.summary.total} games (all URLs failed)`)
        lines.push(`${'─'.repeat(50)}`)
        
        // Group failures by reason for cleaner output
        const byReasonWithExamples: Record<string, { count: number; examples: Array<{ game: string; appid: string | null; urlsTried: string[] }> }> = {}
        
        for (const f of diag.failures) {
            if (!byReasonWithExamples[f.reason]) {
                byReasonWithExamples[f.reason] = { count: 0, examples: [] }
            }
            byReasonWithExamples[f.reason].count++
            if (byReasonWithExamples[f.reason].examples.length < 2) {
                byReasonWithExamples[f.reason].examples.push({ game: f.game, appid: f.appid, urlsTried: f.urlsTried })
            }
        }
        
        // Show each category with examples
        for (const [reason, data] of Object.entries(byReasonWithExamples)) {
            const pct = ((data.count / diag.summary.total) * 100).toFixed(0)
            lines.push(``)
            lines.push(`${this.getReasonEmoji(reason)} ${reason}: ${data.count} (${pct}%)`)
            lines.push(`   ${this.getReasonExplanation(reason)}`)
            
            // Show 1-2 examples with URLs tried
            for (const ex of data.examples) {
                lines.push(`   • "${ex.game}" (${ex.appid || '?'}) - tried ${ex.urlsTried.length} URLs`)
            }
            if (data.count > 2) {
                lines.push(`   ... +${data.count - 2} more`)
            }
        }
        
        // Show URL patterns tried
        lines.push(``)
        lines.push(`URL patterns attempted: ${Object.keys(diag.summary.byUrlPattern).join(', ')}`)
        
        // Actionable next steps for remaining failures
        lines.push(``)
        lines.push(`💡 These games may be permanently inaccessible (delisted, region-locked, or removed)`)
        
        log.info(lines.join('\n'))
    }

    private getReasonEmoji(reason: string): string {
        switch (reason) {
            case 'CORS': return '🚫'
            case '404': return '❓'
            case 'TIMEOUT': return '⏱️'
            case 'INVALID_CONTENT': return '🔨'
            default: return '❌'
        }
    }

    private getReasonExplanation(reason: string): string {
        switch (reason) {
            case 'CORS': return 'Request blocked by browser (cross-origin policy)'
            case '404': return 'Image not found - may be delisted or region-locked'
            case 'TIMEOUT': return 'Request took too long - network/CDN issue'
            case 'INVALID_CONTENT': return 'Response was not a valid image'
            default: return 'Unknown error - check Network tab'
        }
    }

    public getHighTextureCacheStats() {
        return this.getHighTextureCache()?.getStats() ?? null
    }

    public logHighTextureCacheStats(): void {
        this.getHighTextureCache()?.logStats()
    }

    public getPendingPromotions(): { textureIndex: number; slot: number; gameName?: string }[] {
        const result: { textureIndex: number; slot: number; gameName?: string }[] = []
        for (const [textureIndex, slot] of this.getPendingHighPromotion()) {
            const instanceIndex = this.getTextureIndexToInstance().get(textureIndex)
            const gameName = instanceIndex !== undefined 
                ? this.getInstanceMetadata().get(instanceIndex)?.name 
                : undefined
            result.push({ textureIndex, slot, gameName })
        }
        return result
    }

    public diagnosePendingState(): void {
        const pending = this.getPendingPromotions()
        const stats = this.getHighTextureCache()?.getStats()
        
        console.group('🔄 Pending HIGH Promotions')
        console.log(`GPU flush interval: every ${this.getGpuUpdateInterval()} frames`)
        console.log(`Frame counter: ${this.getGpuUpdateFrameCounter()}/${this.getGpuUpdateInterval()}`)
        console.log(`Pending promotions: ${pending.length}`)
        
        if (pending.length > 0) {
            for (const p of pending) {
                console.log(`  textureIndex ${p.textureIndex} → slot ${p.slot} "${p.gameName?.slice(0, 25) ?? '?'}"`)
            }
        }
        
        if (stats) {
            console.log(`\nCache: ${stats.loading} loading, ${stats.queueLength} queued`)
        }
        console.groupEnd()
    }

    public getPrewarmingStats() {
        return this.getSpatialPrewarming()?.getStats() ?? null
    }

    /**
     * Cross-reference failed artwork with Steam API metadata
     * to identify patterns in why these games fail.
     * 
     * Console usage: `window.lodArtworkRenderer?.auditFailedArtwork()`
     */
    public auditFailedArtwork(): void {
        const failures = this.getFailureDiagnostics().failures
        const steamGames = DataManager.getInstance().get<SteamGame[]>('steam.games') || []
        
        // Build lookup by appid (handle both string and number appids)
        const gamesByAppid = new Map<string, SteamGame>()
        for (const game of steamGames) {
            gamesByAppid.set(String(game.appid), game)
        }
        
        console.group(`🔍 ARTWORK FAILURE AUDIT - ${failures.length} failed games`)
        console.log(`Cross-referencing with Steam API metadata (${steamGames.length} games loaded)...\n`)
        
        interface EnrichedFailure {
            name: string
            appid: string | null
            reason: string
            urlsTried: string[]
            artworkUrls: {
                header: string | undefined
                library: string | undefined
                icon: string | undefined
                logo: string | undefined
            } | null
            steamData: {
                img_icon_url: string | undefined
                img_logo_url: string | undefined
                hasCategories: boolean
                hasGenres: boolean
                hasReleaseDate: boolean
                releaseDate: string | undefined
                comingSoon: boolean
                categories: string[]
                genres: string[]
                playtime: number
                developers: string[]
                publishers: string[]
            } | null
        }
        
        const enriched: EnrichedFailure[] = []
        
        for (const f of failures) {
            const appid = f.appid
            const steamGame = appid ? gamesByAppid.get(appid) : null
            
            enriched.push({
                name: f.game,
                appid,
                reason: f.reason,
                urlsTried: f.urlsTried,
                artworkUrls: steamGame?.artwork ? {
                    header: steamGame.artwork.header,
                    library: steamGame.artwork.library,
                    icon: steamGame.artwork.icon,
                    logo: steamGame.artwork.logo
                } : null,
                steamData: steamGame ? {
                    img_icon_url: steamGame.img_icon_url,
                    img_logo_url: steamGame.img_logo_url,
                    hasCategories: !!(steamGame.categories?.length),
                    hasGenres: !!(steamGame.genres?.length),
                    hasReleaseDate: !!steamGame.release_date,
                    releaseDate: steamGame.release_date?.date,
                    comingSoon: steamGame.release_date?.coming_soon ?? false,
                    categories: steamGame.categories?.map(c => c.description) || [],
                    genres: steamGame.genres?.map(g => g.description) || [],
                    playtime: steamGame.playtime_forever,
                    developers: steamGame.developers || [],
                    publishers: steamGame.publishers || []
                } : null
            })
        }
        
        // Summary statistics
        const withSteamData = enriched.filter((e): e is EnrichedFailure & { steamData: NonNullable<EnrichedFailure['steamData']> } => e.steamData !== null)
        const withoutSteamData = enriched.filter(e => !e.steamData)
        const noIcon = withSteamData.filter(e => !e.steamData.img_icon_url)
        const noLogo = withSteamData.filter(e => !e.steamData.img_logo_url)
        const noCategories = withSteamData.filter(e => !e.steamData.hasCategories)
        const noGenres = withSteamData.filter(e => !e.steamData.hasGenres)
        const noReleaseDate = withSteamData.filter(e => !e.steamData.hasReleaseDate)
        const comingSoon = withSteamData.filter(e => e.steamData.comingSoon)
        const zeroPlaytime = withSteamData.filter(e => e.steamData.playtime === 0)
        const noDevelopers = withSteamData.filter(e => e.steamData.developers.length === 0)
        const noPublishers = withSteamData.filter(e => e.steamData.publishers.length === 0)
        
        console.log('📊 SUMMARY')
        console.log(`   Total failures: ${failures.length}`)
        console.log(`   Found in Steam data: ${withSteamData.length}`)
        console.log(`   NOT in Steam data: ${withoutSteamData.length}`)
        console.log('')
        console.log('📋 METADATA PATTERNS (potential predictors):')
        console.log(`   Missing icon URL: ${noIcon.length}/${withSteamData.length} (${pct(noIcon.length, withSteamData.length)}%)`)
        console.log(`   Missing logo URL: ${noLogo.length}/${withSteamData.length} (${pct(noLogo.length, withSteamData.length)}%)`)
        console.log(`   No categories: ${noCategories.length}/${withSteamData.length} (${pct(noCategories.length, withSteamData.length)}%)`)
        console.log(`   No genres: ${noGenres.length}/${withSteamData.length} (${pct(noGenres.length, withSteamData.length)}%)`)
        console.log(`   No release date: ${noReleaseDate.length}/${withSteamData.length} (${pct(noReleaseDate.length, withSteamData.length)}%)`)
        console.log(`   Coming soon: ${comingSoon.length}/${withSteamData.length} (${pct(comingSoon.length, withSteamData.length)}%)`)
        console.log(`   Zero playtime: ${zeroPlaytime.length}/${withSteamData.length} (${pct(zeroPlaytime.length, withSteamData.length)}%)`)
        console.log(`   No developers: ${noDevelopers.length}/${withSteamData.length} (${pct(noDevelopers.length, withSteamData.length)}%)`)
        console.log(`   No publishers: ${noPublishers.length}/${withSteamData.length} (${pct(noPublishers.length, withSteamData.length)}%)`)
        
        // Look for strong correlations
        const noIconAndNoLogo = withSteamData.filter(e => !e.steamData.img_icon_url && !e.steamData.img_logo_url)
        const noMetadata = withSteamData.filter(e => !e.steamData.hasCategories && !e.steamData.hasGenres)
        const sparseMetadata = withSteamData.filter(e => 
            !e.steamData.hasCategories && !e.steamData.hasGenres && 
            e.steamData.developers.length === 0 && e.steamData.publishers.length === 0
        )
        
        console.log('')
        console.log('🔗 STRONG CORRELATIONS (potential heuristics):')
        console.log(`   No icon AND no logo: ${noIconAndNoLogo.length}/${withSteamData.length} (${pct(noIconAndNoLogo.length, withSteamData.length)}%)`)
        console.log(`   No categories AND no genres: ${noMetadata.length}/${withSteamData.length} (${pct(noMetadata.length, withSteamData.length)}%)`)
        console.log(`   Sparse metadata (no cat/genre/dev/pub): ${sparseMetadata.length}/${withSteamData.length} (${pct(sparseMetadata.length, withSteamData.length)}%)`)
        
        // Show a table with key data points
        console.log('')
        console.log('📝 DETAILED DATA:')
        console.table(enriched.map(e => ({
            name: e.name.slice(0, 35),
            appid: e.appid,
            reason: e.reason,
            urlsTried: e.urlsTried.length,
            iconUrl: e.steamData?.img_icon_url ? '✓' : '✗',
            logoUrl: e.steamData?.img_logo_url ? '✓' : '✗',
            cats: e.steamData?.categories?.length ?? '?',
            genres: e.steamData?.genres?.length ?? '?',
            release: e.steamData?.releaseDate?.slice(0, 12) ?? '?',
            playtime: e.steamData?.playtime ?? '?'
        })))
        
        // Show artwork URLs to understand what we're actually requesting
        console.log('')
        console.log('🌐 ARTWORK URLS THAT FAILED:')
        for (const e of enriched.slice(0, 10)) {
            console.log(`\n"${e.name}" (${e.appid}):`)
            console.log(`   Tried: ${e.urlsTried.join('\n          ')}`)
            if (e.artworkUrls) {
                console.log(`   In metadata - header: ${e.artworkUrls.header || '(none)'}`)
                console.log(`                 library: ${e.artworkUrls.library || '(none)'}`)
            }
        }
        if (enriched.length > 10) {
            console.log(`\n   ... and ${enriched.length - 10} more`)
        }
        
        // Export for analysis
        console.log('')
        console.log('📤 Copy this JSON for deeper analysis:')
        console.log(JSON.stringify(enriched, null, 2))
        
        console.groupEnd()
        
        function pct(n: number, total: number): string {
            return total > 0 ? ((n / total) * 100).toFixed(0) : '0'
        }
    }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
