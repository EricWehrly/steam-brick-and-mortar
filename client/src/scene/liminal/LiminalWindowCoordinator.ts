/**
 * LiminalWindowCoordinator
 *
 * Bridges the generic arrangement pipeline (GameSorter -> SectionsReady /
 * SectionsReadyForPlacement) to liminal mode's fixed-size window, per
 * docs/plans/liminal-mode-plan.md §5.3 and P1 ("shelf count is currently
 * derived from library size"). Also owns Story 5's treadmill: advancing the
 * window on each BoundaryCrossed and repointing exactly the recycled slot's
 * shelf pair + boxes.
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
 * The re-emit above is this class's own SectionsReady/SectionsReadyForPlacement
 * emission, which loops back through its own listeners (same event type, same
 * target) — so each handler guards against re-entering on its own synthetic
 * event, or it would recurse into itself indefinitely.
 *
 * Every SectionsReady re-run (resort, filter change, library reload) rebuilds
 * the window fresh from index 0 — "reseed on filter/sort change" — and resets
 * each physical unit's rank back to its starting position, since the old
 * placement run (and every instanceIndex it produced) no longer exists.
 *
 * Recycle correlation: after re-emitting the synthetic SectionsReady, the
 * placement pipeline it triggers is synchronous (ShelfReady ->
 * ShelfLayoutDetermined -> GameBoxSpawner placement -> PlacementResolved),
 * *provided* every window game's artwork was already prefetched — which
 * holds in practice, since ArtworkPrefetchCoordinator prefetches the whole
 * library off raw data-loading batches, independent of what gets placed
 * (see the plan's P5 finding). So immediately after that re-emit returns,
 * DataKey.InstancedArtworkMetadata/InstancedLabelMetadata are fully populated
 * and this class classifies every instance by nearest shelf once. From then
 * on, recycling repoints exactly the 2 shelves + slotsPerUnit*2 boxes that
 * belong to the physical unit being recycled — see "Fork A reposition" (P7)
 * and "targeted repoint" in the plan. A box whose classified kind can't
 * render the newly-assigned game (e.g. an artwork slot landing a game with
 * no prefetched artwork) is left showing its previous occupant until the
 * next recycle — an accepted, bounded staleness rather than new machinery
 * to eliminate it (dual-reserving an artwork + label instance per box).
 */

import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import {
    GameEventTypes,
    UIEventTypes,
    GameRenderEventTypes,
    StorePropsEventTypes,
    type PlacementRepointRequestedEvent,
    type ShelfUnitRepositionRequestedEvent,
} from '../../types/InteractionEvents'
import type { SectionsReadyEvent, SectionsReadyForPlacementEvent, LayoutRequestedEvent } from '../../types/EnvironmentEvents'
import type { GroupMode, Section, SortMode } from '../../types/LayoutTypes'
import type { SteamGameData } from '../game-box/types/GameData'
import { LayoutModes } from '../../types/LayoutTypes'
import type { InstanceMetadata } from '../../debug/GameFinder'
import { LiminalWindow } from './LiminalWindow'
import { computeSlotsPerShelf } from '../props/shared/StockStrategy'
import { ShelfSurfaceUtils } from '../props/shared/ShelfSurfaceUtils'
import {
    LiminalCorridorLayout,
    LIMINAL_DEPTH_SLOTS,
    CORRIDOR_UNIT_SPACING_Z,
    LEFT_FACING_ROTATION_Y,
    RIGHT_FACING_ROTATION_Y,
    computeUnitTransform,
    type CorridorSide,
} from './LiminalCorridorLayout'
import { LiminalEventTypes, type BoundaryCrossedEvent, computeSlotIndexForWorldZ } from './LiminalBoundaryTracker'

const LIMINAL_WINDOW_SECTION_ID = 'liminal-window'

interface ClassifiedInstance {
    instanceIndex: number
    kind: 'artwork' | 'label'
    /** Mutated in place as this instance's shelf recycles, so it always reflects current world position. */
    position: THREE.Vector3
}

export class LiminalWindowCoordinator {
    private isLiminalActive = false
    private isPublishingWindowedPlacement = false
    private isPublishingWindowedSections = false

    private flatGames: SteamGameData[] = []
    private slotsPerUnit = 0
    /** Physical unit i's current rank — see LiminalCorridorLayout.computeSlotWorldZ. */
    private unitRanks: number[] = []
    /** shelfIndex -> its boxes, classified once per seed from DataManager's instance metadata. */
    private shelfInstances: Map<number, ClassifiedInstance[]> = new Map()

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
        EventManager.getInstance().registerEventHandler<BoundaryCrossedEvent>(
            LiminalEventTypes.BoundaryCrossed,
            this.handleBoundaryCrossed.bind(this)
        )
    }

    private handleLayoutRequested(event: CustomEvent<LayoutRequestedEvent>): void {
        this.isLiminalActive = event.detail.layoutMode === LayoutModes.Liminal
    }

    private handleSectionsReadyForPlacement(event: CustomEvent<SectionsReadyForPlacementEvent>): void {
        if (!this.isLiminalActive || this.isPublishingWindowedPlacement) return
        const { groupMode, sortMode, sections } = event.detail
        event.stopImmediatePropagation()

        this.flatGames = sections.flatMap(({ section }) => section.games) as SteamGameData[]
        this.slotsPerUnit = computeSlotsPerShelf(
            LiminalCorridorLayout.createStockStrategy(),
            ShelfSurfaceUtils.findShelfSurfaces(null, true).length
        )
        this.unitRanks = Array.from({ length: LIMINAL_DEPTH_SLOTS }, (_, i) => i)
        this.shelfInstances.clear()

        const windowSection = this.buildWindowedSection(groupMode, sortMode)

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
        const { groupMode, sortMode } = event.detail
        event.stopImmediatePropagation()

        const windowSection = this.buildWindowedSection(groupMode, sortMode)

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

        // The synthetic SectionsReady above synchronously drives ShelfLayoutCoordinator
        // -> ShelfReady/ShelfLayoutDetermined -> GameBoxSpawner's placement (see class doc).
        this.classifyShelfInstances()
        this.alignWindowToPlayer()
    }

    /**
     * LiminalCorridorLayout.computeShelves() always seeds ranks 0..LIMINAL_DEPTH_SLOTS-1 —
     * it has to stay a pure, player-position-agnostic function to remain a generic
     * ILayoutDefinition. That places the whole window ahead of wherever the player
     * actually is (e.g. at spawn, ahead of the entrance) rather than centered on them.
     * Once per seed, shift every physical unit's rank by the same delta so the window
     * ends up centered (2 behind, 2 ahead for LIMINAL_DEPTH_SLOTS=5) on the player's
     * *current* slot — reusing the same reposition/repoint machinery advance() uses
     * for a single unit, just applied to all of them at once.
     */
    private alignWindowToPlayer(): void {
        const camera = DataManager.getInstance().get<THREE.Camera>(DataKey.MainCamera)
        if (!camera) return

        const middleUnit = Math.floor(LIMINAL_DEPTH_SLOTS / 2)
        const desiredCenterRank = computeSlotIndexForWorldZ(camera.position.z)
        const delta = desiredCenterRank - this.unitRanks[middleUnit]
        if (delta === 0) return

        const zDelta = -delta * CORRIDOR_UNIT_SPACING_Z
        const window = new LiminalWindow(this.flatGames, this.slotsPerUnit, LIMINAL_DEPTH_SLOTS)

        for (let unit = 0; unit < LIMINAL_DEPTH_SLOTS; unit++) {
            const newRank = this.unitRanks[unit] + delta
            this.unitRanks[unit] = newRank

            const leftShelfIndex = unit * 2
            const rightShelfIndex = unit * 2 + 1
            this.repositionShelf(leftShelfIndex, newRank, 'left')
            this.repositionShelf(rightShelfIndex, newRank, 'right')

            const slotGames = window.gamesForSlot(newRank)
            this.repointShelf(leftShelfIndex, 'left', slotGames.slice(0, this.slotsPerUnit), zDelta)
            this.repointShelf(rightShelfIndex, 'right', slotGames.slice(this.slotsPerUnit), zDelta)
        }
    }

    private buildWindowedSection(groupMode: GroupMode, sortMode: SortMode): Section {
        const window = new LiminalWindow(this.flatGames, this.slotsPerUnit, LIMINAL_DEPTH_SLOTS)
        return {
            name: '',
            games: window.allWindowGames(),
            groupMode,
            sortMode,
        }
    }

    private classifyShelfInstances(): void {
        this.shelfInstances.clear()
        if (this.flatGames.length === 0) return

        const shelfPositions = this.currentShelfPositions()
        const dataManager = DataManager.getInstance()
        const artworkMeta = dataManager.get<Map<number, InstanceMetadata>>(DataKey.InstancedArtworkMetadata)
        const labelMeta = dataManager.get<Map<number, InstanceMetadata>>(DataKey.InstancedLabelMetadata)

        this.classifyMetadataMap(artworkMeta, 'artwork', shelfPositions)
        this.classifyMetadataMap(labelMeta, 'label', shelfPositions)
    }

    private classifyMetadataMap(
        metadata: Map<number, InstanceMetadata> | null | undefined,
        kind: 'artwork' | 'label',
        shelfPositions: ReadonlyArray<THREE.Vector3>
    ): void {
        if (!metadata) return
        for (const [instanceIndex, meta] of metadata) {
            const shelfIndex = this.nearestShelfIndex(meta.position, shelfPositions)
            const entries = this.shelfInstances.get(shelfIndex) ?? []
            entries.push({ instanceIndex, kind, position: meta.position.clone() })
            this.shelfInstances.set(shelfIndex, entries)
        }
    }

    private nearestShelfIndex(position: THREE.Vector3, shelfPositions: ReadonlyArray<THREE.Vector3>): number {
        let nearest = 0
        let nearestDistSq = Infinity
        for (let i = 0; i < shelfPositions.length; i++) {
            const dx = position.x - shelfPositions[i].x
            const dz = position.z - shelfPositions[i].z
            const distSq = dx * dx + dz * dz
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq
                nearest = i
            }
        }
        return nearest
    }

    /** Shelf index i pairs to physical unit floor(i/2), side 'left' if even else 'right'. */
    private currentShelfPositions(): THREE.Vector3[] {
        const positions: THREE.Vector3[] = new Array(LIMINAL_DEPTH_SLOTS * 2)
        for (let unit = 0; unit < LIMINAL_DEPTH_SLOTS; unit++) {
            positions[unit * 2] = computeUnitTransform(this.unitRanks[unit], 'left').position
            positions[unit * 2 + 1] = computeUnitTransform(this.unitRanks[unit], 'right').position
        }
        return positions
    }

    private handleBoundaryCrossed(event: CustomEvent<BoundaryCrossedEvent>): void {
        if (!this.isLiminalActive || this.flatGames.length === 0) return
        this.advance(event.detail.direction)
    }

    private advance(direction: 'forward' | 'backward'): void {
        const physicalUnit = direction === 'forward' ? this.indexOfMinRank() : this.indexOfMaxRank()
        const oldRank = this.unitRanks[physicalUnit]
        const newRank = direction === 'forward'
            ? Math.max(...this.unitRanks) + 1
            : Math.min(...this.unitRanks) - 1
        this.unitRanks[physicalUnit] = newRank

        const zDelta = -(newRank - oldRank) * CORRIDOR_UNIT_SPACING_Z
        const leftShelfIndex = physicalUnit * 2
        const rightShelfIndex = physicalUnit * 2 + 1

        this.repositionShelf(leftShelfIndex, newRank, 'left')
        this.repositionShelf(rightShelfIndex, newRank, 'right')

        const window = new LiminalWindow(this.flatGames, this.slotsPerUnit, LIMINAL_DEPTH_SLOTS)
        const slotGames = window.gamesForSlot(newRank)
        const leftGames = slotGames.slice(0, this.slotsPerUnit)
        const rightGames = slotGames.slice(this.slotsPerUnit)

        this.repointShelf(leftShelfIndex, 'left', leftGames, zDelta)
        this.repointShelf(rightShelfIndex, 'right', rightGames, zDelta)
    }

    private indexOfMinRank(): number {
        let index = 0
        for (let i = 1; i < this.unitRanks.length; i++) {
            if (this.unitRanks[i] < this.unitRanks[index]) index = i
        }
        return index
    }

    private indexOfMaxRank(): number {
        let index = 0
        for (let i = 1; i < this.unitRanks.length; i++) {
            if (this.unitRanks[i] > this.unitRanks[index]) index = i
        }
        return index
    }

    private repositionShelf(shelfIndex: number, rank: number, side: CorridorSide): void {
        const { position, rotationY } = computeUnitTransform(rank, side)
        EventManager.getInstance().emit<ShelfUnitRepositionRequestedEvent>(
            StorePropsEventTypes.ShelfUnitRepositionRequested,
            { shelfIndex, position, rotationY }
        )
    }

    private repointShelf(
        shelfIndex: number,
        side: CorridorSide,
        games: ReadonlyArray<Readonly<SteamGameData>>,
        zDelta: number
    ): void {
        const instances = this.shelfInstances.get(shelfIndex)
        if (!instances) return

        const rotationY = side === 'left' ? LEFT_FACING_ROTATION_Y : RIGHT_FACING_ROTATION_Y
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY)

        const count = Math.min(instances.length, games.length)
        for (let i = 0; i < count; i++) {
            const entry = instances[i]
            entry.position.z += zDelta
            const game = games[i]
            const appid = typeof game.appid === 'number' ? game.appid : 0

            EventManager.getInstance().emit<PlacementRepointRequestedEvent>(GameRenderEventTypes.PlacementRepointRequested, {
                instanceIndex: entry.instanceIndex,
                kind: entry.kind,
                appid,
                gameName: game.name,
                position: entry.position.clone(),
                rotation,
            })
        }
    }
}
