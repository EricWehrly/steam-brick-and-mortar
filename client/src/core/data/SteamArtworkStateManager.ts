import { DataManager } from './DataManager'
import { DataDomain } from './DataTypes'

export type ArtworkFormatKey = 'library' | 'header' | 'capsule'
export type ArtworkSelectionType = 'library' | 'capsule' | 'header' | 'label'
export type ArtworkFailureReason = 'CORS' | '404' | 'NO_ARTWORK' | 'TIMEOUT' | 'NETWORK' | 'DECODE' | 'UNKNOWN'

export interface ArtworkAttemptResult {
    type: 'library' | 'capsule' | 'header' | 'other' | 'label'
    url: string
    result: 'success' | 'failure' | 'skipped-permanent'
    error?: string
}

export interface ArtworkCacheEntry {
    reason?: ArtworkFailureReason
    urlsTried?: string[]
    attemptCount?: number
    isPermanent?: boolean
    fallbackUrl?: string
    fallbackType?: string
}

export interface SteamArtworkStateEntry {
    cacheByFormat?: Partial<Record<ArtworkFormatKey, ArtworkCacheEntry>>
    selectedType?: ArtworkSelectionType
    selectedUrl?: string
    attemptResults?: ArtworkAttemptResult[]
}

export class SteamArtworkStateManager {
    private static readonly KEY = 'steam.artworkState'

    private static get instance(): DataManager {
        return DataManager.getInstance()
    }

    public static getStateMap(): Record<string, SteamArtworkStateEntry> {
        return this.instance.get<Record<string, SteamArtworkStateEntry>>(this.KEY) ?? {}
    }

    public static getState(appId: number): SteamArtworkStateEntry | null {
        const state = this.getStateMap()[String(appId)]
        return state ?? null
    }

    public static amendState(appId: number, amend: (entry: SteamArtworkStateEntry) => void): void {
        const key = String(appId)
        const map = this.getStateMap()
        const current = map[key] ?? {}
        const next = { ...current }
        amend(next)

        const updated = {
            ...map,
            [key]: next,
        }

        this.setStateMap(updated)
    }

    public static clearState(appId: number): void {
        const key = String(appId)
        const map = this.getStateMap()
        if (!(key in map)) {
            return
        }

        const next = { ...map }
        delete next[key]
        this.setStateMap(next)
    }

    public static clearAllState(): void {
        this.setStateMap({})
    }

    public static getCacheEntry(appId: number, format: ArtworkFormatKey): ArtworkCacheEntry | null {
        return this.getState(appId)?.cacheByFormat?.[format] ?? null
    }

    public static setCacheEntry(appId: number, format: ArtworkFormatKey, cacheEntry: ArtworkCacheEntry): void {
        this.amendState(appId, (entry) => {
            entry.cacheByFormat = {
                ...(entry.cacheByFormat ?? {}),
                [format]: cacheEntry,
            }
        })
    }

    public static deleteCacheEntry(appId: number, format: ArtworkFormatKey): void {
        this.amendState(appId, (entry) => {
            if (!entry.cacheByFormat) {
                return
            }

            const next = { ...entry.cacheByFormat }
            delete next[format]
            entry.cacheByFormat = Object.keys(next).length > 0 ? next : undefined
        })
    }

    public static resetAttempts(appId: number): void {
        this.amendState(appId, (entry) => {
            entry.attemptResults = []
        })
    }

    public static appendAttempt(appId: number, attempt: ArtworkAttemptResult): void {
        this.amendState(appId, (entry) => {
            entry.attemptResults = [...(entry.attemptResults ?? []), attempt]
        })
    }

    public static setSelection(appId: number, selectedType: ArtworkSelectionType, selectedUrl?: string): void {
        this.amendState(appId, (entry) => {
            entry.selectedType = selectedType
            entry.selectedUrl = selectedUrl
        })
    }

    public static clearPresentationState(appId: number): void {
        this.amendState(appId, (entry) => {
            entry.attemptResults = []
            entry.selectedType = undefined
            entry.selectedUrl = undefined
        })
    }

    private static setStateMap(value: Record<string, SteamArtworkStateEntry>): void {
        const metadata = this.instance.getMetadata(this.KEY) ?? {
            domain: DataDomain.SteamIntegration
        }
        this.instance.set<Record<string, SteamArtworkStateEntry>>(this.KEY, value, metadata)
    }
}
