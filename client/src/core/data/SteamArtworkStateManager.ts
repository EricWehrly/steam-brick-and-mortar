import { DataManager } from './DataManager'
import { DataDomain } from './DataTypes'

export type ArtworkSelectionType = 'library' | 'capsule' | 'header' | 'label'

export interface SteamArtworkStateEntry {
    selectedType?: ArtworkSelectionType
    selectedUrl?: string
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

    public static setSelection(appId: number, selectedType: ArtworkSelectionType, selectedUrl?: string): void {
        this.amendState(appId, (entry) => {
            entry.selectedType = selectedType
            entry.selectedUrl = selectedUrl
        })
    }

    public static clearSelection(appId: number): void {
        this.amendState(appId, (entry) => {
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
