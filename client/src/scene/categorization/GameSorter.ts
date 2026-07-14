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
 * Default arrangement, first qualifying rank wins (see docs/plans/taxonomy-data-event-plan.md
 * "Preference order, codified once"):
 *   1. GroupMode.ByUserCollection + SortMode.ByLastPlayed  — if user-collection coverage across
 *      the current library crosses AppSettings.taxonomyCoverageThreshold (default 50%).
 *      Desktop-only in practice (user_collections is only ever populated by the local-scan
 *      channel), but the check itself is presence-driven, not a platform check.
 *   2. GroupMode.ByRecency + SortMode.ByLastPlayed  — authenticated, no qualifying collection data.
 *   3. GroupMode.ByGenre + SortMode.ByPlaytime  — anonymous/demo fallback, unchanged.
 *
 * Re-exports bucket helpers (moved to GroupResolver) for backward-compat callers.
 */

import { EventManager } from '../../core/EventManager'
import { DataManager } from '../../core/data/DataManager'
import { AppSettings } from '../../core/AppSettings'
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
// export is only for test
export const ARRANGEMENT_SHELF_CAP = MAX_SHELVES_PER_ARRANGEMENT
const SECTION_TRIM_PERCENT_PER_PASS = 10
const MIN_SHELVES_PER_RETAINED_SECTION = 1

type SectionPlacementPlanRow = {
    sectionId: string
    requestedShelves: number
    allocatedShelves: number
    shelfCapacity: number
    requestedGames: number
    allocatedGames: number
    deferredGames: number
}

type PlacementPlanTotals = {
    totalAllocatedSections: number
    totalAllocatedShelves: number
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
            const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []
            const defaults = this.chooseDefaultModes(games)
            this.activeGroupMode = defaults.groupMode
            this.activeSortMode = defaults.sortMode
        }
        this.arrange(this.activeGroupMode, this.activeSortMode)
    }

    /** First qualifying rank wins - see the class doc comment for the full preference order. */
    private chooseDefaultModes(games: SteamGameData[]): { groupMode: GroupMode; sortMode: SortMode } {
        if (this.hasQualifyingUserCollectionCoverage(games)) {
            return { groupMode: GroupModes.ByUserCollection, sortMode: SortModes.ByLastPlayed }
        }
        if (!SteamIntegration.getInstance().isAnonymous()) {
            return { groupMode: GroupModes.ByRecency, sortMode: SortModes.ByLastPlayed }
        }
        return { groupMode: GroupModes.ByGenre, sortMode: SortModes.ByPlaytime }
    }

    private hasQualifyingUserCollectionCoverage(games: SteamGameData[]): boolean {
        if (games.length === 0) return false
        const withCollections = games.filter(game => (game.user_collections?.length ?? 0) > 0).length
        const coverage = withCollections / games.length
        return coverage >= AppSettings.get('taxonomyCoverageThreshold')
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
        const sectionPlans = this.buildSectionPlacementPlan(computedSections)
        const allocatedSections = this.buildAllocatedSections(computedSections, sectionPlans)
        const sections = allocatedSections.map(({ section }) => section)

        EventManager.getInstance().emit<SectionsComputedEvent>(GameEventTypes.SectionsComputed, {
            groupMode,
            sortMode,
            sections: computedSections,
        })

        EventManager.getInstance().emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, {
            groupMode,
            sortMode,
            sections: allocatedSections,
        })

        EventManager.getInstance().emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
            sections,
            groupMode,
            sortMode,
        })
        GameSorter.logger.debug(
            `Arrangement emitted: ${sections.length} sections, ` +
            `group=${groupMode}, sort=${sortMode}, ${games.length} games`
        )
    }

    private buildSectionPlacementPlan(
        sections: ReadonlyArray<{ sectionId: string; section: Section }>
    ): SectionPlacementPlanRow[] {
        const sectionPlans: SectionPlacementPlanRow[] = sections.map(({ sectionId, section }) => ({
            sectionId,
            requestedShelves: Math.max(0, Math.ceil(section.games.length / SHELF_BATCH_SIZE)),
            allocatedShelves: 0,
            shelfCapacity: SHELF_BATCH_SIZE,
            requestedGames: section.games.length,
            allocatedGames: 0,
            deferredGames: 0,
        }))
        const totalRequestedShelves = this.sumRequestedShelves(sectionPlans)

        const allocatedShelvesBySection = sectionPlans.map(sectionPlan => sectionPlan.requestedShelves)
        this.trimShelvesToCap(allocatedShelvesBySection, totalRequestedShelves)

        const {
            totalAllocatedSections,
            totalAllocatedShelves,
        } = this.applyAllocatedShelvesToPlan(sectionPlans, allocatedShelvesBySection)

        if (totalAllocatedSections < sections.length) {
            GameSorter.logger.warn(
                `Arrangement capped: using ${totalAllocatedSections}/${sections.length} sections ` +
                `(${totalAllocatedShelves}/${MAX_SHELVES_PER_ARRANGEMENT} shelves)`
            )
        }

        return sectionPlans
    }

    private sumRequestedShelves(sectionPlans: ReadonlyArray<SectionPlacementPlanRow>): number {
        let totalRequestedShelves = 0
        for (const sectionPlan of sectionPlans) {
            totalRequestedShelves += sectionPlan.requestedShelves
        }
        return totalRequestedShelves
    }

    private applyAllocatedShelvesToPlan(
        sectionPlans: SectionPlacementPlanRow[],
        allocatedShelvesBySection: ReadonlyArray<number>
    ): PlacementPlanTotals {
        let totalAllocatedSections = 0
        let totalAllocatedShelves = 0

        for (let sectionIndex = 0; sectionIndex < sectionPlans.length; sectionIndex++) {
            const plan = sectionPlans[sectionIndex]
            const allocatedShelves = allocatedShelvesBySection[sectionIndex]
            const allocatedGames = Math.min(plan.requestedGames, allocatedShelves * SHELF_BATCH_SIZE)
            const deferredGames = plan.requestedGames - allocatedGames

            plan.allocatedShelves = allocatedShelves
            plan.allocatedGames = allocatedGames
            plan.deferredGames = deferredGames

            if (allocatedShelves > 0) {
                totalAllocatedShelves += allocatedShelves
                totalAllocatedSections++
            }
        }

        return {
            totalAllocatedSections,
            totalAllocatedShelves,
        }
    }

    private trimShelvesToCap(allocatedShelvesBySection: number[], totalRequestedShelves: number) {
        const exceedsShelfCap = totalRequestedShelves > MAX_SHELVES_PER_ARRANGEMENT
        let shelvesToTrim = Math.max(0, totalRequestedShelves - MAX_SHELVES_PER_ARRANGEMENT)
        const nonEmptySectionCount = allocatedShelvesBySection.filter(s => s > 0).length
        const sectionCountExceedsShelfCap = nonEmptySectionCount > MAX_SHELVES_PER_ARRANGEMENT

        if (exceedsShelfCap) {
            GameSorter.logger.warn(
                `Shelf cap exceeded: requested ${totalRequestedShelves} shelves, cap ${MAX_SHELVES_PER_ARRANGEMENT}; trimming ${shelvesToTrim} shelves`
            )
        }

        if (sectionCountExceedsShelfCap) {
            shelvesToTrim = this.trimTrailingSectionOverflow(allocatedShelvesBySection, shelvesToTrim)
            GameSorter.logger.warn(
                `Edge case: minimum one-shelf-per-section requirement (${nonEmptySectionCount}) exceeds shelf cap ${MAX_SHELVES_PER_ARRANGEMENT}; trimming tail sections by current sort order before proportional passes`
            )
        }

        shelvesToTrim = this.trimLargestSectionsByPass(allocatedShelvesBySection, shelvesToTrim)
        shelvesToTrim = this.applySafetyTrim(allocatedShelvesBySection, shelvesToTrim)

        if (shelvesToTrim > 0) {
            GameSorter.logger.warn(`Safety trim exhausted while ${shelvesToTrim} shelves still over cap`)
        }
    }

    private trimTrailingSectionOverflow(allocatedShelvesBySection: number[], shelvesToTrim: number): number {
        for (let sectionIndex = MAX_SHELVES_PER_ARRANGEMENT; sectionIndex < allocatedShelvesBySection.length; sectionIndex++) {
            shelvesToTrim -= allocatedShelvesBySection[sectionIndex]
            allocatedShelvesBySection[sectionIndex] = 0
        }
        return Math.max(0, shelvesToTrim)
    }

    private trimLargestSectionsByPass(allocatedShelvesBySection: number[], shelvesToTrim: number): number {
        while (shelvesToTrim > 0) {
            const trimmableSections = allocatedShelvesBySection
                .map((allocatedShelves, sectionIndex) => ({ allocatedShelves, sectionIndex }))
                .filter(({ allocatedShelves }) => allocatedShelves > MIN_SHELVES_PER_RETAINED_SECTION)
                .sort((left, right) => {
                    if (right.allocatedShelves !== left.allocatedShelves) {
                        return right.allocatedShelves - left.allocatedShelves
                    }
                    return left.sectionIndex - right.sectionIndex
                })

            if (trimmableSections.length === 0) {
                break
            }

            let trimmedThisPass = 0

            for (const { sectionIndex, allocatedShelves } of trimmableSections) {
                if (shelvesToTrim <= 0) {
                    break
                }

                const proportionalTrim = Math.floor(allocatedShelves * SECTION_TRIM_PERCENT_PER_PASS / 100)
                const passTrim = Math.max(1, proportionalTrim)
                const maxTrimForSection = Math.max(0, allocatedShelves - MIN_SHELVES_PER_RETAINED_SECTION)
                const appliedTrim = Math.min(passTrim, maxTrimForSection, shelvesToTrim)

                if (appliedTrim <= 0) {
                    continue
                }

                allocatedShelvesBySection[sectionIndex] -= appliedTrim
                shelvesToTrim -= appliedTrim
                trimmedThisPass += appliedTrim
            }

            if (trimmedThisPass === 0) {
                break
            }
        }

        return shelvesToTrim
    }

    private applySafetyTrim(allocatedShelvesBySection: number[], shelvesToTrim: number): number {
        for (let sectionIndex = allocatedShelvesBySection.length - 1; sectionIndex >= 0 && shelvesToTrim > 0; sectionIndex--) {
            const trim = Math.min(allocatedShelvesBySection[sectionIndex], shelvesToTrim)
            allocatedShelvesBySection[sectionIndex] -= trim
            shelvesToTrim -= trim
        }
        return shelvesToTrim
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
