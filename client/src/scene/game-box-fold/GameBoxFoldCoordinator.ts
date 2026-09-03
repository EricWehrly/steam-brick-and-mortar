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

// steam:// URIs launch through the OS protocol handler, same mechanism the old
// BinderGameDetailPanel used via a plain <a href="steam://run/..."> - there's no Tauri shell
// plugin in this project yet, so this is untested inside the desktop webview specifically; it's
// not a regression either way since the old panel's own link was never verified there.
const STEAM_LAUNCH_URL_PREFIX = 'steam://run/'

// Parented local offsets so the box reads as "held" rather than intersecting the camera/hand.
// Flatscreen is centered in view (not off to a corner); VR sits just in front of the grip so it
// doesn't clip into the controller model. Visual tuning is an open question (see the plan doc).
//
// Camera-anchor distance is NOT a fixed constant (see computeCameraAnchorDistance() below) - a
// fixed -0.35, then -0.7, was each tuned against whatever window aspect ratio happened to be open
// at the time, and both overflowed at other aspect ratios: fovY is fixed (SceneManager's
// CAMERA_FOV) but fovX depends on aspect, so a narrower/taller window has a narrower horizontal
// FOV and the same physical-width open box (see GameBoxFoldModel.OPEN_BOX_HALF_WIDTH) fills more
// of it - direct request (2026-08-21), confirmed via projection math: at the -0.7 distance that
// fixed the wide-desktop case, anything narrower than roughly a square window (aspect < ~1) would
// already overflow again. Recomputed at summon time; see FALLBACK_CAMERA_DISTANCE for the one case
// (a non-PerspectiveCamera) where the real fov/aspect aren't available to compute from.
const FALLBACK_CAMERA_DISTANCE = 0.7
// How much of the camera's current horizontal FOV the open box's full width is allowed to fill -
// leaves margin on both sides rather than framing it edge-to-edge. Exported so a test can verify
// the fit formula without duplicating it.
export const OPEN_BOX_SAFE_FOV_FRACTION = 0.7
// Extra distance held in reserve, added on top of the FOV-fit calculation below - direct request
// (2026-09-02: "I want ... the box to be a little further from the camera when open"). The
// FOV-fit math alone frames the box as tightly as it safely can; this is a flat margin on top of
// that, not a change to the fit itself. Exported so a test can verify against it directly instead
// of re-deriving the fit formula.
export const CAMERA_ANCHOR_DISTANCE_MARGIN = 0.15
// Clamped so an extreme aspect ratio can't push the computed distance uncomfortably close (very
// wide window) or absurdly far away, tiny-looking (very narrow window).
const MIN_CAMERA_ANCHOR_DISTANCE = 0.5
const MAX_CAMERA_ANCHOR_DISTANCE = 1.4
// Pushed further from the grip twice now (was -0.12, then -0.22) per direct request each time -
// held right at the hand, the box ended up right in front of the player's face too, and even at
// -0.22 it was still "a bit too close to read in VR" (2026-09-02). More separation from the grip
// reads as "holding it out to look at" instead.
const GRIP_LOCAL_OFFSET = new THREE.Vector3(0, 0.05, -0.32)
// Flatscreen-only (see attachToAnchor()'s connectedControllerCount === 0 check): held square to
// the camera read as flat/2D - direct request (2026-09-02: "should be held at a bit of an angle
// so as to give it some dimensionality, object believability"). Not applied in VR (grip-anchored,
// or camera-anchored with a single connected controller) - that framing wasn't asked for and the
// grip pitch already gives VR its own deliberate angle.
//
// Pitch only, deliberately no yaw - a first pass paired this with a yaw for a fuller "product
// shot" 3/4 angle, but held this close to the camera (see CAMERA_ANCHOR_DISTANCE_MARGIN's own
// comment on how close that fit math keeps it), a yawed edge's two ends sit at genuinely different
// distances from the camera - real perspective convergence, not a rotation bug, and it read as the
// box's top edge sloping (screenshot markup, 2026-09-02, round two: "the line I drew is the flat
// edge... slopes down and to the left... held at an angle on an axis I expect to be flat" - this
// was reported AFTER the rotation-order fix below, meaning the residual slope was perspective, not
// the composition bug that fix targets). Pitching alone keeps both ends of every horizontal edge
// equidistant from the camera - verified both in raw 3D (no roll) and through the real camera's
// projection matrix (no perspective-driven slope either) - so it can't reintroduce this regardless
// of how close the box is held.
export const FLATSCREEN_TILT_PITCH_DEGREES = -14
// The model's cover front faces its own local -Z (see GameBoxFoldModel). Parented to a
// camera/grip whose own forward is also local -Z, the cover would face away from the viewer -
// rotate it to face back toward whatever it's parented to.
export const MODEL_FACING_ROTATION_Y = Math.PI
// Grip-only, on top of MODEL_FACING_ROTATION_Y: a controller's own forward axis points roughly
// "out and down" in a natural grip, so with only the Y-flip above the box's face ended up angled
// down/back toward the palm - reading it meant over-extending the wrist, tilting the controller
// forward to bring the face up into view. Pitching the box forward by 90 degrees is meant to
// bring the face up to a natural viewing angle without that wrist tilt. First-pass, unconfirmed
// in headset - flip the sign below and re-test live if it ends up facing the wrong way.
const GRIP_BOX_PITCH_DEGREES = -90
// See attachToAnchor()'s doc comment - below this many connected controllers, camera-anchor
// instead of grip-anchor, so the player keeps a free hand to point/interact with.
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
        // THREE's default Euler order ('XYZ') applies yaw BEFORE pitch, which - once the box has
        // both a nonzero yaw and a nonzero pitch, as the flatscreen tilt below does - visibly
        // rolls its top edge out of level (verified empirically: default order gave the top edge
        // a real, nonzero vertical slope for pitch=-8deg/yaw=-18deg; 'YXZ' - pitch applied first,
        // then yaw around the fixed vertical - measured exactly level). Direct request (2026-09-02,
        // screenshot markup): "held at an angle on an axis I expect to be flat."
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

        // Nothing summoned yet: open directly. Something already summoned (even the same game
        // re-selected): close first, then reopen with the new content once onFullyClosed fires -
        // re-texturing an already-open box in place skipped the animation entirely, which read as
        // selection just silently swapping the game with no feedback.
        if (this.currentAppid === null) {
            // Emitted here, not in summon() - summon() also runs for a mid-close reopen (see the
            // pendingSelection branch below and onFullyClosed's), where the box was never really
            // "closed" from the world's point of view, so a second Open/Close pair would be noise.
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
            // Distinct from "Steam reports 0/no reviews" (a real, meaningful value - see
            // AppDetailsCache.ts's isDefined-based merge comment): userscore itself is
            // undefined when we never got rating data for this game at all. Collapsing that
            // into 0 (as this used to) made "no data" and "confirmed unrated" both render the
            // same misleading "Unrated" text - direct request (2026-08-20), confirmed live that
            // most boxes were actually hitting the no-data case. Omitting the field entirely
            // here (GameBoxFoldContent.rating is optional) makes the debug panel skip the row.
            rating: game.userscore !== undefined ? formatRating(game.userscore) : undefined,
            playtimeHours: game.playtime_forever ? Math.round(game.playtime_forever / 60) : undefined,
            recentPlaytimeHours: game.playtime_2weeks ? Math.round(game.playtime_2weeks / 60) : undefined,
            genres: dedupe(game.genres?.map(g => g.description) ?? []),
            tags: this.buildTags(game),
            // Steam's own category list sometimes repeats an entry verbatim - deduped the same
            // way tags are (direct request, 2026-09-02: "we need to de-duplicate it sometimes for
            // some reason"). Not currently shown on any face - see GameBoxDebugPanel's own
            // comment on parking the FEATURES section - but still worth passing through clean.
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
     *  shown as its own section, separate from Steam's own genres (direct request, 2026-09-01). */
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
        // Grip-anchoring only makes sense with a spare hand: with a single controller connected,
        // that same controller is also whatever the player points/clicks with, so gluing the box
        // to it too means it swings every time they aim elsewhere. Direct request (2026-08-20):
        // with only one controller, camera-anchor instead - same behavior flatscreen already uses
        // with zero controllers, so this also makes "how many controllers" the only thing that
        // decides the anchor, not a separate VR-only special case.
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
            const distance = camera instanceof THREE.PerspectiveCamera
                ? this.computeCameraAnchorDistance(camera)
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
    private computeCameraAnchorDistance(camera: THREE.PerspectiveCamera): number {
        const verticalFovRad = THREE.MathUtils.degToRad(camera.fov)
        const horizontalFovRad = 2 * Math.atan(Math.tan(verticalFovRad / 2) * camera.aspect)
        const distance = OPEN_BOX_HALF_WIDTH / (OPEN_BOX_SAFE_FOV_FRACTION * Math.tan(horizontalFovRad / 2))
        return THREE.MathUtils.clamp(
            distance + CAMERA_ANCHOR_DISTANCE_MARGIN,
            MIN_CAMERA_ANCHOR_DISTANCE, MAX_CAMERA_ANCHOR_DISTANCE
        )
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
