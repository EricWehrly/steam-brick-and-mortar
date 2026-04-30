/**
 * SceneSignManager
 * Tech debt link: docs/roadmaps/tech-debt.md → "Category System Tech Debt / SceneSignManager rename"
 */

import * as THREE from 'three'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'
import { EventManager } from '../core/EventManager'
import { CanvasSignRenderer } from './signs/CanvasSignRenderer'
import { NeonTubeSignRenderer } from './signs/NeonTubeSignRenderer'
import { BlockLetterSignRenderer } from './signs/BlockLetterSignRenderer'
import type { ISignRenderer, SignRequest } from './signs/ISignRenderer'
import type { RenderKind, SignDescriptor, SignMount, ShelfTopSurface } from './SignTypes'
import {
    StorePropsEventTypes,
    RoomEventTypes,
    SteamEventTypes,
    type ShelfReadyEvent,
    type RoomResizedEvent,
    type SteamDataLoadedEvent,
} from '../types/InteractionEvents'
import { ShelfSurfaceUtils } from './props/shared/ShelfSurfaceUtils'
import { RoomConstants } from './RoomManager'

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
    private readonly rendererByIdentifier = new Map<string, RenderKind>()
    private roomDepth: number = RoomConstants.DEFAULT_ROOM_DEPTH
    private roomWorldOffsetZ = 0
    private steamLibraryTitleText = 'STEAM LIBRARY'

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
        // TODO(layout): sign positions should be driven by a layout coordinator, not
        // computed here from RoomConstants. When that refactor lands, this handler
        // becomes a layout invalidation signal rather than a direct re-place.
        EventManager.getInstance().registerEventHandler(
            RoomEventTypes.Resized,
            (event: CustomEvent<RoomResizedEvent>) => this.handleRoomResized(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            SteamEventTypes.DataLoaded,
            (event: CustomEvent<SteamDataLoadedEvent>) => this.handleSteamDataLoaded(event.detail)
        )
    }

    private handleSteamDataLoaded(detail: SteamDataLoadedEvent): void {
        this.steamLibraryTitleText = this.buildSteamLibraryTitle(detail.displayName)
        this.syncSteamLibraryBlockSign()
    }

    private buildSteamLibraryTitle(displayName?: string): string {
        const trimmedName = displayName?.trim()
        if (!trimmedName) {
            return 'STEAM LIBRARY'
        }
        return `${trimmedName}'s Steam Library`
    }

    private handleShelfCreated(detail: ShelfReadyEvent): void {
        const { position, rotationY, shelfIndex, sectionIndex } = detail
        const rotY = rotationY ?? 0
        const shelfPos = position as THREE.Vector3

        const topSurface = ShelfSurfaceUtils.findShelfSurfaces(null, true)[0]
        // TD: shelf-end-cap-signs — end-cap FRONT/BACK labels disabled until sign
        // rendering is efficient enough to absorb the DC cost (~2 DCs per shelf).
        // Re-enable when instanced/batched text rendering is in place.
        // if (topSurface) {
        //     this.placeShelfEndCapLabels(batchIndex, shelfPos, rotY, topSurface)
        // }
    }

    private handleRoomResized(detail: RoomResizedEvent): void {
        this.roomDepth = detail.dimensions.depth
        if (detail.centerOffset) {
            this.roomWorldOffsetZ = detail.centerOffset.z + RoomConstants.STORE_FRONT_OFFSET
        }
        // TODO(layout): replace with layout coordinator invalidation.
        this.syncSteamLibraryBlockSign()
    }

    public placeSign(renderKind: RenderKind, descriptor: SignDescriptor): THREE.Object3D {
        const renderer = this.rendererByKind[renderKind]
        const signObject = renderer.setSign(this.buildSignRequest(renderKind, descriptor), this.scene)
        this.rendererByIdentifier.set(descriptor.uniqueIdentifier, renderKind)
        return signObject
    }

    /** Remove a sign by identifier. Called by layout coordinators (e.g. ShelfSignPlanner). */
    public removeSignById(uniqueIdentifier: string): void {
        this.removeSign(uniqueIdentifier)
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
        return {
            uniqueIdentifier: descriptor.uniqueIdentifier,
            text,
            position: this.resolvePosition(descriptor.anchorPosition, mount),
            facingY: mount.signFacingY,
            style: descriptor.style,
        }
    }

    private removeSign(uniqueIdentifier: string): void {
        const renderKind = this.rendererByIdentifier.get(uniqueIdentifier)
        if (!renderKind) return

        this.rendererByKind[renderKind].removeSign(uniqueIdentifier, this.scene)
        this.rendererByIdentifier.delete(uniqueIdentifier)
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
        this.placeEndCapLabel(`shelf-front-label-${shelfIndex}`, 'FRONT', surface.backZ,  rotY,           labelX, labelY, position, rotY, yAxis)
        this.placeEndCapLabel(`shelf-back-label-${shelfIndex}`,  'BACK',  surface.frontZ, rotY + Math.PI, labelX, labelY, position, rotY, yAxis)
    }

    private placeEndCapLabel(
        uniqueIdentifier: string,
        text: string,
        localZ: number,
        signFacingY: number,
        labelX: number,
        labelY: number,
        shelfOrigin: THREE.Vector3,
        shelfRotY: number,
        yAxis: THREE.Vector3,
    ): void {
        const worldPos = new THREE.Vector3(labelX, labelY, localZ)
            .applyAxisAngle(yAxis, shelfRotY)
            .add(shelfOrigin)
        this.placeSign('canvas', {
            uniqueIdentifier,
            text,
            anchorPosition: worldPos,
            mount: { style: 'above-shelf', yOffset: 0, signFacingY },
            style: SignStyles.ShelfEndLabel,
        })
    }

    public clearAll(): void {
        for (const renderer of new Set(Object.values(this.rendererByKind))) {
            renderer.clearAll(this.scene)
        }
        this.rendererByIdentifier.clear()
    }

    public dispose(): void {
        for (const renderer of new Set(Object.values(this.rendererByKind))) {
            renderer.dispose(this.scene)
        }
        this.rendererByIdentifier.clear()
    }


    /**
     * TD(neon-skeleton): neon entrance sign disabled — stroke-skeleton rendering not yet implemented.
     * See docs/plans/neon-stroke-skeleton-plan.md to re-enable.
     */
    /**
     * Font: helvetiker_bold.typeface.json (MgOpen license — see THIRD_PARTY_LICENSES.md)
     * TD: add helvetiker copyright to credits UI before public release (phase 3).
     * TODO(layout): position should come from a layout coordinator, not be hardcoded here.
     */
    private syncSteamLibraryBlockSign(): void {
        // Mounted high on the back wall, facing the player at the entrance.
        // Offset by half the sign depth so letters sit flush against the wall surface.
        const SIGN_DEPTH = 0.08
        const backWallZ   = this.roomWorldOffsetZ - (this.roomDepth / 2) + SIGN_DEPTH / 2
        const signHeightY = RoomConstants.STORE_CEILING_HEIGHT - 0.5
        this.placeSign('block-letter', {
            uniqueIdentifier: 'steam-library-title',
            text: this.steamLibraryTitleText,
            anchorPosition: new THREE.Vector3(0, signHeightY, backWallZ),
            style: {
                color: 0x003087,
                fontSize: 0.35,
                depth: SIGN_DEPTH,
            },
        })
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
