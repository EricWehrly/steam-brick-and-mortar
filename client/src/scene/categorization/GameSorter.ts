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
import type {
    SectionsReadyEvent,
    SectionsReadyForPlacementEvent,
    ArrangementRequestedEvent,
    SectionsComputedEvent,
} from '../../types/EnvironmentEvents'
import type { Section } from '../../types/LayoutTypes'
import type { SteamGameData } from '../game-box/types/GameData'
import { SteamIntegration } from '../../steam-integration/SteamIntegration'
import { resolveGroups } from './GroupResolver'
import { sortSections } from './SectionSorter'
import { GameLayoutConstants } from '../props/shared/GameBoxUtils'

const SHELF_BATCH_SIZE = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF
// CONFIG-CANDIDATE(layout-capacity): promote to AppSettings/UI once progressive section loading lands.
const MAX_GAME_BOX_INSTANCES_PER_ARRANGEMENT = 2000
const MAX_SHELVES_PER_ARRANGEMENT = Math.min(
    180,
    Math.max(1, Math.floor(MAX_GAME_BOX_INSTANCES_PER_ARRANGEMENT / SHELF_BATCH_SIZE))
)

type SectionPlacementPlanRow = {
    sectionId: string
    requestedShelves: number
    allocatedShelves: number
    shelfCapacity: number
    requestedGames: number
    allocatedGames: number
    deferredGames: number
}

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
        const computedSections = sortedSections.map((section, sectionIndex) => ({
            sectionId: this.getSectionId(groupMode, section.name, sectionIndex),
            sectionIndex,
            section,
        }))
        const plan = this.buildSectionPlacementPlan(computedSections)
        const allocatedSections = this.buildAllocatedSections(computedSections, plan.sections)
        const sections = allocatedSections.map(({ section }) => section)

        GameSorter.logger.debug(
            `Arrangement start: games=${games.length}, sections=${sections.length}, group=${groupMode}, sort=${sortMode}`
        )

        EventManager.getInstance().emit<SectionsComputedEvent>(GameEventTypes.SectionsComputed, {
            groupMode,
            sortMode,
            sections: computedSections,
        })
        GameSorter.logger.debug(`Emitted SectionsComputed: sectionCount=${computedSections.length}`)

        EventManager.getInstance().emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, {
            groupMode,
            sortMode,
            sections: allocatedSections,
        })
        GameSorter.logger.debug(`Emitted SectionsReadyForPlacement: sectionCount=${allocatedSections.length}`)

        if (plan.totalAllocatedSections < sortedSections.length) {
            GameSorter.logger.warn(
                `Arrangement capped in ${groupMode}: using ${plan.totalAllocatedSections}/${sortedSections.length} sections ` +
                `(${plan.totalAllocatedShelves}/${MAX_SHELVES_PER_ARRANGEMENT} shelves), deferred ${plan.deferredSections} sections ` +
                `(${plan.deferredGames} game placements)`
            )
        }

        EventManager.getInstance().emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
            sections,
            groupMode,
            sortMode,
        })
        GameSorter.logger.debug(`Emitted SectionsReady: sectionCount=${sections.length}`)
        GameSorter.logger.debug(
            `SectionsReady emitted: ${sections.length} sections, ` +
            `group=${groupMode}, sort=${sortMode}, ${games.length} games`
        )
    }

    private buildSectionPlacementPlan(
        sections: ReadonlyArray<{ sectionId: string; section: Section }>
    ) {
        let usedShelves = 0
        let totalAllocatedSections = 0

        const sectionPlans: SectionPlacementPlanRow[] = []
        let totalRequestedShelves = 0
        let totalRequestedGames = 0
        let totalAllocatedGames = 0

        for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
            const { sectionId, section } = sections[sectionIndex]
            const sectionShelves = Math.max(0, Math.ceil(section.games.length / SHELF_BATCH_SIZE))
            const remainingShelves = Math.max(0, MAX_SHELVES_PER_ARRANGEMENT - usedShelves)
            const allocatedShelves = Math.min(sectionShelves, remainingShelves)
            const allocatedGames = Math.min(section.games.length, allocatedShelves * SHELF_BATCH_SIZE)
            const deferredGames = section.games.length - allocatedGames

            totalRequestedShelves += sectionShelves
            totalRequestedGames += section.games.length
            totalAllocatedGames += allocatedGames

            if (allocatedShelves > 0) {
                usedShelves += allocatedShelves
                totalAllocatedSections++
            }

            sectionPlans.push({
                sectionId,
                requestedShelves: sectionShelves,
                allocatedShelves,
                shelfCapacity: SHELF_BATCH_SIZE,
                requestedGames: section.games.length,
                allocatedGames,
                deferredGames,
            })
        }

        const deferredSections = sectionPlans.filter(section => section.allocatedShelves === 0).length
        const deferredGames = totalRequestedGames - totalAllocatedGames

        return {
            totalAllocatedSections,
            totalRequestedShelves,
            totalAllocatedShelves: usedShelves,
            totalRequestedGames,
            totalAllocatedGames,
            deferredSections,
            deferredGames,
            sections: sectionPlans,
        }
    }

    private buildAllocatedSections(
        sections: ReadonlyArray<{ sectionId: string; sectionIndex: number; section: Section }>,
        plans: ReadonlyArray<SectionPlacementPlanRow>
    ): Array<{ sectionId: string; sectionIndex: number; section: Section }> {
        const planBySectionId = new Map(plans.map((plan) => [plan.sectionId, plan]))
        const allocatedSections: Array<{ sectionId: string; sectionIndex: number; section: Section }> = []

        for (const sectionEntry of sections) {
            const plan = planBySectionId.get(sectionEntry.sectionId)
            if (!plan || plan.allocatedGames <= 0) continue

            const allocatedGames = sectionEntry.section.games.slice(0, plan.allocatedGames)
            allocatedSections.push({
                sectionId: sectionEntry.sectionId,
                sectionIndex: allocatedSections.length,
                section: {
                    ...sectionEntry.section,
                    games: allocatedGames,
                },
            })
        }

        return allocatedSections
    }

    private getSectionId(groupMode: GroupMode, sectionName: string, sectionIndex: number): string {
        const normalizedName = sectionName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'ungrouped'
        return `${groupMode}:${normalizedName}:${sectionIndex}`
    }
}
