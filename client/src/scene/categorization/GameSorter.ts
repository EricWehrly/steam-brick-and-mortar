/**
 * GameSorter
 *
 * Orchestrator for the two-stage arrangement pipeline:
 *   Stage A — GroupResolver: partition games into Section[]s by GroupMode
 *   Stage B — SectionSorter: sort within each section by SortMode
 *
 * Listens to:
 *   GameDataReady           → run initial arrangement with defaults
 *   ArrangementRequested    → re-run with new group + sort axes
 *
 * Emits SectionsReady with the resulting sections + provenance (groupMode, sortMode).
 *
 * Default arrangement:
 *   Anonymous users → GroupMode.ByGenre + SortMode.ByPlaytime
 *   Authenticated   → GroupMode.ByRecency + SortMode.ByLastPlayed
 *
 * Re-exports bucket helpers (moved to GroupResolver) for backward-compat callers.
 */

import { EventManager } from '../../core/EventManager'
import { DataManager } from '../../core/data/DataManager'
import { Logger } from '../../utils/Logger'
import { GameEventTypes, UIEventTypes, StorePropsEventTypes } from '../../types/InteractionEvents'
import { GroupModes, SortModes } from '../../types/LayoutTypes'
import type { GroupMode, SortMode } from '../../types/LayoutTypes'
import type { GameDataReadyEvent, SectionsReadyEvent, ArrangementRequestedEvent } from '../../types/EnvironmentEvents'
import type { SteamGameData } from '../game-box/types/GameData'
import { SteamIntegration } from '../../steam-integration/SteamIntegration'
import { resolveGroups } from './GroupResolver'
import { sortSections } from './SectionSorter'

// Re-export bucket helpers so existing callers don't break
export {
    RecentlyPlayedBucket,
    getRecencyBucket as getRecentlyPlayedBucket,
    PlaytimeBucket,
    getPlaytimeBucket,
} from './GroupResolver'

export class GameSorter {
    private static readonly logger = Logger.createLogFunctions(GameSorter.name)

    private activeGroupMode: GroupMode = GroupModes.ByRecency
    private activeSortMode: SortMode = SortModes.ByLastPlayed
    private hasArrangedOnce = false

    constructor() {
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.GameDataReady,
            (_event: CustomEvent<GameDataReadyEvent>) => this.runInitialArrangement()
        )
        EventManager.getInstance().registerEventHandler(
            UIEventTypes.ArrangementRequested,
            (event: CustomEvent<ArrangementRequestedEvent>) => this.handleArrangementRequested(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ClearRequest,
            () => this.handleClearRequest()
        )
        GameSorter.logger.debug('GameSorter initialized')
    }

    private handleClearRequest(): void {
        // Layout switch: preserve the user's chosen arrangement; don't reset to defaults.
        // hasArrangedOnce stays true so the next GameDataReady re-applies the current modes.
        GameSorter.logger.debug(`ClearRequest: preserving arrangement (group=${this.activeGroupMode}, sort=${this.activeSortMode})`)
    }

    private runInitialArrangement(): void {
        if (!this.hasArrangedOnce) {
            // First load: choose defaults based on auth state
            if (SteamIntegration.getInstance().isAnonymous()) {
                this.activeGroupMode = GroupModes.ByGenre
                this.activeSortMode = SortModes.ByPlaytime
            } else {
                this.activeGroupMode = GroupModes.ByRecency
                this.activeSortMode = SortModes.ByLastPlayed
            }
            this.hasArrangedOnce = true
        }
        // Subsequent loads (layout switch, library reload): re-apply current modes
        this.arrange(this.activeGroupMode, this.activeSortMode)
    }

    private handleArrangementRequested(detail: ArrangementRequestedEvent): void {
        this.activeGroupMode = detail.groupMode
        this.activeSortMode = detail.sortMode
        this.arrange(detail.groupMode, detail.sortMode)
    }

    private arrange(groupMode: GroupMode, sortMode: SortMode): void {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []
        if (games.length === 0) {
            GameSorter.logger.warn('arrange called but no games in DataManager — skipping emit')
            return
        }

        const grouped = resolveGroups([...games] as SteamGameData[], groupMode, sortMode)
        const sections = sortSections(grouped, sortMode)

        EventManager.getInstance().emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
            sections,
            groupMode,
            sortMode,
        })
        GameSorter.logger.debug(
            `SectionsReady emitted: ${sections.length} sections, ` +
            `group=${groupMode}, sort=${sortMode}, ${games.length} games`
        )
    }
}
