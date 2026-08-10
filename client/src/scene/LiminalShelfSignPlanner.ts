/**
 * LiminalShelfSignPlanner
 *
 * Liminal's shelf-sign consumer — mirrors ShelfSignPlanner's role (place a section sign per
 * shelf) but for a corridor where shelf content recycles continuously instead of being placed
 * once per layout run. Deliberately not merged into ShelfSignPlanner: different trigger
 * (ShelfSectionRepointed vs. a one-time SectionsReady placement pass), different lifecycle. See
 * docs/plans/liminal-shelf-signs-plan.md §3.3/§5.
 */

import { EventManager } from '../core/EventManager'
import { ShelfAnchorRegistry } from './shelves/ShelfAnchorRegistry'
import { SceneSignManager, SignStyles } from './SceneSignManager'
import {
    GameRenderEventTypes,
    StorePropsEventTypes,
    UIEventTypes,
    type ShelfSectionRepointedEvent,
} from '../types/InteractionEvents'
import type { LayoutRequestedEvent } from '../types/EnvironmentEvents'
import { LayoutModes } from '../types/LayoutTypes'

/** Matches ShelfSignPlanner's above-shelf mount constants — same physical shelf geometry. */
const SHELF_SIGN_Y_OFFSET = 2.02
const SHELF_SIGN_FRONT_OFFSET = 0.28

export class LiminalShelfSignPlanner {
    private get signSystem(): SceneSignManager { return SceneSignManager.instance }
    private readonly shelfAnchorRegistry: ShelfAnchorRegistry

    private isLiminalActive = false
    private readonly currentSectionByShelfIndex = new Map<number, string | null>()
    private readonly placedSignIdentifierByShelfIndex = new Map<number, string>()

    constructor() {
        // Grabbed eagerly (not lazily via a getter) so ShelfAnchorRegistry is constructed, and
        // subscribed to ShelfReady, before this class registers its own handlers — otherwise a
        // ShelfReady that fires before this class's first resolve() call would be dropped by a
        // registry that doesn't exist yet. Same ordering guarantee UserPropPlacer relies on.
        this.shelfAnchorRegistry = ShelfAnchorRegistry.getInstance()

        EventManager.getInstance().registerEventHandler<LayoutRequestedEvent>(
            UIEventTypes.LayoutRequested,
            this.handleLayoutRequested.bind(this)
        )
        EventManager.getInstance().registerEventHandler<ShelfSectionRepointedEvent>(
            GameRenderEventTypes.ShelfSectionRepointed,
            this.handleShelfSectionRepointed.bind(this)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            this.reset.bind(this)
        )
    }

    private handleLayoutRequested(event: CustomEvent<LayoutRequestedEvent>): void {
        const wasLiminalActive = this.isLiminalActive
        this.isLiminalActive = event.detail.layoutMode === LayoutModes.Liminal
        if (wasLiminalActive && !this.isLiminalActive) {
            this.reset()
        }
    }

    private handleShelfSectionRepointed(event: CustomEvent<ShelfSectionRepointedEvent>): void {
        if (!this.isLiminalActive) return
        const { shelfIndex, sectionName } = event.detail

        // Dedupe: most recycles land within the same section, and re-placing on every one
        // would flicker the sign for no visible reason.
        if (this.currentSectionByShelfIndex.get(shelfIndex) === sectionName) return
        this.currentSectionByShelfIndex.set(shelfIndex, sectionName)

        this.removeSignForShelf(shelfIndex)

        // Empty slot ('' name for ungrouped, or the catch-all 'Other' bucket) gets no sign —
        // same skip rule ShelfSignPlanner already applies to arc/row/spoke section signs.
        if (!sectionName || sectionName === 'Other') return

        const resolved = this.shelfAnchorRegistry.resolve(shelfIndex, {
            x: 0,
            y: SHELF_SIGN_Y_OFFSET,
            z: SHELF_SIGN_FRONT_OFFSET,
        })
        if (!resolved) return

        const identifier = `liminal-shelf-sign-${shelfIndex}`
        this.signSystem.placeSign('canvas', {
            uniqueIdentifier: identifier,
            text: sectionName,
            anchorPosition: resolved.position,
            // 'wall' mount applies no further offset — resolve() above already composed the
            // full shelf-frame position, so the sign's anchorPosition is final.
            mount: { style: 'wall', signFacingY: resolved.rotationY },
            style: { ...SignStyles.Category, fontSize: 0.16, padding: '0.08 0.14' },
        })
        this.placedSignIdentifierByShelfIndex.set(shelfIndex, identifier)
    }

    private removeSignForShelf(shelfIndex: number): void {
        const identifier = this.placedSignIdentifierByShelfIndex.get(shelfIndex)
        if (!identifier) return
        this.signSystem.removeSignById(identifier)
        this.placedSignIdentifierByShelfIndex.delete(shelfIndex)
    }

    private reset(): void {
        for (const identifier of this.placedSignIdentifierByShelfIndex.values()) {
            this.signSystem.removeSignById(identifier)
        }
        this.placedSignIdentifierByShelfIndex.clear()
        this.currentSectionByShelfIndex.clear()
    }

    public dispose(): void {
        this.reset()
    }
}
