/**
 * SceneSignManager
 *
 * Generic scene-space sign system for category labels.
 * Tech debt link: docs/roadmaps/tech-debt.md → "Category System Tech Debt / SceneSignManager → SceneSignManager rename"
 *
 * A "sign" is a positioned 3D object in the scene with configurable text and style.
 * The rendering strategy (canvas texture, neon tube geometry, block letters, etc.)
 * is selected by SignKind and delegated to the appropriate ISignRenderer.
 *
 * Entry point: placeSign(kind, descriptor) — unified for all sign types.
 * Internal: mount-style position resolution applies to canvas-based kinds;
 *           neon-tube and future 3D kinds use anchorPosition directly.
 *
 * Phase 1: above-shelf signs only.
 * Phase 2: wall + ceiling mount styles.
 */

import * as THREE from 'three'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'
import { EventManager } from '../core/EventManager'
import { CanvasSignRenderer } from './signs/CanvasSignRenderer'
import { NeonTubeSignRenderer } from './signs/NeonTubeSignRenderer'
import { BlockLetterSignRenderer } from './signs/BlockLetterSignRenderer'
import type { ISignRenderer, SignRequest, SignStyleConfig } from './signs/ISignRenderer'
import {
    GameEventTypes,
    StorePropsEventTypes,
    type ShelfReadyEvent,
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
    fontSize: number
    padding?: string
}

export const SignStyles = {
    /** Default Blockbuster-style blue sign */
    Category: {
        backgroundColor: 0x1a3a5c,
        textColor: 0xffffff,
        fontSize: 0.18,
        padding: '0.10 0.18',
    } satisfies SignStyle,

    /** Accent color — for featured/highlighted sections */
    Featured: {
        backgroundColor: 0x8b0000,
        textColor: 0xffffff,
        fontSize: 0.18,
        padding: '0.10 0.18',
    } satisfies SignStyle,

    /** Small orientation/debug label */
    ShelfEndLabel: {
        backgroundColor: 0x2a2a2a,
        textColor: 0xffffff,
        fontSize: 0.12,
        padding: '0.04 0.06',
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

// ─── Sign descriptor ──────────────────────────────────────────────────────────

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

/**
 * Descriptor passed to placeSign() for all sign kinds.
 *
 * - Canvas-based kinds (category, bucket, ceiling, end-cap): anchorPosition is
 *   the mount anchor; mount drives position resolution (yOffset, frontOffset, etc.).
 * - 3D kinds (neon-tube): anchorPosition is used as the direct world position;
 *   mount is ignored (no flat-plane offset logic applies).
 */
export interface SignDescriptor {
    uniqueIdentifier: string
    text?: string
    anchorPosition: THREE.Vector3
    mount?: SignMount
    style?: SignStyleConfig
    scale?: number
    facingY?: number
}

// ─── Sign kind ───────────────────────────────────────────────────────────────

/**
 * Discriminates what role a sign plays in the scene.
 * Used for targeted clear/query operations (e.g. clear only bucket signs).
 * Future sign types (neon tube, end-of-aisle topper, etc.) extend this union.
 */
export type SignKind =
    | 'category'      // generic named category label
    | 'bucket'        // time-bucket section divider
    | 'ceiling'       // ceiling-hung feature sign (e.g. Recently Played)
    | 'end-cap'       // orientation end-cap label on a shelf unit
    | 'neon-tube'     // 3D TubeGeometry neon sign — disabled pending stroke-skeleton rendering (see docs/plans/neon-stroke-skeleton-plan.md)
    | 'block-letter'  // extruded 3D block letters — disabled pending font asset decision (see docs/plans/neon-stroke-skeleton-plan.md)

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

    private readonly canvasRenderer: CanvasSignRenderer
    private readonly neonRenderer: NeonTubeSignRenderer
    private readonly blockLetterRenderer: BlockLetterSignRenderer
    private readonly rendererByKind: Record<SignKind, ISignRenderer>
    private readonly scene: THREE.Scene
    private readonly signKindsByIdentifier = new Map<string, SignKind>()
    private readonly shelfTransforms = new Map<number, { position: THREE.Vector3; rotationY: number }>()
    private readonly timeBucketSignLabels = new Set<string>()
    private sortedGames: ReadonlyArray<Readonly<SteamGameData>> = []
    private buckets: ReadonlyMap<number | string, string> = new Map()
    private lastPlacedBucket: RecentlyPlayedBucket | null = null

    /** True when any game has recent-play metadata (rtime_last_played > 0). */
    private get hasRecentlyPlayedData(): boolean {
        return this.sortedGames.some(game => (game.rtime_last_played ?? 0) > 0)
    }

    private static readonly ABOVE_SHELF_DEFAULT_Y_OFFSET = 0.6
    private static readonly SIGN_Z_FACE_PLAYER = 0.01 // slight forward push to avoid z-fighting

    // Tech debt link: docs/roadmaps/tech-debt.md →
    // - "Category System Tech Debt / SceneSignManager: scene access pattern / SceneManager"
    // - "Category System Tech Debt / SignageRenderer: singleton vs instance"
    constructor() {
        this.scene = DataManager.getInstance().getOrThrow<THREE.Scene>(DataKey.MainScene)
        this.canvasRenderer = new CanvasSignRenderer()
        this.neonRenderer = new NeonTubeSignRenderer()
        this.blockLetterRenderer = new BlockLetterSignRenderer()
        this.rendererByKind = {
            category: this.canvasRenderer,
            bucket: this.canvasRenderer,
            ceiling: this.canvasRenderer,
            'end-cap': this.canvasRenderer,
            'neon-tube': this.neonRenderer,
            'block-letter': this.blockLetterRenderer,
        }

        // Self-subscribe to shelf creation events to place end-cap labels automatically.
        // This keeps sign placement logic where it belongs — in the sign manager.
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => this.handleShelfCreated(event.detail)
        )

        EventManager.getInstance().registerEventHandler(
            GameEventTypes.GamesSort,
            (event: CustomEvent<GamesSortEvent>) => this.handleGamesSort(event.detail)
        )
    }

    private handleShelfCreated(detail: ShelfReadyEvent): void {
        const { position, rotationY, batchIndex } = detail
        const rotY = rotationY ?? 0
        const shelfPos = position as THREE.Vector3
        const shelfId = batchIndex

        const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)
        const topSurface = shelfSurfaces[0]
        if (topSurface) {
            this.placeShelfEndCapLabels(batchIndex, shelfPos, rotY, topSurface)
        }

        this.shelfTransforms.set(shelfId, { position: shelfPos.clone(), rotationY: rotY })

        if (this.hasRecentlyPlayedData && this.sortedGames.length > 0) {
            this.placeTimeBucketSignForShelf(shelfId, shelfPos, rotY)
        }
    }

    private handleGamesSort(detail: GamesSortEvent): void {
        this.sortedGames = detail.sortedGames
        this.buckets = detail.buckets
        this.lastPlacedBucket = null
        this.clearTimeBucketSigns()
        this.syncRecentlyPlayedCeilingSign()
        this.syncNeonEntranceSign()
        this.replayTimeBucketSignsFromCreatedShelves()
    }

    /**
     * Place or update a sign of any kind.
     *
     * Canvas kinds resolve mount-position from anchorPosition before delegation.
     * 3D kinds use anchorPosition directly as world position.
     */
    public placeSign(kind: SignKind, descriptor: SignDescriptor): THREE.Object3D {
        const renderer = this.rendererByKind[kind]
        const signRequest = this.buildSignRequest(kind, descriptor)
        const signObject = renderer.setSign(signRequest, this.scene)
        this.signKindsByIdentifier.set(descriptor.uniqueIdentifier, kind)
        return signObject
    }

    private buildSignRequest(kind: SignKind, descriptor: SignDescriptor): SignRequest {
        // When text is omitted, fall back to uniqueIdentifier as the display label.
        // Callers that want a sign with no visible text must pass text: '' explicitly.
        const text = descriptor.text ?? descriptor.uniqueIdentifier

        if (kind === 'neon-tube') {
            return {
                uniqueIdentifier: descriptor.uniqueIdentifier,
                text,
                position: descriptor.anchorPosition,
                facingY: descriptor.facingY,
                scale: descriptor.scale,
                style: descriptor.style,
            }
        }

        const mount = descriptor.mount ?? { style: 'above-shelf' }
        const defaultStyle = SignStyles.Category
        const style = {
            backgroundColor: descriptor.style?.backgroundColor ?? defaultStyle.backgroundColor,
            textColor: descriptor.style?.textColor ?? defaultStyle.textColor,
            fontSize: descriptor.style?.fontSize ?? defaultStyle.fontSize,
            padding: descriptor.style?.padding ?? defaultStyle.padding,
        }

        return {
            uniqueIdentifier: descriptor.uniqueIdentifier,
            text,
            position: this.resolvePosition(descriptor.anchorPosition, mount),
            facingY: mount.signFacingY,
            style,
        }
    }

    /** Remove a sign of any kind by uniqueIdentifier. */
    public removeSign(uniqueIdentifier: string): void {
        const signKind = this.signKindsByIdentifier.get(uniqueIdentifier)
        if (!signKind) {
            return
        }

        this.rendererByKind[signKind].removeSign(uniqueIdentifier, this.scene)
        this.signKindsByIdentifier.delete(uniqueIdentifier)
    }

    /** Remove all signs of a given kind. */
    public clearByKind(kind: SignKind): void {
        const identifiersToRemove: string[] = []
        for (const [uniqueIdentifier, signKind] of this.signKindsByIdentifier) {
            if (signKind === kind) identifiersToRemove.push(uniqueIdentifier)
        }
        for (const uniqueIdentifier of identifiersToRemove) {
            this.removeSign(uniqueIdentifier)
        }
    }

    /**
     * Place FRONT/BACK orientation end-cap labels on a shelf unit.
     * Called on ShelfReady so labels describe shelf geometry, not game content.
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

        // Both local positions are rotated by the shelf's own rotY (not the sign facing)
        // so they correctly map to world space regardless of shelf orientation.
        // signFacingY controls which direction the sign face points.
        this.placeEndCapLabel(
            `shelf-front-label-${shelfIndex}`, 'FRONT',
            new THREE.Vector3(labelX, labelY, surface.backZ),
            position, rotY,
            rotY,          // sign face matches shelf facing
            yAxis
        )
        this.placeEndCapLabel(
            `shelf-back-label-${shelfIndex}`, 'BACK',
            new THREE.Vector3(labelX, labelY, surface.frontZ),
            position, rotY,
            rotY + Math.PI, // sign faces the opposite direction (back side)
            yAxis
        )
    }

    private placeEndCapLabel(
        uniqueIdentifier: string,
        text: string,
        localPos: THREE.Vector3,
        shelfOrigin: THREE.Vector3,
        shelfRotY: number,
        signFacingY: number,
        yAxis: THREE.Vector3
    ): void {
        const worldPos = localPos.clone().applyAxisAngle(yAxis, shelfRotY).add(shelfOrigin)
        this.placeSign('end-cap', {
            uniqueIdentifier,
            text,
            anchorPosition: worldPos,
            mount: { style: 'above-shelf', yOffset: 0, signFacingY },
            style: SignStyles.ShelfEndLabel,
        })
    }

    public clearAll(): void {
        this.canvasRenderer.clearAll(this.scene)
        this.neonRenderer.clearAll(this.scene)
        this.signKindsByIdentifier.clear()
        this.timeBucketSignLabels.clear()
        this.lastPlacedBucket = null
    }

    public dispose(): void {
        this.clearAll()
        this.shelfTransforms.clear()
        this.sortedGames = []
        this.buckets = new Map()
        this.canvasRenderer.dispose(this.scene)
        this.neonRenderer.dispose(this.scene)
        this.blockLetterRenderer.dispose(this.scene)
    }

    private syncRecentlyPlayedCeilingSign(): void {
        const uniqueIdentifier = 'Recently Played'
        if (!this.hasRecentlyPlayedData) {
            this.removeSign(uniqueIdentifier)
            return
        }

        this.placeSign('ceiling', {
            uniqueIdentifier,
            anchorPosition: recentlyPlayedCeilingAnchor(),
            mount: {
                style: 'ceiling',
                signFacingY: 0,
            },
            style: {
                backgroundColor: 0xd4a017,
                textColor: 0x003087,
                fontSize: 0.30,
                padding: '0.15 0.28',
            },
        })
    }

    /**
     * Place (or remove) a neon "steam" entrance sign above the recently-played section.
     * Only shown when the user has played anything — same gate as the ceiling label.
     *
     * DISABLED: neon tube rendering produces outline-tracing artifacts (macaroni seams).
     * Re-enable once stroke-skeleton rendering is implemented.
     * See: docs/plans/neon-stroke-skeleton-plan.md
     */
    private syncNeonEntranceSign(): void {
        // TD(neon-skeleton): re-enable when stroke-skeleton rendering is ready
        // this.placeSign('neon-tube', {
        //     uniqueIdentifier: 'neon-entrance',
        //     anchorPosition: new THREE.Vector3(anchor.x, anchor.y - 0.4, anchor.z + 0.5),
        //     text: 'steam',
        //     scale: 1.2,
        //     style: { color: 0xff6a00, fontSize: 0.3 },
        // })
        this.syncSteamLibraryBlockSign()
    }

    /**
     * Place a block-letter "Steam Library" sign at the store entrance.
     * Sits behind the recently-played ceiling sign, visible from the entrance.
     *
     * Font: helvetiker_bold.typeface.json (MgOpen license — permissive, see THIRD_PARTY_LICENSES.md)
     * TD: add helvetiker copyright to credits UI before public release (phase 3).
     */
    private syncSteamLibraryBlockSign(): void {
        if (!this.hasRecentlyPlayedData) {
            this.removeSign('steam-library-title')
            return
        }
        const anchor = recentlyPlayedCeilingAnchor()
        this.placeSign('block-letter', {
            uniqueIdentifier: 'steam-library-title',
            text: 'Steam Library',
            anchorPosition: new THREE.Vector3(anchor.x, anchor.y - 0.6, anchor.z + 1.5),
            style: {
                color: 0xc7d5e0,   // Steam blue-grey
                fontSize: 0.35,
                depth: 0.08,
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
        const bucket = shelfBucket(shelfId, this.sortedGames)
        const ceilingAnchor = recentlyPlayedCeilingAnchor()

        if (!shouldPlaceBucketSign(bucket, this.lastPlacedBucket, shelfPosition, ceilingAnchor)) {
            return
        }

        // bucket is non-null here (shouldPlaceBucketSign guarantees it)
        const uniqueIdentifier = bucketDisplayLabel(bucket!)
        const anchor = bucketSignAnchor(shelfPosition)

        this.placeSign('bucket', {
            uniqueIdentifier,
            anchorPosition: anchor,
            mount: {
                style: 'above-shelf',
                yOffset: 0,
                frontOffset: 0.28,
                signFacingY: shelfRotationY,
            },
            style: { ...SignStyles.Category, fontSize: 0.16, padding: '0.08 0.14' },
        })
        this.timeBucketSignLabels.add(uniqueIdentifier)
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
