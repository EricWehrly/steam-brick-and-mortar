import * as THREE from 'three'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { EventManager } from '../../core/EventManager'
import { RenderLoopRegistry } from '../RenderLoopRegistry'
import { Logger } from '../../utils/Logger'
import {
    GameEventTypes, InputEventTypes, UIEventTypes,
    type GameSelectedEvent, type CancelPressedEvent, type MenuOpenEvent, type MenuCloseEvent
} from '../../types/InteractionEvents'
import type { SteamGameData } from '../game-box/types/GameData'
import type { XRControllerSource } from '../../webxr/XRControllerManager'
import { UikitPointerBridge } from '../uikit/UikitPointerBridge'
import { GameBoxFoldModel } from './GameBoxFoldModel'
import { OPEN_BOX_HALF_WIDTH } from './GameBoxFoldDimensions'
import type { GameBoxFoldHeaderImage } from './GameBoxFoldContent'
import { GameArtworkProvider, ARTWORK_DIMENSIONS } from '../game-box/instancing/GameArtworkProvider'
import { formatRating } from '../categorization/RatingFormat'
import { getTopSteamSpyTags } from '../../steam/utils/SteamSpyTags'

// Community tags (SteamSpy) can run long - capped so the second flap's face stays legible.
const MAX_TAGS_SHOWN = 6

function dedupe(items: readonly string[]): string[] {
    const seenLowercase = new Set<string>()
    return items.filter(item => {
        const key = item.toLowerCase()
        const isNew = !seenLowercase.has(key)
        seenLowercase.add(key)
        return isNew
    })
}

// steam:// launches via the OS protocol handler (same mechanism the old BinderGameDetailPanel used
// via a plain <a href>). Untested inside the desktop webview specifically (no Tauri shell plugin
// yet) - not a regression either way, since the old link was never verified there either.
const STEAM_LAUNCH_URL_PREFIX = 'steam://run/'

// Parented local offsets so the box reads as "held," not intersecting the camera/hand. Flatscreen
// centers in view; VR sits just in front of the grip.
//
// Camera-anchor distance isn't a fixed constant (see computeCameraAnchorDistance()): fovY is fixed
// but fovX depends on aspect, so a fixed distance overflows some window shapes. Recomputed at
// summon time from the real FOV; FALLBACK_CAMERA_DISTANCE covers the one case (non-
// PerspectiveCamera) where FOV/aspect aren't available.
const FALLBACK_CAMERA_DISTANCE = 0.7
// How much of the camera's horizontal FOV the open box's full width may fill - leaves margin
// instead of framing edge-to-edge. Doesn't account for the open box being wider than it is tall
// (three panels side by side), so some vertical margin is inherent regardless of this value.
export const OPEN_BOX_SAFE_FOV_FRACTION = 0.85
// Extra distance held in reserve on top of the FOV-fit calculation - a flat margin, not a change
// to the fit itself.
export const CAMERA_ANCHOR_DISTANCE_MARGIN = 0.05
// VR's own reserve for the same camera-anchor path (single connected controller) - kept separate
// from the flatscreen margin above since the two don't move together (flatscreen wants closer, VR
// wants further). Not live-verified in headset yet.
export const VR_CAMERA_ANCHOR_DISTANCE_MARGIN = 0.3
// Clamped so an extreme aspect ratio can't push distance uncomfortably close or absurdly far.
// MIN sits below OPEN_BOX_SAFE_FOV_FRACTION's own fit+margin distance at a standard 16:9 window,
// so the fraction - not this floor - is what actually governs size at the common case.
export const MIN_CAMERA_ANCHOR_DISTANCE = 0.4
export const MAX_CAMERA_ANCHOR_DISTANCE = 1.4
// Pushed out from the grip so the box reads as "held out to look at," not against the face.
const GRIP_LOCAL_OFFSET = new THREE.Vector3(0, 0.05, -0.32)

// Flatscreen-only tilt for dimensionality - held dead square to the camera, the box read flat/2D.
// Pitch only, deliberately no yaw: a yawed edge's two ends sit at different distances from the
// camera this close (real perspective convergence, not a rotation bug), which reads as the box's
// top edge sloping. Pitch alone keeps both ends of every horizontal edge equidistant, so it can't
// reintroduce that regardless of how close the box is held.
//
// Sign is positive, not the negative it looks like it should be: this rotation applies (via
// rotation.order 'YXZ') BEFORE the MODEL_FACING_ROTATION_Y flip below, and that 180-degree flip
// negates the pitch's local Z contribution along with X - so a negative value here actually tips
// the top toward the camera once the flip is applied on top of it.
export const FLATSCREEN_TILT_PITCH_DEGREES = 9
// The model's front cover faces its own local -Z; parented to a camera/grip whose forward is also
// local -Z, it would face away from the viewer without this flip.
export const MODEL_FACING_ROTATION_Y = Math.PI
// Grip-only, on top of MODEL_FACING_ROTATION_Y: a controller's forward points "out and down" in a
// natural grip, so with only the Y-flip the box's face angled down toward the palm. Pitching it
// forward brings the face to a natural viewing angle. Unconfirmed in headset - flip the sign and
// re-test if it faces the wrong way.
const GRIP_BOX_PITCH_DEGREES = -90
// Below this many connected controllers, camera-anchor instead of grip-anchor so the player keeps
// a free hand to point/interact with.
const MIN_CONTROLLERS_FOR_GRIP_ANCHOR = 2

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
 *
 * Interaction on the box's faces is uikit's own (a UikitPointerBridge routes mouse and WebXR
 * controller input at the model's uikit pages), attached only while a box is summoned. This class
 * knows nothing about which controls exist on which face.
 */
export class GameBoxFoldCoordinator {
    private static readonly logger = Logger.createLogFunctions(GameBoxFoldCoordinator.name)

    private readonly eventManager: EventManager
    private readonly renderLoopRegistry: RenderLoopRegistry
    private readonly model: GameBoxFoldModel
    private readonly pointerBridge: UikitPointerBridge
    private readonly artworkProvider = GameArtworkProvider.getInstance()
    // Plain pixel bundles, not GPU textures - the store panel rasterizes them into a scratch
    // canvas itself, so there's nothing here to .dispose().
    private readonly headerImageCache = new Map<string, GameBoxFoldHeaderImage>()

    private currentAppid: string | null = null
    // Set when GameEventTypes.Selected arrives while a box is already summoned - playClose()
    // needs to finish (see onFullyClosed below) before it's safe to re-texture/reopen with the
    // new game, so the selection waits here rather than re-texturing the still-open box in place.
    private pendingSelection: { appid: string; game: SteamGameData } | null = null

    constructor() {
        this.eventManager = EventManager.getInstance()
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()

        this.model = new GameBoxFoldModel(this.launchCurrentGame)
        // THREE's default Euler order ('XYZ') applies yaw before pitch, which visibly rolls the
        // top edge out of level once both are nonzero (as the flatscreen tilt below sets up).
        // 'YXZ' - pitch first, then yaw around the fixed vertical - measures exactly level.
        this.model.group.rotation.order = 'YXZ'
        this.model.group.rotation.y = MODEL_FACING_ROTATION_Y
        this.model.group.visible = false
        // Controller rays only ever need to hit this box, so the model's own group is the
        // intersection root - not the whole scene.
        this.pointerBridge = new UikitPointerBridge(this.model.group)
        this.model.onFullyClosed(() => {
            if (this.pendingSelection) {
                const { appid, game } = this.pendingSelection
                this.pendingSelection = null
                this.summon(appid, game)
                return
            }
            this.pointerBridge.detach()
            this.model.group.visible = false
            this.model.group.removeFromParent()
            this.currentAppid = null
            this.eventManager.emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'game-box' })
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

        this.pointerBridge.detach()
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

        // Nothing summoned: open directly. Something already open (even the same game re-selected):
        // close first, reopen once onFullyClosed fires - re-texturing in place skipped the
        // animation, which read as the selection silently swapping with no feedback.
        if (this.currentAppid === null) {
            // Not emitted in summon() - that also runs for a mid-close reopen (pendingSelection
            // below), where the box was never really "closed," so a second Open/Close would be noise.
            this.eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'game-box' })
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
            // undefined (no rating data) is distinct from Steam's real "0/no reviews" value -
            // collapsing both to 0 made "no data" and "confirmed unrated" render the same
            // misleading "Unrated" text. Omitting the field (GameBoxFoldContent.rating is
            // optional) makes the debug panel skip the row instead.
            rating: game.userscore !== undefined ? formatRating(game.userscore) : undefined,
            playtimeHours: game.playtime_forever ? Math.round(game.playtime_forever / 60) : undefined,
            recentPlaytimeHours: game.playtime_2weeks ? Math.round(game.playtime_2weeks / 60) : undefined,
            genres: dedupe(game.genres?.map(g => g.description) ?? []),
            tags: this.buildTags(game),
            // Steam's own category list sometimes repeats an entry verbatim. Not currently shown
            // on any face (see GameBoxDebugPanel's FEATURES-parking comment) but worth passing
            // through clean.
            categories: dedupe(game.categories?.map(c => c.description) ?? []),
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

    /** Community tags (SteamSpy, same source/fallback GroupResolver uses for tag-mode grouping) -
     *  shown as its own section, separate from Steam's own genres. */
    private buildTags(game: SteamGameData): string[] {
        const communityTags = game.steamspy_top_tags?.length
            ? game.steamspy_top_tags
            : getTopSteamSpyTags(game.steamspy_tags)
        return dedupe(communityTags).slice(0, MAX_TAGS_SHOWN)
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
        // Attaching here rather than in summon() is what lets this be unconditional: attach() is a
        // no-op once attached and a no-op again while the renderer/scene/camera aren't published
        // yet, so a summon that lands before they exist just picks up on a later frame - no
        // readiness handshake needed.
        if (this.currentAppid !== null) {
            this.pointerBridge.attach()
        }
        this.pointerBridge.update()
    }

    /** Handed to the store panel's Play control at construction - the panel owns the button, this
     *  owns which game is loaded. */
    private readonly launchCurrentGame = (): void => {
        if (this.currentAppid === null) {
            return
        }
        GameBoxFoldCoordinator.logger.debug(`Play clicked for appid ${this.currentAppid}`)
        window.location.href = `${STEAM_LAUNCH_URL_PREFIX}${this.currentAppid}`
    }

    private attachToAnchor(): void {
        const dm = DataManager.getInstance()
        const controllerSource = dm.get<XRControllerSource>(DataKey.XRControllerSource) ?? null
        // Grip-anchoring only makes sense with a spare hand - with one controller, it's also
        // whatever the player points/clicks with, so gluing the box to it swings it on every aim.
        // Camera-anchor instead with only one controller (same as flatscreen's zero-controller
        // case), so "how many controllers" is the only thing deciding the anchor.
        const connectedControllerCount = controllerSource?.getConnectedControllers?.().length ?? 0
        const grip = connectedControllerCount >= MIN_CONTROLLERS_FOR_GRIP_ANCHOR
            ? controllerSource?.getPrimaryControllerGrip() ?? null
            : null

        if (grip) {
            grip.add(this.model.group)
            this.model.group.position.copy(GRIP_LOCAL_OFFSET)
            this.model.group.rotation.x = THREE.MathUtils.degToRad(GRIP_BOX_PITCH_DEGREES)
            this.model.group.rotation.y = MODEL_FACING_ROTATION_Y
            return
        }

        const camera = dm.get<THREE.Camera>(DataKey.MainCamera) ?? null
        if (camera) {
            camera.add(this.model.group)
            // Flatscreen (0 controllers) and VR-single-controller both camera-anchor via this same
            // path, but want a different amount of reserve distance held back beyond the tightest
            // FOV-fit - see VR_CAMERA_ANCHOR_DISTANCE_MARGIN's own comment for why they aren't one
            // shared constant.
            const distanceMargin = connectedControllerCount === 0
                ? CAMERA_ANCHOR_DISTANCE_MARGIN
                : VR_CAMERA_ANCHOR_DISTANCE_MARGIN
            const distance = camera instanceof THREE.PerspectiveCamera
                ? this.computeCameraAnchorDistance(camera, distanceMargin)
                : FALLBACK_CAMERA_DISTANCE
            this.model.group.position.set(0, 0, -distance)
            // Reset in case a previous summon this session was grip-anchored (pitch is
            // grip-only) - the same model.group is reused across summons, not recreated.
            this.model.group.rotation.x = connectedControllerCount === 0
                ? THREE.MathUtils.degToRad(FLATSCREEN_TILT_PITCH_DEGREES)
                : 0
            this.model.group.rotation.y = MODEL_FACING_ROTATION_Y
        }
    }

    /** How far in front of the camera the box needs to sit so its fully open width fits within
     *  OPEN_BOX_SAFE_FOV_FRACTION of the camera's *current* horizontal FOV - see this file's
     *  camera-anchor-distance doc comment for why this can't be a fixed constant. Recomputed each
     *  summon, not continuously - a live window resize while a box is already open won't re-fit
     *  until the next selection. */
    private computeCameraAnchorDistance(camera: THREE.PerspectiveCamera, distanceMargin: number): number {
        const verticalFovRad = THREE.MathUtils.degToRad(camera.fov)
        const horizontalFovRad = 2 * Math.atan(Math.tan(verticalFovRad / 2) * camera.aspect)
        const distance = OPEN_BOX_HALF_WIDTH / (OPEN_BOX_SAFE_FOV_FRACTION * Math.tan(horizontalFovRad / 2))
        return THREE.MathUtils.clamp(
            distance + distanceMargin,
            MIN_CAMERA_ANCHOR_DISTANCE, MAX_CAMERA_ANCHOR_DISTANCE
        )
    }

    private findGameByAppid(appid: string): SteamGameData | undefined {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []
        return games.find(g => String(g.appid) === appid)
    }

    /**
     * Goes through the same GameArtworkProvider pixel pipeline the shelf's instanced boxes use,
     * rather than a plain THREE.TextureLoader/<img> load - a raw cross-origin <img> load fails for
     * CDN artwork with no CORS headers, while GameArtworkProvider already resolves it for the
     * shelf instance (and this reuses whatever it already fetched/cached). Header format, not
     * library - the store panel presents it as a disc. Hands the model plain pixels rather than a
     * THREE texture: GameBoxFoldModel draws them into a canvas itself, sidestepping DataTexture's
     * flipY quirk (canvas ImageData is already top-down).
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
