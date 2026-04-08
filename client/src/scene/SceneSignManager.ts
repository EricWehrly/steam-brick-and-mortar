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
import { SignageRenderer, type SignageConfig } from './SignageRenderer'
import {
    getRecentlyPlayedBucket,
    getBucketLabel,
    sortByRecentlyPlayed,
    RecentlyPlayedBucket,
} from './categorization/CategoryAssigner'
import type { SteamGameData } from './game-box/types/GameData'

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

    private static readonly ABOVE_SHELF_DEFAULT_Y_OFFSET = 0.6
    private static readonly SIGN_Z_FACE_PLAYER = 0.01 // slight forward push to avoid z-fighting

    // For debug live updates
    private _lastShelfPositions: THREE.Vector3[] | null = null
    private _lastShelfRotationsY: number[] | null = null
    private _lastCeilingSignPos: THREE.Vector3 | null = null
    private _debugOverrides: any | null = null
    // - "Category System Tech Debt / SceneSignManager: scene access pattern / SceneManager"
    // - "Category System Tech Debt / SignageRenderer: singleton vs instance"
    constructor() {
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
        if (!scene) throw new Error('SceneSignManager: scene not registered in DataManager (DataKey.MainScene)')
        this.scene = scene
        this.renderer = new SignageRenderer()
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
            text: descriptor.label,
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
    public clearAll(): void {
        for (const label of [...this.signs.keys()]) {
            this.removeSign(label)
        }
    }

    public dispose(): void {
        this.clearAll()
        this.renderer.dispose()
    }

    /**
     * Place time-bucket section signs ("This Week", "This Month", etc.) above shelves.
     *
     * Called after all batches complete, once shelf positions and rotations are known.
     * Skipped automatically for buckets that don't appear in the game data.
     *
     * @param shelfPositions  World-space base positions for each shelf unit
     * @param shelfRotationsY Y-rotation (radians) for each shelf
     * @param games           Full sorted game list (same order as shelf layout)
     * @param ceilingSignPos  Position of the "Recently Played" ceiling sign (signs too close are skipped)
     */
    public placeTimeBucketSigns(
        shelfPositions: THREE.Vector3[],
        shelfRotationsY: number[],
        games: SteamGameData[],
        ceilingSignPos: THREE.Vector3
    ): void {
        if (games.length === 0) return

        this._lastShelfPositions = [...shelfPositions]
        this._lastShelfRotationsY = [...shelfRotationsY]
        this._lastCeilingSignPos = ceilingSignPos.clone()

        const sortedGames = [...games].sort(sortByRecentlyPlayed)

        // Shelf-mount signs sit ON TOP of the shelf unit, just inside the side brackets.
        // shelfPos.y is the base of the unit. DEFAULT_SHELF_CONFIG.height (2.0m) is the top board.
        // boardThickness (0.05m) × 2 subtracted from width (2.0m) = 1.9m interior span;
        // use 1.8m to leave a small margin inside the bracket edges.
        // ⚠️ Do not change SIGN_ANCHOR_Y_OFFSET without checking DEFAULT_SHELF_CONFIG.height.
        const SIGN_ANCHOR_Y_OFFSET = this._debugOverrides?.SIGN_ANCHOR_Y_OFFSET ?? 2.0  // shelf top (DEFAULT_SHELF_CONFIG.height)
        const SIGN_Y_CLEARANCE = this._debugOverrides?.SIGN_Y_CLEARANCE ?? 0.02     // small lift so sign doesn't z-fight with top board
        const SIGN_WIDTH = 1.8            // fits inside side brackets (interior = 1.9m)
        const SIGN_HEIGHT = 0.32          // shelf-top label — slightly shorter than hanging sign
        const MIN_DIST_FROM_CEILING_SIGN = 1.5
        const BATCH_SIZE = 18
        const SIGN_FRONT_OFFSET = this._debugOverrides?.SIGN_FRONT_OFFSET ?? 0.28

        let lastBucket: RecentlyPlayedBucket | null = null

        for (let i = 0; i < shelfPositions.length; i++) {
            const shelfPos = shelfPositions[i]
            const firstGameIndex = i * BATCH_SIZE
            if (firstGameIndex >= sortedGames.length) break

            const firstGame = sortedGames[firstGameIndex]
            const bucket = getRecentlyPlayedBucket(firstGame)

            if (bucket !== RecentlyPlayedBucket.Unplayed && bucket !== lastBucket) {
                const anchor = new THREE.Vector3(
                    shelfPos.x,
                    shelfPos.y + SIGN_ANCHOR_Y_OFFSET + SIGN_Y_CLEARANCE,
                    shelfPos.z
                )
                if (ceilingSignPos.distanceTo(anchor) > MIN_DIST_FROM_CEILING_SIGN) {
                    const facingY = shelfRotationsY[i] ?? (i % 2 === 1 ? Math.PI : 0)
                    this.setSign({
                        label: getBucketLabel(bucket),
                        anchorPosition: anchor,
                        mount: {
                            style: 'above-shelf',
                            yOffset: 0,           // anchor is already at shelf top
                            frontOffset: SIGN_FRONT_OFFSET,
                            signFacingY: facingY,
                        },
                        style: { ...SignStyles.Category, width: SIGN_WIDTH, height: SIGN_HEIGHT }
                    })
                }
                lastBucket = bucket
            }
        }
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
