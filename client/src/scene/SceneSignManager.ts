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
    StorePropsEventTypes,
    type ShelfCreatedEvent,
} from '../types/InteractionEvents'
import type { GamesSortEvent } from '../types/EnvironmentEvents'
import { RecentlyPlayedBucket } from './categorization/GameSorter'
import type { SteamGameData } from './game-box/types/GameData'
import { ShelfSurfaceUtils } from './props/shared/ShelfSurfaceUtils'
import {
    shelfBucket,
    shouldPlaceBucketSign,
    bucketSignAnchor,
    recentlyPlayedCeilingAnchor,
    bucketDisplayLabel,
} from './signs/TimeBucketSignHelpers'

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

/** Geometry of the topmost surface of a shelf unit, used to anchor end-cap labels. */
export interface ShelfTopSurface {
    centerX: number
    topY: number
    /** Z extent furthest from the player (back face). */
    backZ: number
    /** Z extent closest to the player (front face). */
    frontZ: number
    width: number
}

export interface CategorySignDescriptor {
    label: string
    text?: string   // display text — defaults to label if omitted
    anchorPosition: THREE.Vector3   // World position to anchor sign to (e.g. shelf center)
    mount: SignMount
    style?: SignStyle
}

// ─── Sign kind ───────────────────────────────────────────────────────────────

/**
 * Discriminates what role a sign plays in the scene.
 * Used for targeted clear/query operations (e.g. clear only bucket signs).
 * Future sign types (neon tube, end-of-aisle topper, etc.) extend this union.
 */
export type SignKind =
    | 'category'    // generic named category label
    | 'bucket'      // time-bucket section divider
    | 'ceiling'     // ceiling-hung feature sign (e.g. Recently Played)
    | 'end-cap'     // orientation end-cap label on a shelf unit

// ─── Internal storage record ──────────────────────────────────────────────────

interface SignRecord {
    mesh: THREE.Mesh
    kind: SignKind
    /** Geometry dimensions — cached so we can skip geometry recreation on same-size updates. */
    width: number
    height: number
}

// ─── System ───────────────────────────────────────────────────────────────────

// TODO(signage): split bucket-transition + anchor-placement helpers into dedicated modules when we do the SceneSignManager slimming pass.
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
    private readonly signs: Map<string, SignRecord> = new Map()
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
        this.scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
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
            (event: CustomEvent<GamesSortEvent>) => this.handleGamesSort(event.detail)
        )
    }

    private handleGamesSort(detail: GamesSortEvent): void {
        this.sortedGames = detail.sortedGames
        this.hasRecentlyPlayedData = detail.hasRecentlyPlayedData
        this.lastPlacedBucket = null
        this.clearTimeBucketSigns()
        this.syncRecentlyPlayedCeilingSign()
        this.replayTimeBucketSignsFromCreatedShelves()
    }

    /**
     * Create or update a named sign.
     *
     * If a sign with this label already exists:
     * - Same geometry dimensions → texture is re-baked in place (geometry reused).
     * - Different dimensions → geometry is replaced; old one disposed.
     * - Position / rotation are always updated.
     */
    public setSign(descriptor: CategorySignDescriptor, kind: SignKind = 'category'): THREE.Mesh {
        const style = descriptor.style ?? SignStyles.Category
        const signPos = this.resolvePosition(descriptor.anchorPosition, descriptor.mount)
        const text = descriptor.text ?? descriptor.label

        const existing = this.signs.get(descriptor.label)

        if (existing) {
            // ── Recycle path ─────────────────────────────────────────────────
            const mesh = existing.mesh
            const mat = mesh.material as THREE.MeshStandardMaterial

            // Re-bake texture unconditionally (text or colors may have changed)
            mat.map?.dispose()
            mat.map = this.renderer.bakeTexture(text, style.backgroundColor, style.textColor)
            mat.needsUpdate = true

            // Replace geometry only if dimensions changed
            if (existing.width !== style.width || existing.height !== style.height) {
                mesh.geometry.dispose()
                mesh.geometry = new THREE.PlaneGeometry(style.width, style.height)
                existing.width = style.width
                existing.height = style.height
            }

            mesh.position.copy(signPos)
            if (descriptor.mount.signFacingY !== undefined) {
                mesh.rotation.y = descriptor.mount.signFacingY
            }

            return mesh
        }

        // ── Create path ───────────────────────────────────────────────────────
        const config: SignageConfig = {
            text,
            position: signPos,
            backgroundColor: style.backgroundColor,
            textColor: style.textColor,
            width: style.width,
            height: style.height,
        }

        const mesh = this.renderer.createSign(config)
        mesh.userData.categoryLabel = descriptor.label
        mesh.userData.mountStyle = descriptor.mount.style
        mesh.userData.signKind = kind

        if (descriptor.mount.signFacingY !== undefined) {
            mesh.rotation.y = descriptor.mount.signFacingY
        }

        this.scene.add(mesh)
        this.signs.set(descriptor.label, { mesh, kind, width: style.width, height: style.height })

        return mesh
    }

    /** Remove a named sign from the scene, disposing all GPU resources. */
    public removeSign(label: string): void {
        const record = this.signs.get(label)
        if (record) {
            this.scene.remove(record.mesh)
            const mat = record.mesh.material as THREE.MeshStandardMaterial
            mat.map?.dispose()
            mat.dispose()
            record.mesh.geometry.dispose()
            this.signs.delete(label)
        }
    }

    /** Remove all signs of a given kind. */
    public clearByKind(kind: SignKind): void {
        for (const [label, record] of this.signs) {
            if (record.kind === kind) this.removeSign(label)
        }
    }

    /**
     * Place FRONT/BACK orientation end-cap labels on a shelf unit.
     * Called on ShelfCreated so labels describe shelf geometry, not game content.
     */
    public placeShelfEndCapLabels(
        shelfIndex: number,
        position: THREE.Vector3,
        rotY: number,
        surface: ShelfTopSurface
    ): void {
        const yAxis = new THREE.Vector3(0, 1, 0)
        const labelX = surface.centerX + (surface.width / 2) - 0.15
        const labelY = surface.topY + 0.1

        this.placeEndCapLabel(
            `shelf-front-label-${shelfIndex}`, 'FRONT',
            new THREE.Vector3(labelX, labelY, surface.backZ),
            position, rotY, yAxis
        )
        this.placeEndCapLabel(
            `shelf-back-label-${shelfIndex}`, 'BACK',
            new THREE.Vector3(labelX, labelY, surface.frontZ),
            position, rotY + Math.PI, yAxis
        )
    }

    private placeEndCapLabel(
        label: string,
        text: string,
        localPos: THREE.Vector3,
        shelfOrigin: THREE.Vector3,
        facingY: number,
        yAxis: THREE.Vector3
    ): void {
        const worldPos = localPos.clone().applyAxisAngle(yAxis, facingY).add(shelfOrigin)
        this.setSign({
            label,
            text,
            anchorPosition: worldPos,
            mount: { style: 'above-shelf', yOffset: 0, signFacingY: facingY },
            style: SignStyles.ShelfEndLabel
        }, 'end-cap')
    }

    public clearAll(): void {
        for (const label of [...this.signs.keys()]) {
            this.removeSign(label)
        }
        this.timeBucketSignLabels.clear()
        this.lastPlacedBucket = null
    }

    /** Read-only snapshot of all signs, keyed by label. Useful for tests/debug. */
    public getSignsByKind(kind: SignKind): ReadonlyMap<string, THREE.Mesh> {
        const result = new Map<string, THREE.Mesh>()
        for (const [label, record] of this.signs) {
            if (record.kind === kind) result.set(label, record.mesh)
        }
        return result
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
            anchorPosition: recentlyPlayedCeilingAnchor(),
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
        }, 'ceiling')
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
        const bucket = shelfBucket(shelfId, this.sortedGames)
        const ceilingAnchor = recentlyPlayedCeilingAnchor()

        if (!shouldPlaceBucketSign(bucket, this.lastPlacedBucket, shelfPosition, ceilingAnchor)) {
            return
        }

        // bucket is non-null here (shouldPlaceBucketSign guarantees it)
        const label = bucketDisplayLabel(bucket!) ?? ''
        const anchor = bucketSignAnchor(shelfPosition)

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
        }, 'bucket')
        this.timeBucketSignLabels.add(label)
        this.lastPlacedBucket = bucket!
    }

    private clearTimeBucketSigns(): void {
        this.clearByKind('bucket')
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
                // (e.g. ceiling height minus drop). yOffset is not applied here.
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
