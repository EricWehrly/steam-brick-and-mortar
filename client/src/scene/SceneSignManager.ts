/**
 * SceneSignManager
 * Tech debt link: docs/roadmaps/tech-debt.md → "Category System Tech Debt / SceneSignManager rename"
 *
 * TODO(signage): split bucket-transition + anchor-placement helpers into dedicated modules
 *               when we do the SceneSignManager slimming pass.
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
    RoomEventTypes,
    type ShelfReadyEvent,
    type RoomResizedEvent,
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

export interface SignStyle {
    backgroundColor: number
    textColor: number
    fontSize: number
    padding?: string
}

export const SignStyles = {
    Category: {
        backgroundColor: 0x1a3a5c,
        textColor: 0xffffff,
        fontSize: 0.18,
        padding: '0.10 0.18',
    } satisfies SignStyle,

    Featured: {
        backgroundColor: 0x8b0000,
        textColor: 0xffffff,
        fontSize: 0.18,
        padding: '0.10 0.18',
    } satisfies SignStyle,

    ShelfEndLabel: {
        backgroundColor: 0x2a2a2a,
        textColor: 0xffffff,
        fontSize: 0.12,
        padding: '0.04 0.06',
    } satisfies SignStyle,
} as const

export type SignMountStyle = 'above-shelf' | 'wall' | 'ceiling'

export interface SignMount {
    style: SignMountStyle
    yOffset?: number
    frontOffset?: number
    signFacingY?: number
}

export interface ShelfTopSurface {
    centerX: number
    topY: number
    backZ: number
    frontZ: number
    width: number
}

export interface SignDescriptor {
    uniqueIdentifier: string
    text?: string
    anchorPosition: THREE.Vector3
    mount?: SignMount
    style?: SignStyleConfig
    scale?: number
    facingY?: number
}

/**
 * Semantic role of a sign — used for targeted clear/query operations.
 * Canvas-rendered: category, bucket, ceiling, end-cap.
 * 3D-rendered: neon-tube, block-letter.
 */
export type SignKind =
    | 'category'
    | 'bucket'
    | 'ceiling'
    | 'end-cap'
    | 'neon-tube'     // disabled — see docs/plans/neon-stroke-skeleton-plan.md
    | 'block-letter'

type RenderKind = 'canvas' | 'neon-tube' | 'block-letter'

const RENDER_KIND_BY_SIGN_KIND: Record<SignKind, RenderKind> = {
    category:       'canvas',
    bucket:         'canvas',
    ceiling:        'canvas',
    'end-cap':      'canvas',
    'neon-tube':    'neon-tube',
    'block-letter': 'block-letter',
}

export class SceneSignManager {
    private static _instance: SceneSignManager | null = null

    static get instance(): SceneSignManager {
        if (!SceneSignManager._instance) {
            SceneSignManager._instance = new SceneSignManager()
        }
        return SceneSignManager._instance
    }

    private readonly rendererByKind: Record<RenderKind, ISignRenderer>
    private readonly scene: THREE.Scene
    private readonly signKindsByIdentifier = new Map<string, SignKind>()
    private readonly shelfTransforms = new Map<number, { position: THREE.Vector3; rotationY: number }>()
    private sortedGames: ReadonlyArray<Readonly<SteamGameData>> = []
    private buckets: ReadonlyMap<number | string, string> = new Map()
    private lastPlacedBucket: RecentlyPlayedBucket | null = null

    private get hasRecentlyPlayedData(): boolean {
        return this.sortedGames.some(game => (game.rtime_last_played ?? 0) > 0)
    }

    private static readonly ABOVE_SHELF_DEFAULT_Y_OFFSET = 0.6
    private static readonly SIGN_Z_FACE_PLAYER = 0.01

    // Tech debt: docs/roadmaps/tech-debt.md → SceneSignManager scene access pattern
    constructor() {
        this.scene = DataManager.getInstance().getOrThrow<THREE.Scene>(DataKey.MainScene)
        this.rendererByKind = {
            canvas:         new CanvasSignRenderer(),
            'neon-tube':    new NeonTubeSignRenderer(),
            'block-letter': new BlockLetterSignRenderer(),
        }

        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => this.handleShelfCreated(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.GamesSort,
            (event: CustomEvent<GamesSortEvent>) => this.handleGamesSort(event.detail)
        )
        // TODO(layout): sign positions should be driven by a layout coordinator, not
        // computed here from RoomConstants. When that refactor lands, this handler
        // becomes a layout invalidation signal rather than a direct re-place.
        EventManager.getInstance().registerEventHandler(
            RoomEventTypes.Resized,
            (_event: CustomEvent<RoomResizedEvent>) => this.handleRoomResized()
        )
    }

    private handleShelfCreated(detail: ShelfReadyEvent): void {
        const { position, rotationY, batchIndex } = detail
        const rotY = rotationY ?? 0
        const shelfPos = position as THREE.Vector3

        const topSurface = ShelfSurfaceUtils.findShelfSurfaces(null, true)[0]
        if (topSurface) {
            this.placeShelfEndCapLabels(batchIndex, shelfPos, rotY, topSurface)
        }

        this.shelfTransforms.set(batchIndex, { position: shelfPos.clone(), rotationY: rotY })

        if (this.hasRecentlyPlayedData && this.sortedGames.length > 0) {
            this.placeTimeBucketSignForShelf(batchIndex, shelfPos, rotY)
        }
    }

    private handleRoomResized(): void {
        // Re-place signs whose positions derive from room/ceiling dimensions.
        // TODO(layout): replace with layout coordinator invalidation.
        this.syncRecentlyPlayedCeilingSign()
        this.syncSteamLibraryBlockSign()
    }

    private handleGamesSort(detail: GamesSortEvent): void {
        this.sortedGames = detail.sortedGames
        this.buckets = detail.buckets
        this.lastPlacedBucket = null
        this.clearByKind('bucket')
        this.syncRecentlyPlayedCeilingSign()
        this.replayTimeBucketSignsFromCreatedShelves()
    }

    public placeSign(kind: SignKind, descriptor: SignDescriptor): THREE.Object3D {
        const renderKind = RENDER_KIND_BY_SIGN_KIND[kind]
        const renderer = this.rendererByKind[renderKind]
        const signObject = renderer.setSign(this.buildSignRequest(renderKind, descriptor), this.scene)
        this.signKindsByIdentifier.set(descriptor.uniqueIdentifier, kind)
        return signObject
    }

    private buildSignRequest(renderKind: RenderKind, descriptor: SignDescriptor): SignRequest {
        const text = descriptor.text ?? descriptor.uniqueIdentifier

        if (renderKind !== 'canvas') {
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
        const defaults = SignStyles.Category
        return {
            uniqueIdentifier: descriptor.uniqueIdentifier,
            text,
            position: this.resolvePosition(descriptor.anchorPosition, mount),
            facingY: mount.signFacingY,
            style: {
                backgroundColor: descriptor.style?.backgroundColor ?? defaults.backgroundColor,
                textColor:       descriptor.style?.textColor       ?? defaults.textColor,
                fontSize:        descriptor.style?.fontSize        ?? defaults.fontSize,
                padding:         descriptor.style?.padding         ?? defaults.padding,
            },
        }
    }

    private removeSign(uniqueIdentifier: string): void {
        const signKind = this.signKindsByIdentifier.get(uniqueIdentifier)
        if (!signKind) return

        const renderKind = RENDER_KIND_BY_SIGN_KIND[signKind]
        this.rendererByKind[renderKind].removeSign(uniqueIdentifier, this.scene)
        this.signKindsByIdentifier.delete(uniqueIdentifier)
    }

    private clearByKind(kind: SignKind): void {
        const toRemove: string[] = []
        for (const [uniqueIdentifier, signKind] of this.signKindsByIdentifier) {
            if (signKind === kind) toRemove.push(uniqueIdentifier)
        }
        for (const uniqueIdentifier of toRemove) {
            this.removeSign(uniqueIdentifier)
        }
    }

    private placeShelfEndCapLabels(
        shelfIndex: number,
        position: THREE.Vector3,
        rotY: number,
        surface: ShelfTopSurface
    ): void {
        const yAxis = new THREE.Vector3(0, 1, 0)
        const labelX = surface.centerX + (surface.width / 2) - 0.15
        const labelY = surface.topY + 0.1

        const placeEndCap = (identifier: string, text: string, localZ: number, facingY: number) => {
            const worldPos = new THREE.Vector3(labelX, labelY, localZ)
                .applyAxisAngle(yAxis, rotY)
                .add(position)
            this.placeSign('end-cap', {
                uniqueIdentifier: identifier,
                text,
                anchorPosition: worldPos,
                mount: { style: 'above-shelf', yOffset: 0, signFacingY: facingY },
                style: SignStyles.ShelfEndLabel,
            })
        }

        placeEndCap(`shelf-front-label-${shelfIndex}`, 'FRONT', surface.backZ,  rotY)
        placeEndCap(`shelf-back-label-${shelfIndex}`,  'BACK',  surface.frontZ, rotY + Math.PI)
    }

    public clearAll(): void {
        for (const renderer of new Set(Object.values(this.rendererByKind))) {
            renderer.clearAll(this.scene)
        }
        this.signKindsByIdentifier.clear()
        this.lastPlacedBucket = null
    }

    public dispose(): void {
        for (const renderer of new Set(Object.values(this.rendererByKind))) {
            renderer.dispose(this.scene)
        }
        this.signKindsByIdentifier.clear()
        this.shelfTransforms.clear()
        this.sortedGames = []
        this.buckets = new Map()
        this.lastPlacedBucket = null
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
            mount: { style: 'ceiling', signFacingY: 0 },
            style: {
                backgroundColor: 0xd4a017,
                textColor: 0x003087,
                fontSize: 0.30,
                padding: '0.15 0.28',
            },
        })
    }

    /**
     * TD(neon-skeleton): neon entrance sign disabled — stroke-skeleton rendering not yet implemented.
     * See docs/plans/neon-stroke-skeleton-plan.md to re-enable.
     *
     * this.placeSign('neon-tube', {
     *     uniqueIdentifier: 'neon-entrance',
     *     anchorPosition: new THREE.Vector3(anchor.x, anchor.y - 0.4, anchor.z + 0.5),
     *     text: 'steam', scale: 1.2,
     *     style: { color: 0xff6a00, fontSize: 0.3 },
     * })
     */

    /**
     * Font: helvetiker_bold.typeface.json (MgOpen license — see THIRD_PARTY_LICENSES.md)
     * TD: add helvetiker copyright to credits UI before public release (phase 3).
     * TODO(layout): position should come from a layout coordinator, not be hardcoded here.
     * TODO(layout): sort-driven signs (bucket, ceiling) should similarly be driven by
     *               layout events rather than responding to GamesSort directly.
     */
    private syncSteamLibraryBlockSign(): void {
        const anchor = recentlyPlayedCeilingAnchor()
        this.placeSign('block-letter', {
            uniqueIdentifier: 'steam-library-title',
            text: 'STEAM LIBRARY',
            anchorPosition: new THREE.Vector3(anchor.x, anchor.y - 0.6, anchor.z + 1.5),
            style: {
                color: 0x003087,
                fontSize: 0.35,
                depth: 0.08,
            },
        })
    }

    private replayTimeBucketSignsFromCreatedShelves(): void {
        if (!this.hasRecentlyPlayedData || this.sortedGames.length === 0 || this.shelfTransforms.size === 0) return

        const sortedShelves = [...this.shelfTransforms.entries()].sort((a, b) => a[0] - b[0])
        for (const [shelfId, transform] of sortedShelves) {
            this.placeTimeBucketSignForShelf(shelfId, transform.position, transform.rotationY)
        }
    }

    private placeTimeBucketSignForShelf(shelfId: number, shelfPosition: THREE.Vector3, shelfRotationY: number): void {
        const bucket = shelfBucket(shelfId, this.sortedGames)
        if (!shouldPlaceBucketSign(bucket, this.lastPlacedBucket, shelfPosition, recentlyPlayedCeilingAnchor())) return

        const uniqueIdentifier = bucketDisplayLabel(bucket!)
        this.placeSign('bucket', {
            uniqueIdentifier,
            anchorPosition: bucketSignAnchor(shelfPosition),
            mount: { style: 'above-shelf', yOffset: 0, frontOffset: 0.28, signFacingY: shelfRotationY },
            style: { ...SignStyles.Category, fontSize: 0.16, padding: '0.08 0.14' },
        })
        this.lastPlacedBucket = bucket!
    }

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
                // TD: wall mount — needs nearest wall Z from SceneManager
                return new THREE.Vector3(anchor.x, anchor.y + (mount.yOffset ?? 0), anchor.z)
            }
            case 'ceiling': {
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
