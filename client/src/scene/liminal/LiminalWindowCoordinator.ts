/**
 * LiminalWindowCoordinator
 *
 * Bridges the generic arrangement pipeline (GameSorter -> SectionsReady /
 * SectionsReadyForPlacement) to liminal mode's fixed-size window, per
 * docs/plans/liminal-mode-plan.md §5.3 and P1 ("shelf count is currently
 * derived from library size").
 *
 * GameSorter always groups+sorts the *entire* library and has no reason to
 * know liminal exists. ShelfLayoutCoordinator and GameBoxSpawner are generic
 * consumers of SectionsReady/SectionsReadyForPlacement and must stay that way
 * (see "Why the last attempt failed" in the plan). So when liminal is active,
 * this class intercepts those two events before they reach those consumers,
 * replacing GameSorter's library-wide sections with a single synthetic
 * section holding exactly the window's games, then re-emits the same event
 * types so the rest of the placement pipeline runs unmodified.
 *
 * stopImmediatePropagation() is what makes "intercept" real rather than
 * "also emit alongside": without it, ShelfLayoutCoordinator/GameBoxSpawner
 * would first process the library-wide event (spawning placement intents,
 * texture prefetches, GPU uploads for games that are about to be discarded)
 * before this class's corrected re-emit overwrites the result one tick later.
 * That first pass is pure waste, not just harmless — artwork resolution
 * hits the LOD texture pipeline. Suppressing it requires this coordinator's
 * listeners to run *before* ShelfLayoutCoordinator/GameBoxSpawner's, which
 * holds structurally: this class is constructed in SceneCoordinator's
 * constructor, while ShelfLayoutCoordinator and GameBoxSpawner are
 * constructed later during bootstrap (DefaultBootstrapPath / StorePropsCoordinator's
 * SetupRequest handler) — EventTarget invokes listeners in registration order.
 *
 * Story 3 scope: static window (no recycling yet). Every SectionsReady re-run
 * (resort, filter change, library reload) rebuilds the window fresh from
 * index 0, which is exactly "reseed on filter/sort change." Story 5 makes
 * the window stateful (current center slot advances with the player).
 *
 * The re-emit above is this class's own SectionsReady/SectionsReadyForPlacement
 * emission, which loops back through its own listeners (same event type, same
 * target) — so each handler guards against re-entering on its own synthetic
 * event, or it would recurse into itself indefinitely.
 */

import { EventManager } from '../../core/EventManager'
import { GameEventTypes, UIEventTypes } from '../../types/InteractionEvents'
import type { SectionsReadyEvent, SectionsReadyForPlacementEvent, LayoutRequestedEvent } from '../../types/EnvironmentEvents'
import type { GroupMode, Section, SortMode } from '../../types/LayoutTypes'
import type { SteamGameData } from '../game-box/types/GameData'
import { LayoutModes } from '../../types/LayoutTypes'
import { LiminalWindow } from './LiminalWindow'
import { computeSlotsPerShelf } from '../props/shared/StockStrategy'
import { ShelfSurfaceUtils } from '../props/shared/ShelfSurfaceUtils'
import { LiminalCorridorLayout, LIMINAL_DEPTH_SLOTS } from './LiminalCorridorLayout'

const LIMINAL_WINDOW_SECTION_ID = 'liminal-window'

export class LiminalWindowCoordinator {
    private isLiminalActive = false
    private isPublishingWindowedPlacement = false
    private isPublishingWindowedSections = false

    constructor() {
        EventManager.getInstance().registerEventHandler<LayoutRequestedEvent>(
            UIEventTypes.LayoutRequested,
            this.handleLayoutRequested.bind(this)
        )
        EventManager.getInstance().registerEventHandler<SectionsReadyForPlacementEvent>(
            GameEventTypes.SectionsReadyForPlacement,
            this.handleSectionsReadyForPlacement.bind(this)
        )
        EventManager.getInstance().registerEventHandler<SectionsReadyEvent>(
            GameEventTypes.SectionsReady,
            this.handleSectionsReady.bind(this)
        )
    }

    private handleLayoutRequested(event: CustomEvent<LayoutRequestedEvent>): void {
        this.isLiminalActive = event.detail.layoutMode === LayoutModes.Liminal
    }

    private handleSectionsReadyForPlacement(event: CustomEvent<SectionsReadyForPlacementEvent>): void {
        if (!this.isLiminalActive || this.isPublishingWindowedPlacement) return
        const { groupMode, sortMode, sections } = event.detail
        event.stopImmediatePropagation()

        const flatGames = sections.flatMap(({ section }) => section.games) as SteamGameData[]
        const windowSection = this.buildWindowedSection(flatGames, groupMode, sortMode)

        this.isPublishingWindowedPlacement = true
        try {
            EventManager.getInstance().emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, {
                groupMode,
                sortMode,
                sections: [{ sectionId: LIMINAL_WINDOW_SECTION_ID, sectionIndex: 0, section: windowSection }],
            })
        } finally {
            this.isPublishingWindowedPlacement = false
        }
    }

    private handleSectionsReady(event: CustomEvent<SectionsReadyEvent>): void {
        if (!this.isLiminalActive || this.isPublishingWindowedSections) return
        const { groupMode, sortMode, sections } = event.detail
        event.stopImmediatePropagation()

        const flatGames = sections.flatMap((section) => section.games) as SteamGameData[]
        const windowSection = this.buildWindowedSection(flatGames, groupMode, sortMode)

        this.isPublishingWindowedSections = true
        try {
            EventManager.getInstance().emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
                sections: [windowSection],
                groupMode,
                sortMode,
            })
        } finally {
            this.isPublishingWindowedSections = false
        }
    }

    private buildWindowedSection(flatGames: SteamGameData[], groupMode: GroupMode, sortMode: SortMode): Section {
        const slotsPerUnit = computeSlotsPerShelf(
            LiminalCorridorLayout.createStockStrategy(),
            ShelfSurfaceUtils.findShelfSurfaces(null, true).length
        )
        const window = new LiminalWindow(flatGames, slotsPerUnit, LIMINAL_DEPTH_SLOTS)

        return {
            name: '',
            games: window.allWindowGames(),
            groupMode,
            sortMode,
        }
    }
}
