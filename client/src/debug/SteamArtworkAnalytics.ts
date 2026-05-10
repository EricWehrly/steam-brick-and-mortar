import { DataManager } from '../core/data/DataManager'
import { DataDomain } from '../core/data/DataTypes'
import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'
import { GameArtworkProvider, type FailureReason } from '../scene/game-box/instancing/GameArtworkProvider'
import type { SteamGameData } from '../scene/game-box/types/GameData'

export type ArtworkSelectedType = 'library' | 'capsule' | 'header' | 'label' | 'unknown'

export interface SteamArtworkSnapshotRecord {
    appid: number
    name: string
    selectedType: ArtworkSelectedType
    cacheSource: 'success-cache' | 'failure-cache' | 'none'
    fallbackType?: string
    fallbackUrl?: string
    failureReason?: FailureReason
    hasLibrary: boolean
    hasHeader: boolean
    hasCapsuleHint: boolean
    playtimeForever: number
}

export interface SteamArtworkUsageSummary {
    total: number
    bySelectedType: Record<ArtworkSelectedType, number>
    byFailureReason: Partial<Record<FailureReason, number>>
}

export interface SteamArtworkSnapshotResult {
    snapshot: SteamArtworkSnapshotRecord[]
    summary: SteamArtworkUsageSummary
}

class SteamArtworkAnalytics {
    private static readonly SNAPSHOT_KEY = 'steam.games.postCacheArtwork'
    private static readonly SUMMARY_KEY = 'steam.games.postCacheArtwork.summary'

    public buildSnapshot(): SteamArtworkSnapshotResult {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []
        const provider = GameArtworkProvider.getInstance()

        const snapshot = games.map((game) => {
            const appid = this.toNumericAppId(game.appid)
            const success = provider.getSuccessCacheEntry(appid, 'library')
            const failure = provider.getFailureCacheEntry(appid, 'library')

            let selectedType: ArtworkSelectedType = 'unknown'
            let cacheSource: SteamArtworkSnapshotRecord['cacheSource'] = 'none'
            let fallbackType: string | undefined
            let fallbackUrl: string | undefined
            let failureReason: FailureReason | undefined

            if (success && failure) {
                if (success.timestamp >= failure.timestamp) {
                    const inferredType = this.inferArtworkType(success.fallbackType, success.fallbackUrl)
                    selectedType = inferredType
                    cacheSource = 'success-cache'
                    fallbackType = success.fallbackType
                    fallbackUrl = success.fallbackUrl
                } else {
                    selectedType = 'label'
                    cacheSource = 'failure-cache'
                    failureReason = failure.reason
                }
            } else if (success) {
                const inferredType = this.inferArtworkType(success.fallbackType, success.fallbackUrl)
                selectedType = inferredType
                cacheSource = 'success-cache'
                fallbackType = success.fallbackType
                fallbackUrl = success.fallbackUrl
            } else if (failure) {
                selectedType = 'label'
                cacheSource = 'failure-cache'
                failureReason = failure.reason
            }

            return {
                appid,
                name: game.name,
                selectedType,
                cacheSource,
                fallbackType,
                fallbackUrl,
                failureReason,
                hasLibrary: !!game.artwork?.library,
                hasHeader: !!game.artwork?.header,
                hasCapsuleHint: !!game.artwork?.header,
                playtimeForever: game.playtime_forever ?? 0,
            }
        })

        const summary = this.buildSummary(snapshot)

        DataManager.getInstance().set<SteamArtworkSnapshotRecord[]>(
            SteamArtworkAnalytics.SNAPSHOT_KEY,
            snapshot,
            { domain: DataDomain.Cache }
        )

        DataManager.getInstance().set<SteamArtworkUsageSummary>(
            SteamArtworkAnalytics.SUMMARY_KEY,
            summary,
            { domain: DataDomain.Cache }
        )

        return { snapshot, summary }
    }

    private buildSummary(snapshot: SteamArtworkSnapshotRecord[]): SteamArtworkUsageSummary {
        const bySelectedType: Record<ArtworkSelectedType, number> = {
            library: 0,
            capsule: 0,
            header: 0,
            label: 0,
            unknown: 0,
        }

        const byFailureReason: Partial<Record<FailureReason, number>> = {}

        for (const row of snapshot) {
            bySelectedType[row.selectedType] += 1
            if (row.failureReason) {
                byFailureReason[row.failureReason] = (byFailureReason[row.failureReason] ?? 0) + 1
            }
        }

        return {
            total: snapshot.length,
            bySelectedType,
            byFailureReason,
        }
    }

    private inferArtworkType(fallbackType: string, fallbackUrl: string): ArtworkSelectedType {
        if (fallbackType.includes('library') || fallbackUrl.includes('/library_600x900.jpg')) return 'library'
        if (fallbackType.includes('capsule') || fallbackUrl.includes('/capsule_616x353.jpg')) return 'capsule'
        if (fallbackType.includes('header') || fallbackUrl.includes('/header.jpg')) return 'header'
        return 'unknown'
    }

    private toNumericAppId(appid: number | string): number {
        return typeof appid === 'number' ? appid : Number.parseInt(appid, 10) || 0
    }
}

export function initializeSteamArtworkAnalytics(): void {
    const analytics = new SteamArtworkAnalytics()

    window.buildSteamArtworkSnapshot = () => analytics.buildSnapshot()

    window.getSteamArtworkUsageSummary = () => analytics.buildSnapshot().summary

    window.querySteamArtworkSnapshot = (query) => {
        const { snapshot } = analytics.buildSnapshot()
        return snapshot.filter((row) => {
            const selectedTypeMatch = !query?.selectedType || row.selectedType === query.selectedType
            const cacheSourceMatch = !query?.cacheSource || row.cacheSource === query.cacheSource
            const failureReasonMatch = !query?.failureReason || row.failureReason === query.failureReason
            return selectedTypeMatch && cacheSourceMatch && failureReasonMatch
        })
    }

    console.debug('📊 [SteamArtworkAnalytics] Debug helpers exposed:')
    console.debug('  window.buildSteamArtworkSnapshot()')
    console.debug('  window.getSteamArtworkUsageSummary()')
    console.debug('  window.querySteamArtworkSnapshot({ selectedType: "label" })')
}

declare global {
    interface Window {
        buildSteamArtworkSnapshot: () => SteamArtworkSnapshotResult
        getSteamArtworkUsageSummary: () => SteamArtworkUsageSummary
        querySteamArtworkSnapshot: (query?: {
            selectedType?: ArtworkSelectedType
            cacheSource?: 'success-cache' | 'failure-cache' | 'none'
            failureReason?: FailureReason
        }) => SteamArtworkSnapshotRecord[]
    }
}

EventManager.getInstance().registerEventHandler(GameEventTypes.Start, initializeSteamArtworkAnalytics)
