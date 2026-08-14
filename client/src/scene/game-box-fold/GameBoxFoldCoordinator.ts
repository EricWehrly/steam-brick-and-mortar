import * as THREE from 'three'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { EventManager } from '../../core/EventManager'
import { RenderLoopRegistry } from '../RenderLoopRegistry'
import { Logger } from '../../utils/Logger'
import {
    GameEventTypes, InputEventTypes,
    type GameSelectedEvent, type CancelPressedEvent,
    type SceneCanvasClickEvent, type SceneCanvasWheelEvent
} from '../../types/InteractionEvents'
import type { SteamGameData } from '../game-box/types/GameData'
import type { XRControllerRaySource } from '../../webxr/XRControllerManager'
import { GameBoxFoldModel, PANEL_CANVAS_SIZE, type GameBoxFoldHeaderImage } from './GameBoxFoldModel'
import { GameArtworkProvider, ARTWORK_DIMENSIONS } from '../game-box/instancing/GameArtworkProvider'
import { formatRating } from '../categorization/RatingFormat'
import { getTopSteamSpyTags } from '../../steam/utils/SteamSpyTags'

// Genres first (usually 1-3, Steam's own categorization), then community tags (SteamSpy) - capped
// so the second flap's face stays legible rather than listing everything available.
const MAX_TAGS_SHOWN = 6

// steam:// URIs launch through the OS protocol handler, same mechanism the old
// BinderGameDetailPanel used via a plain <a href="steam://run/..."> - there's no Tauri shell
// plugin in this project yet, so this is untested inside the desktop webview specifically; it's
// not a regression either way since the old panel's own link was never verified there.
const STEAM_LAUNCH_URL_PREFIX = 'steam://run/'

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
 * model.update() each frame and calls playOpen()/playClose() at the right moments. Selecting a
 * game while one is already open always plays close-then-reopen (see pendingSelection) rather
 * than re-texturing the still-open box in place, so every selection gets visible feedback.
 */
export class GameBoxFoldCoordinator {
    private static readonly logger = Logger.createLogFunctions(GameBoxFoldCoordinator.name)

    private readonly eventManager: EventManager
    private readonly renderLoopRegistry: RenderLoopRegistry
    private readonly model: GameBoxFoldModel
    private readonly artworkProvider = GameArtworkProvider.getInstance()
    // Plain pixel bundles, not GPU textures - GameBoxFoldModel rasterizes them into a scratch
    // canvas itself, so there's nothing here to .dispose().
    private readonly headerImageCache = new Map<string, GameBoxFoldHeaderImage>()
    private readonly raycaster = new THREE.Raycaster()

    private currentAppid: string | null = null
    // Set when GameEventTypes.Selected arrives while a box is already summoned - playClose()
    // needs to finish (see onFullyClosed below) before it's safe to re-texture/reopen with the
    // new game, so the selection waits here rather than re-texturing the still-open box in place.
    private pendingSelection: { appid: string; game: SteamGameData } | null = null

    constructor() {
        this.eventManager = EventManager.getInstance()
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()

        this.model = new GameBoxFoldModel()
        this.model.group.rotation.y = MODEL_FACING_ROTATION_Y
        this.model.group.visible = false
        this.model.onFullyClosed(() => {
            if (this.pendingSelection) {
                const { appid, game } = this.pendingSelection
                this.pendingSelection = null
                this.summon(appid, game)
                return
            }
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
        this.eventManager.registerEventHandler<SceneCanvasClickEvent>(
            InputEventTypes.SceneCanvasClick,
            this.handleBoxClick
        )
        this.eventManager.registerEventHandler<SceneCanvasWheelEvent>(
            InputEventTypes.SceneCanvasWheel,
            this.handleBoxWheel
        )

        this.renderLoopRegistry.register(this.constructor.name, this.update)
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(GameEventTypes.Selected, this.handleGameSelected)
        this.eventManager.deregisterEventHandler(InputEventTypes.CancelPressed, this.handleCancelPressed)
        this.eventManager.deregisterEventHandler(InputEventTypes.SceneCanvasClick, this.handleBoxClick)
        this.eventManager.deregisterEventHandler(InputEventTypes.SceneCanvasWheel, this.handleBoxWheel)
        this.renderLoopRegistry.unregister(this.constructor.name)

        this.model.group.removeFromParent()
        this.model.dispose()
        this.headerImageCache.clear()
    }

    private readonly handleGameSelected = (event: CustomEvent<GameSelectedEvent>): void => {
        const appid = String(event.detail.appid)
        const game = this.findGameByAppid(appid)
        if (!game) {
            GameBoxFoldCoordinator.logger.warn(`No game data found for appid ${appid}`)
            return
        }

        // Nothing summoned yet: open directly. Something already summoned (even the same game
        // re-selected): close first, then reopen with the new content once onFullyClosed fires -
        // re-texturing an already-open box in place skipped the animation entirely, which read as
        // selection just silently swapping the game with no feedback.
        if (this.currentAppid === null) {
            this.summon(appid, game)
        } else {
            this.pendingSelection = { appid, game }
            this.model.playClose()
        }
    }

    private summon(appid: string, game: SteamGameData): void {
        this.currentAppid = appid
        this.model.setContent({
            name: game.name,
            rating: formatRating(game.userscore ?? 0),
            playtimeHours: game.playtime_forever ? Math.round(game.playtime_forever / 60) : undefined,
            recentPlaytimeHours: game.playtime_2weeks ? Math.round(game.playtime_2weeks / 60) : undefined,
            tags: this.buildTags(game),
            categories: game.categories?.map(c => c.description),
            userCollections: game.user_collections?.map(c => c.name),
            description: game.short_description,
            metacritic: game.metacritic ? `Metacritic: ${game.metacritic.score}` : undefined,
            debugJson: JSON.stringify(game, null, 2)
        })
        this.applyHeaderImage(game)
        this.attachToAnchor()

        this.model.group.visible = true
        this.model.playOpen()
    }

    /** Genres (Steam's own) followed by top community tags (SteamSpy, same source/fallback
     *  GroupResolver uses for tag-mode grouping) - the two "what kind of game is this" sections
     *  BinderGameDetailPanel showed separately, combined here since the flap has room for one
     *  legible list, not two. */
    private buildTags(game: SteamGameData): string[] {
        const genres = game.genres?.map(g => g.description) ?? []
        const communityTags = game.steamspy_top_tags?.length
            ? game.steamspy_top_tags
            : getTopSteamSpyTags(game.steamspy_tags)

        const seen = new Set<string>()
        const combined: string[] = []
        for (const tag of [...genres, ...communityTags]) {
            const key = tag.toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            combined.push(tag)
        }
        return combined.slice(0, MAX_TAGS_SHOWN)
    }

    private readonly handleCancelPressed = (): void => {
        if (this.currentAppid === null) {
            return
        }
        // A Cancel always means "stay closed" - drop any switch that was queued mid-close.
        this.pendingSelection = null
        this.model.playClose()
    }

    private readonly update = (_now: number, deltaTime: number): void => {
        // AnimationMixer's own unit is seconds; RenderLoopRegistry callbacks receive milliseconds.
        this.model.update(deltaTime / 1000)
    }

    private readonly handleBoxClick = (event: CustomEvent<SceneCanvasClickEvent>): void => {
        if (event.detail.button !== 0) {
            return
        }
        const hit = this.raycastAgainstBox(event.detail.ndcX, event.detail.ndcY)
        if (hit?.face === 'store' && this.model.isPointInPlayButton(hit.canvasX, hit.canvasY) && this.currentAppid) {
            GameBoxFoldCoordinator.logger.debug(`Play clicked for appid ${this.currentAppid}`)
            window.location.href = `${STEAM_LAUNCH_URL_PREFIX}${this.currentAppid}`
        }
    }

    private readonly handleBoxWheel = (event: CustomEvent<SceneCanvasWheelEvent>): void => {
        const hit = this.raycastAgainstBox(event.detail.ndcX, event.detail.ndcY)
        if (hit?.face === 'debug') {
            this.model.scrollDebugPanel(event.detail.deltaY)
        }
    }

    /**
     * Raycasts only against this box's own three content meshes (not the whole scene - the box
     * is a small, self-contained held prop, and SceneClickGameBoxRaycast's shelf-wide raycast is a
     * different concern with a different hit contract). Returns which panel was hit and the
     * canvas-space point within it (via intersection.uv - see GameBoxFoldModel for the
     * UV<->canvas mapping derivation), or null if nothing summoned, the ray misses, or it lands on
     * one of a mesh's five blank faces rather than its content face.
     */
    private raycastAgainstBox(ndcX: number, ndcY: number): { face: 'store' | 'identity' | 'debug'; canvasX: number; canvasY: number } | null {
        if (this.currentAppid === null || !this.model.group.visible) {
            return null
        }
        const camera = DataManager.getInstance().get<THREE.Camera>(DataKey.MainCamera) ?? null
        if (!camera) {
            return null
        }

        const meshes = this.model.getInteractiveMeshes()
        this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
        const intersections = this.raycaster.intersectObjects([meshes.store, meshes.identity, meshes.debug], false)
        const hit = intersections[0]
        if (!hit || !hit.uv) {
            return null
        }

        const mesh = hit.object as THREE.Mesh
        if (!this.model.isContentFaceHit(mesh, hit.face?.materialIndex)) {
            return null
        }

        const face = mesh === meshes.store ? 'store' : mesh === meshes.debug ? 'debug' : 'identity'
        return { face, canvasX: hit.uv.x * PANEL_CANVAS_SIZE, canvasY: (1 - hit.uv.y) * PANEL_CANVAS_SIZE }
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
     * disk-cached for this appid instead of a second network round-trip. Header format (not
     * library) - the store panel presents it as a disc, see GameBoxFoldModel.redrawStorePanel().
     * Hands the model plain pixels rather than building a THREE texture here: GameBoxFoldModel
     * draws it into a canvas (for the disc clip/composite), which sidesteps DataTexture's flipY
     * quirk entirely (canvas ImageData is already top-down, matching the pixel source).
     */
    private async applyHeaderImage(game: SteamGameData): Promise<void> {
        const appid = String(game.appid)
        const cached = this.headerImageCache.get(appid)
        if (cached) {
            this.model.setHeaderImage(cached)
            return
        }

        this.model.setHeaderImage(null)
        const { width, height } = ARTWORK_DIMENSIONS.header
        try {
            const artwork = this.artworkProvider.getArtwork(Number(game.appid), game.name, 'header', {
                library: game.artwork?.library,
                header: game.artwork?.header
            })
            const { pixels } = await artwork.getPixelsAtSize(width, height)

            const headerImage: GameBoxFoldHeaderImage = { pixels, width, height }
            this.headerImageCache.set(appid, headerImage)
            if (this.currentAppid === appid) {
                this.model.setHeaderImage(headerImage)
            }
        } catch (error) {
            GameBoxFoldCoordinator.logger.warn(`Failed to load header art for appid ${appid}`, error)
        }
    }
}
