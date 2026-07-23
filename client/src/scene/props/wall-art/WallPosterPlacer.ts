/**
 * Places framed local-screenshot posters on the store's back wall. Self-contained per-prop-type
 * placer (mirrors UserPropPlacer's shape) - not an instance of a shared placement system, see
 * docs/plans/placement-anchor-system-plan.md for why that's deferred. Design details (spacing,
 * frame footprint, content selection) live in docs/plans/wall-poster-placement-plan.md.
 *
 * Two independent flows converge on layoutPosters(): screenshot/texture loading (async, one-time -
 * screenshots are static files, not tied to room layout) and wall geometry (from
 * RoomEventTypes.Resized, may fire multiple times). Whichever finishes second triggers the first
 * real layout; textures are never rebuilt on a later resize, only repositioned.
 */

import * as THREE from 'three'
import { EventManager } from '../../../core/EventManager'
import { RoomEventTypes, type RoomResizedEvent } from '../../../types/InteractionEvents'
import { RoomConstants } from '../../RoomManager'
import { LocalScreenshotReader, type LocalScreenshot } from '../../../steam/LocalScreenshotReader'
import { buildPosterTexture } from './PosterTexture'
import { buildPosterFrame, getFrameOuterHeight, FRAME_DEPTH_METERS } from './PosterFrameBuilder'
import { computeWallPosterSlots } from './WallPosterLayout'
import { selectPosterScreenshots } from './PosterSelection'
import { Logger } from '../../../utils/Logger'

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

    private readonly scene: THREE.Scene

    private latestDimensions: { width: number; depth: number } | null = null
    private latestCenterOffset: CenterOffset | null = null
    private rawScreenshots: LocalScreenshot[] | null = null

    private hasStartedBuild = false
    private contentReady = false
    private builtGroups: THREE.Group[] = []
    private lastLayoutKey: string | null = null

    public static getInstance(scene: THREE.Scene): WallPosterPlacer {
        if (!WallPosterPlacer.instance) {
            WallPosterPlacer.instance = new WallPosterPlacer(scene)
        }
        return WallPosterPlacer.instance
    }

    private constructor(scene: THREE.Scene) {
        this.scene = scene

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

    private async buildContentThenLayout(): Promise<void> {
        const slots = computeWallPosterSlots(this.latestDimensions!.width)
        const selected = selectPosterScreenshots(this.rawScreenshots!, slots.length)

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

        const slots = computeWallPosterSlots(dimensions.width)
        const roomWorldOffsetX = this.latestCenterOffset?.x ?? 0
        const roomWorldOffsetY = this.latestCenterOffset?.y ?? 0
        const roomWorldOffsetZ = this.latestCenterOffset
            ? this.latestCenterOffset.z + RoomConstants.STORE_FRONT_OFFSET
            : 0
        const wallLocalZ = -dimensions.depth / 2 + WALL_STANDOFF_METERS + FRAME_DEPTH_METERS

        const placedCount = Math.min(slots.length, this.builtGroups.length)
        for (let index = 0; index < this.builtGroups.length; index++) {
            const group = this.builtGroups[index]
            if (index < placedCount) {
                const centerY = POSTER_BOTTOM_CLEARANCE_METERS + getFrameOuterHeight(group) / 2
                group.position.set(
                    roomWorldOffsetX + slots[index],
                    roomWorldOffsetY + centerY,
                    roomWorldOffsetZ + wallLocalZ
                )
                if (!group.parent) {
                    this.scene.add(group)
                }
            } else if (group.parent) {
                this.scene.remove(group)
            }
        }
    }
}
