/**
 * Places framed local-screenshot posters across the store's back, left, and right walls (the
 * front is the glass storefront - not a poster surface). Self-contained per-prop-type placer
 * (mirrors UserPropPlacer's shape) - not an instance of a shared placement system, see
 * docs/plans/placement-anchor-system-plan.md for why that's deferred. Design details (spacing,
 * frame footprint, content selection) live in docs/plans/wall-poster-placement-plan.md.
 *
 * Two independent flows converge on layoutBuiltGroups(): screenshot/texture loading (async,
 * one-time - screenshots are static files, not tied to room layout) and wall geometry (from
 * RoomEventTypes.Resized, may fire multiple times). Whichever finishes second triggers the first
 * real layout; textures are never rebuilt on a later resize, only repositioned.
 *
 * Walls fill in WALL_TARGETS order (back, then left, then right): with fewer screenshots than
 * total capacity, the back wall - the one visible on entry - fills first.
 */

import * as THREE from 'three'
import { EventManager } from '../../../core/EventManager'
import { RoomEventTypes, type RoomResizedEvent } from '../../../types/InteractionEvents'
import { LocalScreenshotReader, type LocalScreenshot } from '../../../steam/LocalScreenshotReader'
import { buildPosterTexture } from './PosterTexture'
import { buildPosterFrame, getFrameOuterHeight, FRAME_DEPTH_METERS } from './PosterFrameBuilder'
import { computeWallPosterSlots } from './WallPosterLayout'
import { WALL_TARGETS, type RoomSpan } from './WallTargets'
import { selectPosterScreenshots } from './PosterSelection'
import { Logger } from '../../../utils/Logger'
import { DataManager, DataKey } from '../../../core/data'

/** Gap between the frame's back and the wall surface - avoids z-fighting with the wall material. */
const WALL_STANDOFF_METERS = 0.02

/** Distance from the floor to the *bottom* edge of every poster's frame, regardless of room
 *  height. Anchoring by a consistent floor clearance (rather than a shared center height) keeps
 *  bottoms level across posters even though outer height varies by aspect preset (see
 *  PosterFrameBuilder) - aligning by center instead would leave shorter/taller frames with
 *  visibly uneven bottoms. First-guess value, meant to be eyeballed/adjusted against the real
 *  scene, not final - see docs/plans/wall-poster-placement-plan.md. */
const POSTER_BOTTOM_CLEARANCE_METERS = 1.1

interface CenterOffset {
    x: number
    y: number
    z: number
}

export class WallPosterPlacer {
    private static readonly logger = Logger.createLogFunctions(WallPosterPlacer.name)
    private static instance: WallPosterPlacer | null = null

    private latestDimensions: { width: number; depth: number } | null = null
    private latestCenterOffset: CenterOffset | null = null
    private rawScreenshots: LocalScreenshot[] | null = null

    private hasStartedBuild = false
    private contentReady = false
    private builtGroups: THREE.Group[] = []
    private lastLayoutKey: string | null = null

    public static getInstance(): WallPosterPlacer {
        if (!WallPosterPlacer.instance) {
            WallPosterPlacer.instance = new WallPosterPlacer()
        }
        return WallPosterPlacer.instance
    }

    private constructor() {
        EventManager.getInstance().registerEventHandler(
            RoomEventTypes.Resized,
            this.handleRoomResized.bind(this)
        )

        void this.loadScreenshots()
    }

    private async loadScreenshots(): Promise<void> {
        this.rawScreenshots = await LocalScreenshotReader.listScreenshots()
        this.tryBuildAndLayout()
    }

    private handleRoomResized(event: CustomEvent<RoomResizedEvent>): void {
        this.latestDimensions = event.detail.dimensions
        this.latestCenterOffset = event.detail.centerOffset ?? null
        this.tryBuildAndLayout()
    }

    private tryBuildAndLayout(): void {
        if (!this.latestDimensions || this.rawScreenshots === null) {
            return
        }
        if (!this.hasStartedBuild) {
            this.hasStartedBuild = true
            void this.buildContentThenLayout()
            return
        }
        if (this.contentReady) {
            this.layoutBuiltGroups()
        }
    }

    private buildAllWallSlots(dimensions: RoomSpan): { wall: typeof WALL_TARGETS[number]; slots: number[] }[] {
        return WALL_TARGETS.map(wall => ({ wall, slots: computeWallPosterSlots(wall.span(dimensions)) }))
    }

    private async buildContentThenLayout(): Promise<void> {
        const totalSlotCount = this.buildAllWallSlots(this.latestDimensions!)
            .reduce((sum, entry) => sum + entry.slots.length, 0)
        const selected = selectPosterScreenshots(this.rawScreenshots!, totalSlotCount)

        const groups: THREE.Group[] = []
        for (const screenshot of selected) {
            const bytes = await LocalScreenshotReader.readScreenshotBytes(screenshot.filename)
            if (!bytes) {
                WallPosterPlacer.logger.warn(`Failed to read bytes for ${screenshot.filename}, skipping`)
                continue
            }
            const texture = await buildPosterTexture(bytes)
            groups.push(buildPosterFrame(texture))
        }

        this.builtGroups = groups
        this.contentReady = true
        WallPosterPlacer.logger.debug(`Built ${groups.length} poster frame(s) from ${selected.length} selected screenshot(s)`)
        this.layoutBuiltGroups()
    }

    private layoutBuiltGroups(): void {
        const dimensions = this.latestDimensions
        if (!dimensions) return

        const layoutKey = JSON.stringify({ dimensions, centerOffset: this.latestCenterOffset })
        if (layoutKey === this.lastLayoutKey) return
        this.lastLayoutKey = layoutKey

        const roomFrame = DataManager.getInstance().get<THREE.Group>(DataKey.RoomFrame)
        if (!roomFrame) {
            // Fires from RoomResized, which RoomManager only emits after the room frame
            // exists — absence here means bootstrap ordering broke, not a normal race.
            WallPosterPlacer.logger.warn('layoutBuiltGroups: room frame not published yet')
            return
        }

        const clearance = WALL_STANDOFF_METERS + FRAME_DEPTH_METERS

        // Room-local — the room frame already carries the room's world position/offset,
        // matching how RoomManager builds its own walls (see RoomManager.ensureWalls).
        let groupIndex = 0
        for (const { wall, slots } of this.buildAllWallSlots(dimensions)) {
            for (const slotOffset of slots) {
                if (groupIndex >= this.builtGroups.length) break
                const group = this.builtGroups[groupIndex]
                groupIndex++

                const { x, z } = wall.positionXZ(dimensions, slotOffset, clearance)
                const centerY = POSTER_BOTTOM_CLEARANCE_METERS + getFrameOuterHeight(group) / 2
                group.rotation.y = wall.rotationY
                group.position.set(x, centerY, z)
                if (!group.parent) {
                    roomFrame.add(group)
                }
            }
        }

        for (; groupIndex < this.builtGroups.length; groupIndex++) {
            const leftover = this.builtGroups[groupIndex]
            leftover.parent?.remove(leftover)
        }
    }
}
