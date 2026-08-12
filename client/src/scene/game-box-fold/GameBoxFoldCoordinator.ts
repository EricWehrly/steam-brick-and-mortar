import * as THREE from 'three'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { EventManager } from '../../core/EventManager'
import { RenderLoopRegistry } from '../RenderLoopRegistry'
import { Logger } from '../../utils/Logger'
import {
    GameEventTypes, InputEventTypes,
    type GameSelectedEvent, type CancelPressedEvent
} from '../../types/InteractionEvents'
import type { SteamGameData } from '../game-box/types/GameData'
import type { XRControllerRaySource } from '../../webxr/XRControllerManager'
import { GameBoxFoldModel } from './GameBoxFoldModel'
import { GameArtworkProvider, ARTWORK_DIMENSIONS } from '../game-box/instancing/GameArtworkProvider'

// Parented local offsets so the box reads as "held" rather than intersecting the camera/hand.
// Flatscreen is centered in view (not off to a corner); VR sits just in front of the grip so it
// doesn't clip into the controller model. Visual tuning is an open question (see the plan doc).
const CAMERA_LOCAL_OFFSET = new THREE.Vector3(0, 0, -0.6)
const GRIP_LOCAL_OFFSET = new THREE.Vector3(0, 0.05, -0.12)
// The model's cover front faces its own local -Z (see GameBoxFoldModel). Parented to a
// camera/grip whose own forward is also local -Z, the cover would face away from the viewer -
// rotate it to face back toward whatever it's parented to.
const MODEL_FACING_ROTATION_Y = Math.PI

/**
 * Owns exactly one pre-warmed GameBoxFoldModel, summoned/re-textured/anchored on
 * GameEventTypes.Selected and dismissed on CancelPressed. See
 * docs/plans/game-box-open-interaction-plan.md for the full design. Registers as an override
 * handler for GameEventTypes.Selected (EventManager's capability-based handler selection) so
 * GameLibraryBinderUI's default flat-overlay handler steps aside automatically - see
 * GameBoxFoldConfig.ts for the const gate controlling whether this class is even constructed.
 * Animation itself (summon scale, sequential hinge open/close) lives entirely in
 * GameBoxFoldModel via a THREE.AnimationMixer/AnimationClip - this class only drives
 * model.update() each frame and calls playOpen()/playClose() at the right moments.
 */
export class GameBoxFoldCoordinator {
    private static readonly logger = Logger.createLogFunctions(GameBoxFoldCoordinator.name)

    private readonly eventManager: EventManager
    private readonly renderLoopRegistry: RenderLoopRegistry
    private readonly model: GameBoxFoldModel
    private readonly artworkProvider = GameArtworkProvider.getInstance()
    private readonly coverTextureCache = new Map<string, THREE.DataTexture>()

    private currentAppid: string | null = null

    constructor() {
        this.eventManager = EventManager.getInstance()
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()

        this.model = new GameBoxFoldModel()
        this.model.group.rotation.y = MODEL_FACING_ROTATION_Y
        this.model.group.visible = false
        this.model.onFullyClosed(() => {
            this.model.group.visible = false
            this.model.group.removeFromParent()
            this.currentAppid = null
        })

        this.eventManager.registerEventHandler<GameSelectedEvent>(
            GameEventTypes.Selected,
            this.handleGameSelected,
            { isOverride: true }
        )
        this.eventManager.registerEventHandler<CancelPressedEvent>(
            InputEventTypes.CancelPressed,
            this.handleCancelPressed
        )

        this.renderLoopRegistry.register(this.constructor.name, this.update)
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(GameEventTypes.Selected, this.handleGameSelected)
        this.eventManager.deregisterEventHandler(InputEventTypes.CancelPressed, this.handleCancelPressed)
        this.renderLoopRegistry.unregister(this.constructor.name)

        this.model.group.removeFromParent()
        this.model.dispose()
        this.coverTextureCache.forEach(texture => texture.dispose())
        this.coverTextureCache.clear()
    }

    private readonly handleGameSelected = (event: CustomEvent<GameSelectedEvent>): void => {
        const appid = String(event.detail.appid)
        const game = this.findGameByAppid(appid)
        if (!game) {
            GameBoxFoldCoordinator.logger.warn(`No game data found for appid ${appid}`)
            return
        }

        this.currentAppid = appid
        this.model.setContent({
            name: game.name,
            genre: game.genres?.[0]?.description,
            playtimeHours: game.playtime_forever ? Math.round(game.playtime_forever / 60) : undefined
        })
        this.applyCoverTexture(game)
        this.attachToAnchor()

        this.model.group.visible = true
        this.model.playOpen()
    }

    private readonly handleCancelPressed = (): void => {
        if (this.currentAppid === null) {
            return
        }
        this.model.playClose()
    }

    private readonly update = (_now: number, deltaTime: number): void => {
        // AnimationMixer's own unit is seconds; RenderLoopRegistry callbacks receive milliseconds.
        this.model.update(deltaTime / 1000)
    }

    private attachToAnchor(): void {
        const dm = DataManager.getInstance()
        const raySource = dm.get<XRControllerRaySource>(DataKey.XRControllerRaySource) ?? null
        const grip = raySource?.getPrimaryControllerGrip() ?? null

        if (grip) {
            grip.add(this.model.group)
            this.model.group.position.copy(GRIP_LOCAL_OFFSET)
            return
        }

        const camera = dm.get<THREE.Camera>(DataKey.MainCamera) ?? null
        if (camera) {
            camera.add(this.model.group)
            this.model.group.position.copy(CAMERA_LOCAL_OFFSET)
        }
    }

    private findGameByAppid(appid: string): SteamGameData | undefined {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []
        return games.find(g => String(g.appid) === appid)
    }

    /**
     * Goes through the same GameArtworkProvider pixel pipeline the shelf's instanced boxes use,
     * rather than a plain THREE.TextureLoader/<img> load - a raw cross-origin <img> load is
     * subject to the browser's normal CORS enforcement and fails for CDN artwork with no CORS
     * headers (confirmed via console: library_600x900.jpg blocked by CORS, appid 219680), while
     * GameArtworkProvider's pipeline already resolves this same artwork successfully for the
     * shelf instance. Bonus: reuses whatever the shelf's own request already fetched/decoded/
     * disk-cached for this appid instead of a second network round-trip.
     */
    private async applyCoverTexture(game: SteamGameData): Promise<void> {
        const appid = String(game.appid)
        const cached = this.coverTextureCache.get(appid)
        if (cached) {
            this.model.setCoverTexture(cached)
            return
        }

        this.model.setCoverTexture(null)
        const { width, height } = ARTWORK_DIMENSIONS.library
        try {
            const artwork = this.artworkProvider.getArtwork(Number(game.appid), game.name, 'library', {
                library: game.artwork?.library,
                header: game.artwork?.header
            })
            const { pixels } = await artwork.getPixelsAtSize(width, height)

            const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
            texture.colorSpace = THREE.SRGBColorSpace
            // THREE.DataTexture's own constructor unconditionally sets flipY=false (confirmed by
            // reading node_modules/three/src/textures/DataTexture.js directly - a prior "fix" here
            // set it to false explicitly, which was a no-op against that default, and a later
            // "fix" left it unset assuming the false default; both were wrong because the default
            // itself was never actually true). texture-processing.worker.ts's getImageData() is
            // standard top-down pixel data, same as any decoded image - displaying it right-side
            // up on a normally-UV-mapped mesh needs flipY=true, which is why base Texture defaults
            // to it; DataTexture overrides that default for its more common raw-data use cases,
            // which doesn't apply to this photo data, so override it back explicitly.
            texture.flipY = true
            texture.needsUpdate = true

            this.coverTextureCache.set(appid, texture)
            if (this.currentAppid === appid) {
                this.model.setCoverTexture(texture)
            }
        } catch (error) {
            GameBoxFoldCoordinator.logger.warn(`Failed to load cover art for appid ${appid}`, error)
        }
    }
}
