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
 * Note: GameDataReady is the definitions-ready seam (steam.games committed),
 * not the terminal artwork/placement completion signal.
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
import { GameEventTypes, UIEventTypes } from '../../types/InteractionEvents'
import { GroupModes, SortModes } from '../../types/LayoutTypes'
import type { GroupMode, SortMode } from '../../types/LayoutTypes'
import type { SectionsReadyEvent, ArrangementRequestedEvent } from '../../types/EnvironmentEvents'
import type { Section } from '../../types/LayoutTypes'
import type { SteamGameData } from '../game-box/types/GameData'
import { SteamIntegration } from '../../steam-integration/SteamIntegration'
import { resolveGroups } from './GroupResolver'
import { sortSections } from './SectionSorter'
import { GameLayoutConstants } from '../props/shared/GameBoxUtils'

const SHELF_BATCH_SIZE = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF
// CONFIG-CANDIDATE(layout-capacity): promote to AppSettings/UI once progressive section loading lands.
const MAX_SHELVES_PER_ARRANGEMENT = 180

// Re-export bucket helpers so existing callers don't break
export {
    RecentlyPlayedBucket,
    getRecencyBucket as getRecentlyPlayedBucket,
    PlaytimeBucket,
    getPlaytimeBucket,
} from './GroupResolver'

export class GameSorter {
    private static readonly logger = Logger.createLogFunctions(GameSorter.name)

    /**
     * Null until first arrangement is applied. Once set (by initial auth-based
     * defaults or by an explicit ArrangementRequested), subsequent GameDataReady
     * events (layout switches, library reloads) re-apply the current modes.
     */
    private activeGroupMode: GroupMode | null = null
    private activeSortMode: SortMode | null = null

    constructor() {
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.GameDataReady,
            this.handleGameDataReady.bind(this)
        )
        EventManager.getInstance().registerEventHandler(
            UIEventTypes.ArrangementRequested,
            (event: CustomEvent<ArrangementRequestedEvent>) => this.handleArrangementRequested(event.detail)
        )
        GameSorter.logger.debug('GameSorter initialized')
    }

    private handleGameDataReady(): void {
        if (this.activeGroupMode === null || this.activeSortMode === null) {
            // First load: choose defaults based on auth state
            if (SteamIntegration.getInstance().isAnonymous()) {
                this.activeGroupMode = GroupModes.ByGenre
                this.activeSortMode = SortModes.ByPlaytime
            } else {
                this.activeGroupMode = GroupModes.ByRecency
                this.activeSortMode = SortModes.ByLastPlayed
            }
        }
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
        const sortedSections = sortSections(grouped, sortMode)
        const sections = this.limitSectionsToShelfBudget(sortedSections, groupMode)

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

    private limitSectionsToShelfBudget(sections: ReadonlyArray<Section>, groupMode: GroupMode): Section[] {
        let usedShelves = 0
        const limited: Section[] = []

        for (const section of sections) {
            const sectionShelves = Math.max(1, Math.ceil(section.games.length / SHELF_BATCH_SIZE))
            if (usedShelves + sectionShelves > MAX_SHELVES_PER_ARRANGEMENT) {
                break
            }
            limited.push(section)
            usedShelves += sectionShelves
        }

        if (limited.length < sections.length) {
            const droppedSections = sections.length - limited.length
            const droppedGames = sections.slice(limited.length).reduce((sum, section) => sum + section.games.length, 0)
            GameSorter.logger.warn(
                `Arrangement capped in ${groupMode}: using ${limited.length}/${sections.length} sections ` +
                `(${usedShelves}/${MAX_SHELVES_PER_ARRANGEMENT} shelves), deferred ${droppedSections} sections ` +
                `(${droppedGames} game placements)`
            )
        }

        return limited
    }
}
