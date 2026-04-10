/**
 * SceneSignManager
 *
 * Generic scene-space sign system for category labels.
 * Tech debt link: docs/roadmaps/tech-debt.md → "Category System Tech Debt / SceneSignManager → SceneSignManager rename"
 *
 * A "sign" is a canvas-texture plane mesh with configurable:
 * - Text and color
 * - Mount style: above-shelf, wall-mounted, ceiling-hung
 *
 * This sits on top of SignageRenderer's createSign() primitive.
 * Visual styles (Blockbuster, neon, flat, etc.) are applied by passing
 * a SignStyle config. Multiple realizations share one code path.
 *
 * Phase 1: above-shelf signs only.
 * Phase 2: wall + ceiling mount styles.
 */

import * as THREE from 'three'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'
import { EventManager } from '../core/EventManager'
import { SignageRenderer, type SignageConfig } from './SignageRenderer'
import {
    GameEventTypes,
    type GamesSortEvent,
    StorePropsEventTypes,
    type ShelfCreatedEvent,
} from '../types/InteractionEvents'
import {
    getRecentlyPlayedBucket,
    getBucketLabel,
    RecentlyPlayedBucket,
} from './categorization/CategoryAssigner'
import type { SteamGameData } from './game-box/types/GameData'
import { ShelfSurfaceUtils } from './props/shared/ShelfSurfaceUtils'
import { RoomConstants } from './RoomManager'

// ─── Style definitions ────────────────────────────────────────────────────────

export interface SignStyle {
    backgroundColor: number
    textColor: number
    width: number
    height: number
}

export const SignStyles = {
    /** Default Blockbuster-style blue sign */
    Category: {
        backgroundColor: 0x1a3a5c,
        textColor: 0xffffff,
        width: 2.2,
        height: 0.38,
    } satisfies SignStyle,

    /** Accent color — for featured/highlighted sections */
    Featured: {
        backgroundColor: 0x8b0000,
        textColor: 0xffffff,
        width: 2.2,
        height: 0.38,
    } satisfies SignStyle,

    /** Small orientation/debug label */
    ShelfEndLabel: {
        backgroundColor: 0x2a2a2a,
        textColor: 0xffffff,
        width: 0.4,
        height: 0.25,
    } satisfies SignStyle,
} as const

// ─── Mount styles ─────────────────────────────────────────────────────────────

export type SignMountStyle = 'above-shelf' | 'wall' | 'ceiling'

export interface SignMount {
    style: SignMountStyle
    /**
     * Y offset from the mount anchor point.
     * For above-shelf: offset above the shelf top (default 0.3m).
     * For ceiling: offset below ceiling plane.
     * For wall: offset from wall surface.
     */
    yOffset?: number
    /**
     * For above-shelf mounts, push sign out from shelf face.
     * Uses signFacingY to compute local face direction.
     */
    frontOffset?: number
    /**
     * Yaw (radians) the sign should face.
     * Useful for curved/arc layouts where shelves are rotated.
     */
    signFacingY?: number
}

// ─── Category sign descriptor ─────────────────────────────────────────────────

export interface CategorySignDescriptor {
    label: string
    text?: string   // display text — defaults to label if omitted
    anchorPosition: THREE.Vector3   // World position to anchor sign to (e.g. shelf center)
    mount: SignMount
    style?: SignStyle
}

// ─── System ───────────────────────────────────────────────────────────────────

export class SceneSignManager {
    private static _instance: SceneSignManager | null = null

    /** Shared instance for scene-level sign management. */
    static get instance(): SceneSignManager {
        if (!SceneSignManager._instance) {
            SceneSignManager._instance = new SceneSignManager()
        }
        return SceneSignManager._instance
    }

    private readonly renderer: SignageRenderer
    private readonly scene: THREE.Scene
    private readonly signs: Map<string, THREE.Mesh> = new Map()
    private readonly shelfTransforms = new Map<number, { position: THREE.Vector3; rotationY: number }>()
    private readonly timeBucketSignLabels = new Set<string>()
    private sortedGames: ReadonlyArray<Readonly<SteamGameData>> = []
    private hasRecentlyPlayedData = false
    private lastPlacedBucket: RecentlyPlayedBucket | null = null

    private static readonly ABOVE_SHELF_DEFAULT_Y_OFFSET = 0.6
    private static readonly SIGN_Z_FACE_PLAYER = 0.01 // slight forward push to avoid z-fighting

    // Tech debt link: docs/roadmaps/tech-debt.md →
    // - "Category System Tech Debt / SceneSignManager: scene access pattern / SceneManager"
    // - "Category System Tech Debt / SignageRenderer: singleton vs instance"
    constructor() {
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
        if (!scene) throw new Error('SceneSignManager: scene not registered in DataManager (DataKey.MainScene)')
        this.scene = scene
        this.renderer = new SignageRenderer()

        // Self-subscribe to shelf creation events to place end-cap labels automatically.
        // This keeps sign placement logic where it belongs — in the sign manager.
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfCreated,
            (event: CustomEvent<ShelfCreatedEvent>) => {
                const { position, shelfIndex, shelfRotationY, batchIndex } = event.detail
                const rotY = shelfRotationY ?? 0
                const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)
                const topSurface = shelfSurfaces[0]
                if (topSurface) {
                    this.placeShelfEndCapLabels(shelfIndex ?? 0, position as THREE.Vector3, rotY, topSurface)
                }

                const shelfId = batchIndex ?? shelfIndex ?? 0
                this.shelfTransforms.set(shelfId, {
                    position: (position as THREE.Vector3).clone(),
                    rotationY: rotY,
                })

                if (this.hasRecentlyPlayedData && this.sortedGames.length > 0) {
                    this.placeTimeBucketSignForShelf(shelfId, position as THREE.Vector3, rotY)
                }
            }
        )

        EventManager.getInstance().registerEventHandler(
            GameEventTypes.GamesSort,
            (event: CustomEvent<GamesSortEvent>) => {
                this.sortedGames = event.detail.sortedGames
                this.hasRecentlyPlayedData = event.detail.hasRecentlyPlayedData
                this.lastPlacedBucket = null
                this.clearTimeBucketSigns()
                this.syncRecentlyPlayedCeilingSign()
                this.replayTimeBucketSignsFromCreatedShelves()
            }
        )
    }

    /**
     * Create or update a category sign.
     * If a sign with this label already exists, it is replaced.
     */
    public setSign(descriptor: CategorySignDescriptor): THREE.Mesh {
        // Remove existing sign with same label if present
        this.removeSign(descriptor.label)

        const style = descriptor.style ?? SignStyles.Category
        const signPos = this.resolvePosition(descriptor.anchorPosition, descriptor.mount)

        const config: SignageConfig = {
            text: descriptor.text ?? descriptor.label,
            position: signPos,
            backgroundColor: style.backgroundColor,
            textColor: style.textColor,
            width: style.width,
            height: style.height,
        }

        const mesh = this.renderer.createSign(config)
        mesh.userData.categoryLabel = descriptor.label
        mesh.userData.mountStyle = descriptor.mount.style

        if (descriptor.mount.signFacingY !== undefined) {
            mesh.rotation.y = descriptor.mount.signFacingY
        }

        this.scene.add(mesh)
        this.signs.set(descriptor.label, mesh)

        return mesh
    }

    /** Remove a named sign from the scene. */
    public removeSign(label: string): void {
        const existing = this.signs.get(label)
        if (existing) {
            this.scene.remove(existing)
            const mat = existing.material as THREE.MeshStandardMaterial
            mat.map?.dispose()
            mat.dispose()
            existing.geometry.dispose()
            this.signs.delete(label)
        }
    }

    /** Remove all signs. */
    /**
     * Place FRONT/BACK orientation end-cap labels on a shelf unit.
     *
     * Called from shelf construction (not game placement) so labels describe
     * the shelf geometry, not the games on it.
     *
     * @param shelfIndex  Index of this shelf unit (used for stable sign labels)
     * @param position    World-space base position of the shelf unit
     * @param rotY        Y-rotation (radians) of the shelf unit
     * @param topSurface  The top shelf surface — provides Z extents and centerX for placement
     */
    public placeShelfEndCapLabels(
        shelfIndex: number,
        position: THREE.Vector3,
        rotY: number,
        topSurface: { centerX: number; topY: number; backZ: number; frontZ: number; width: number }
    ): void {
        const labelX = topSurface.centerX + (topSurface.width / 2) - 0.15
        const labelY = topSurface.topY + 0.1
        const yAxis = new THREE.Vector3(0, 1, 0)

        const frontPosLocal = new THREE.Vector3(labelX, labelY, topSurface.backZ)
        const frontPos = frontPosLocal.clone().applyAxisAngle(yAxis, rotY).add(position)
        this.setSign({
            label: `shelf-front-label-${shelfIndex}`,
            text: 'FRONT',
            anchorPosition: frontPos,
            mount: { style: 'above-shelf', yOffset: 0, signFacingY: rotY },
            style: SignStyles.ShelfEndLabel
        })

        const backPosLocal = new THREE.Vector3(labelX, labelY, topSurface.frontZ)
        const backPos = backPosLocal.clone().applyAxisAngle(yAxis, rotY).add(position)
        this.setSign({
            label: `shelf-back-label-${shelfIndex}`,
            text: 'BACK',
            anchorPosition: backPos,
            mount: { style: 'above-shelf', yOffset: 0, signFacingY: rotY + Math.PI },
            style: SignStyles.ShelfEndLabel
        })
    }

    public clearAll(): void {
        for (const label of [...this.signs.keys()]) {
            this.removeSign(label)
        }
        this.timeBucketSignLabels.clear()
        this.lastPlacedBucket = null
    }

    public dispose(): void {
        this.clearAll()
        this.shelfTransforms.clear()
        this.sortedGames = []
        this.hasRecentlyPlayedData = false
        this.renderer.dispose()
    }

    private syncRecentlyPlayedCeilingSign(): void {
        const label = 'Recently Played'
        if (!this.hasRecentlyPlayedData) {
            this.removeSign(label)
            return
        }

        this.setSign({
            label,
            anchorPosition: new THREE.Vector3(0, RoomConstants.STORE_CEILING_HEIGHT - 0.5, -6.4),
            mount: {
                style: 'ceiling',
                signFacingY: 0,
            },
            style: {
                backgroundColor: 0xd4a017,
                textColor: 0x003087,
                width: 4.0,
                height: 0.65,
            },
        })
    }

    private replayTimeBucketSignsFromCreatedShelves(): void {
        if (!this.hasRecentlyPlayedData || this.sortedGames.length === 0 || this.shelfTransforms.size === 0) {
            return
        }

        const sortedShelves = [...this.shelfTransforms.entries()].sort((a, b) => a[0] - b[0])
        for (const [shelfId, transform] of sortedShelves) {
            this.placeTimeBucketSignForShelf(shelfId, transform.position, transform.rotationY)
        }
    }

    private placeTimeBucketSignForShelf(shelfId: number, shelfPosition: THREE.Vector3, shelfRotationY: number): void {
        const BATCH_SIZE = 18
        const firstGameIndex = shelfId * BATCH_SIZE
        if (firstGameIndex >= this.sortedGames.length) {
            return
        }

        const firstGame = this.sortedGames[firstGameIndex]
        const bucket = getRecentlyPlayedBucket(firstGame as SteamGameData)
        if (bucket === RecentlyPlayedBucket.Unplayed || bucket === this.lastPlacedBucket) {
            return
        }

        const anchor = new THREE.Vector3(
            shelfPosition.x,
            shelfPosition.y + 2.0 + 0.02,
            shelfPosition.z
        )

        const ceilingAnchor = new THREE.Vector3(0, RoomConstants.STORE_CEILING_HEIGHT - 0.5, -6.4)
        if (ceilingAnchor.distanceTo(anchor) <= 1.5) {
            return
        }

        const label = getBucketLabel(bucket)
        this.setSign({
            label,
            anchorPosition: anchor,
            mount: {
                style: 'above-shelf',
                yOffset: 0,
                frontOffset: 0.28,
                signFacingY: shelfRotationY,
            },
            style: { ...SignStyles.Category, width: 1.8, height: 0.32 },
        })
        this.timeBucketSignLabels.add(label)
        this.lastPlacedBucket = bucket
    }

    private clearTimeBucketSigns(): void {
        for (const label of this.timeBucketSignLabels) {
            this.removeSign(label)
        }
        this.timeBucketSignLabels.clear()
    }

    // ─── Position resolution ──────────────────────────────────────────────────

    private resolvePosition(anchor: THREE.Vector3, mount: SignMount): THREE.Vector3 {
        switch (mount.style) {
            case 'above-shelf': {
                const yOff = mount.yOffset ?? SceneSignManager.ABOVE_SHELF_DEFAULT_Y_OFFSET
                const facingY = mount.signFacingY ?? Math.PI
                const frontOff = mount.frontOffset ?? SceneSignManager.SIGN_Z_FACE_PLAYER
                return new THREE.Vector3(
                    anchor.x + Math.sin(facingY) * frontOff,
                    anchor.y + yOff,
                    anchor.z + Math.cos(facingY) * frontOff
                )
            }
            case 'wall': {
                // TD: wall mount position resolution � needs nearest wall Z (defer to SceneManager pass)
                const yOff = mount.yOffset ?? 0
                return new THREE.Vector3(anchor.x, anchor.y + yOff, anchor.z)
            }
            case 'ceiling': {
                // Ceiling mount: caller sets anchor.y directly to the desired sign height
                // (e.g. RoomConstants.STORE_CEILING_HEIGHT - drop). yOffset is not applied here.
                const facingY = mount.signFacingY ?? 0
                const frontOff = mount.frontOffset ?? 0
                return new THREE.Vector3(
                    anchor.x + Math.sin(facingY) * frontOff,
                    anchor.y,
                    anchor.z + Math.cos(facingY) * frontOff
                )
            }
        }
    }
}
