import * as THREE from 'three'
import type { Container } from '@pmndrs/uikit'
import { BOX_WIDTH, BOX_HEIGHT, BOX_DEPTH } from './GameBoxFoldDimensions'
import type { GameBoxFoldContent, GameBoxFoldHeaderImage } from './GameBoxFoldContent'
import { GameBoxIdentityPanel } from './panels/GameBoxIdentityPanel'
import { GameBoxStorePanel } from './panels/GameBoxStorePanel'
import { GameBoxDebugPanel } from './panels/GameBoxDebugPanel'

// Closed-state stacking: base, front cover, and second flap sit at the SAME X/Y footprint,
// separated only by this much local Z, so they read as one closed box (front cover outermost,
// hiding the other two) rather than three coplanar panels z-fighting in the same plane. Opening
// animates it back to zero - see buildOpenClip().
const STACK_GAP = 0.01

// How far a face's uikit page floats off the physical face it's mounted on. Enough to beat
// depth-fighting against a coplanar surface, small enough to read as printed on it.
const PANEL_SURFACE_OFFSET = 0.001

// Animation timing (seconds - THREE.AnimationClip's own unit). Summon (scale) plays first, then
// the front cover swings open, then the second flap - "front cover unfolds to the left, THEN the
// flap beneath unfolds to the right," not simultaneously. playClose() runs this same clip with
// timeScale=-1, so closing is just the reverse in reverse order - no separate close logic needed.
const SUMMON_START_SCALE = 0.05
const SUMMON_DURATION_S = 0.2
const FRONT_COVER_DURATION_S = 0.2
const SECOND_FLAP_DURATION_S = 0.2

// Closing reads better snappier than the reveal - same clip played backward, just faster.
const CLOSE_SPEED_MULTIPLIER = 2

// Fully open stops just short of the flat 180-degree swing, so the two flaps angle in toward the
// viewer slightly instead of lying perfectly coplanar with the base - direct request (2026-09-02:
// "I want the game box flaps to angle in just a little when open"). A book held open naturally
// cups toward the reader the same way; dead flat read as less like a physical object.
// Exported so tests can assert against the real open angle instead of assuming a flat 180.
export const FLAP_OPEN_INWARD_ANGLE_DEGREES = 9
export const FLAP_OPEN_ROTATION = Math.PI - THREE.MathUtils.degToRad(FLAP_OPEN_INWARD_ANGLE_DEGREES)

const HINGE_NAME = {
    frontCover: 'game-box-fold-front-cover-hinge',
    secondFlap: 'game-box-fold-second-flap-hinge'
} as const

// This model is always parented through GameBoxFoldCoordinator, which rotates the whole group
// 180 degrees around Y to face its anchor (MODEL_FACING_ROTATION_Y there). That outer rotation
// negates local X, so a hinge built at local +X lands on the viewer's LEFT once open, and local
// -X lands on the viewer's RIGHT - the opposite of what the sign would suggest read on its own.
// Naming these by their post-rotation, viewer-relative outcome keeps the constructor below
// readable without re-deriving that flip at each call site.
const FRONT_COVER_HINGE_X = BOX_WIDTH / 2 // opens to the viewer's left
const SECOND_FLAP_HINGE_X = -BOX_WIDTH / 2 // opens to the viewer's right

/**
 * A standalone (non-instanced) hinged box: three same-size panels stacked directly on top of one
 * another when closed - base (never moves), front cover (hinged on its left edge, outermost/
 * closest to the viewer when closed - what you see as "the box"), and a second flap beneath the
 * cover (hinged on its right edge). Opening swings the front cover flat to the left first, then
 * the second flap flat to the right, ending as three coplanar panels in a row - see
 * docs/plans/game-box-open-interaction-plan.md.
 *
 * Each panel mesh is plain painted board; its content is a @pmndrs/uikit page mounted just proud of
 * the face and parented to it, so it inherits the hinge's swing and the group's summon scale like
 * any other child (see mountPanel()). Each face has a distinct role: front cover = identity;
 * base/center = store page; second flap = debug. This model owns their placement and animation -
 * what they show lives in ./panels, and interaction is uikit's own (see UikitPointerBridge), not
 * raycast-and-hit-test.
 *
 * Animation is a THREE.AnimationMixer/AnimationClip (playOpen()/playClose() play one clip forward/
 * backward - see buildOpenClip()) rather than a hand-rolled phase/progress state machine. Built
 * once and reused for every selection (see GameBoxFoldCoordinator).
 */
export class GameBoxFoldModel {
    readonly group: THREE.Group

    private readonly baseMesh: THREE.Mesh
    private readonly leftHinge: THREE.Group
    private readonly rightHinge: THREE.Group

    // Unlit (not MeshStandardMaterial): this is printed box art, not a physically-lit surface -
    // PBR lighting response under this scene's lighting made the artwork look washed out.
    private readonly plainMaterial: THREE.MeshBasicMaterial

    private readonly identityPanel = new GameBoxIdentityPanel()
    private readonly storePanel: GameBoxStorePanel
    private readonly debugPanel = new GameBoxDebugPanel()

    private readonly mixer: THREE.AnimationMixer
    private readonly openAction: THREE.AnimationAction

    constructor(onPlay: () => void) {
        this.group = new THREE.Group()
        this.group.name = 'game-box-fold-model'

        this.plainMaterial = new THREE.MeshBasicMaterial({ color: 0x3a2a1a })
        this.storePanel = new GameBoxStorePanel(onPlay)

        // Base: bottom of the stack, furthest from the viewer (largest local Z). The store page
        // faces the viewer (local -Z), revealed once the two flaps swing away.
        this.baseMesh = this.buildPanelMesh()
        this.baseMesh.position.z = 0
        this.mountPanel(this.baseMesh, this.storePanel.container, 'toward-viewer')
        this.group.add(this.baseMesh)

        // Front cover: outermost/closest to the viewer when closed (most negative local Z). See
        // FRONT_COVER_HINGE_X/SECOND_FLAP_HINGE_X above for why "left"/"right" don't match the raw
        // sign. Its page faces away until the hinge's 180-degree swing brings it around.
        this.leftHinge = this.buildFlap(FRONT_COVER_HINGE_X, -2 * STACK_GAP, this.identityPanel.container)
        this.leftHinge.name = HINGE_NAME.frontCover
        // Second flap: sits between base and front cover when closed.
        this.rightHinge = this.buildFlap(SECOND_FLAP_HINGE_X, -STACK_GAP, this.debugPanel.container)
        this.rightHinge.name = HINGE_NAME.secondFlap
        this.group.add(this.leftHinge, this.rightHinge)

        this.mixer = new THREE.AnimationMixer(this.group)
        this.openAction = this.mixer.clipAction(this.buildOpenClip())
        this.openAction.setLoop(THREE.LoopOnce, 1)
        this.openAction.clampWhenFinished = true
    }

    /** Plays summon-then-open forward from wherever the animation currently is. */
    playOpen(): void {
        this.openAction.paused = false
        this.openAction.timeScale = 1
        this.openAction.play()
    }

    /** Reverses the same clip - open finishes, then front cover, then summon-scale-down - back to
     *  fully closed, at CLOSE_SPEED_MULTIPLIER speed. No separate close-animation logic: it's just
     *  this clip played backward, faster. */
    playClose(): void {
        this.openAction.paused = false
        this.openAction.timeScale = -CLOSE_SPEED_MULTIPLIER
        this.openAction.play()
    }

    /** Registers a callback for playClose()'s reverse playback reaching the start (fully closed
     *  and scaled down again) - the coordinator's cue to hide/detach/reset. Fires once per call to
     *  playClose() that runs to completion (not on playOpen() finishing). */
    onFullyClosed(callback: () => void): void {
        this.mixer.addEventListener('finished', event => {
            if (event.direction < 0) {
                callback()
            }
        })
    }

    /** Call every frame while summoned/animating. deltaSeconds - THREE.AnimationMixer's own unit,
     *  not the milliseconds RenderLoopRegistry callbacks otherwise receive. */
    update(deltaSeconds: number): void {
        this.mixer.update(deltaSeconds)
        // uikit's Component.update() contract is milliseconds, and only on a root - each face's
        // page is its own root, so all three get driven here.
        const deltaMilliseconds = deltaSeconds * 1000
        for (const root of this.getPanelRoots()) {
            root.update(deltaMilliseconds)
        }
    }

    /** The three uikit page roots, for whatever routes pointer input at them (see
     *  UikitPointerBridge) - they're ordinary Object3D descendants of this model's group. */
    getPanelRoots(): readonly Container[] {
        return [this.storePanel.container, this.identityPanel.container, this.debugPanel.container]
    }

    /** Repopulates all three faces. Panels rebuild their own content sections; the roots, their
     *  scene-graph placement and the header texture all persist across selections. */
    setContent(content: GameBoxFoldContent): void {
        this.storePanel.setContent(content)
        this.debugPanel.setContent(content)
    }

    /** Hands header-art pixels to the store panel's disc. Pass null to clear back to a placeholder.
     *  Caller owns the pixel data's lifecycle - a plain typed array, nothing to dispose. */
    setHeaderImage(image: GameBoxFoldHeaderImage | null): void {
        this.storePanel.setHeaderImage(image)
    }

    dispose(): void {
        this.mixer.stopAllAction()
        this.baseMesh.geometry.dispose()
        this.leftHinge.children.forEach(child => (child as THREE.Mesh).geometry?.dispose())
        this.rightHinge.children.forEach(child => (child as THREE.Mesh).geometry?.dispose())

        this.plainMaterial.dispose()
        this.storePanel.dispose()
        for (const root of this.getPanelRoots()) {
            root.dispose()
        }
    }

    /**
     * hingeX: group-local X of the pivot edge (one side of the shared central footprint). The
     * panel itself is offset -hingeX within the hinge's own local space, so it sits centered on
     * the group's origin when closed (rotation 0) and lands a full BOX_WIDTH to the opposite side
     * once open (rotation PI negates local X - see buildOpenClip). closedZ: local Z when closed,
     * establishing this panel's depth in the closed stack.
     */
    private buildFlap(hingeX: number, closedZ: number, page: Container): THREE.Group {
        const hinge = new THREE.Group()
        hinge.position.set(hingeX, 0, closedZ)

        const mesh = this.buildPanelMesh()
        mesh.position.x = -hingeX
        this.mountPanel(mesh, page, 'away-from-viewer')
        hinge.add(mesh)

        return hinge
    }

    /**
     * Parents a uikit page just off one face of a panel mesh. A uikit root is an ordinary
     * Object3D, so once mounted it inherits the hinge swing and the group's summon scale for free -
     * nothing has to keep it aligned per frame.
     *
     * A uikit page's front is its local +Z and it's centered on its own origin, matching the mesh
     * it mounts to, so facing is the only thing to get right: 'toward-viewer' pages (the base's
     * store page) sit on the mesh's -Z side turned to face that way, while 'away-from-viewer' pages
     * (both flaps) sit on the +Z side and are brought around by their hinge's 180-degree swing.
     */
    private mountPanel(mesh: THREE.Mesh, page: Container, facing: 'toward-viewer' | 'away-from-viewer'): void {
        const offset = BOX_DEPTH / 2 + PANEL_SURFACE_OFFSET
        if (facing === 'toward-viewer') {
            page.position.set(0, 0, -offset)
            page.rotation.y = Math.PI
        } else {
            page.position.set(0, 0, offset)
        }
        mesh.add(page)
    }

    /**
     * One clip, played forward for open and backward (timeScale=-1) for close - see playOpen()/
     * playClose(). Track name conventions are THREE.AnimationMixer's own: '.scale' with no node
     * prefix targets the root object itself (this.group); 'nodeName.property[component]' finds a
     * named descendant (see HINGE_NAME) via the mixer's own object-name lookup.
     *
     * Each hinge animates its Z back to zero alongside its swing. Without that, the flaps kept the
     * depth offsets they need while stacked closed (STACK_GAP apart, so the cover reads as the
     * outermost layer of one solid box) all the way through to fully open, leaving the three
     * finished faces stair-stepped toward the viewer - the left face a full 2*STACK_GAP proud of
     * the center, the right one STACK_GAP. Landing both hinges' Z back at 0 removes that stagger,
     * while the closed stack is unchanged.
     *
     * The rotation itself targets FLAP_OPEN_ROTATION, not a flat Math.PI - see that constant's own
     * comment for why (both flaps tilt in toward the viewer together, a shallow cupped shape
     * rather than a dead-flat triptych).
     */
    private buildOpenClip(): THREE.AnimationClip {
        const summonEnd = SUMMON_DURATION_S
        const frontCoverEnd = summonEnd + FRONT_COVER_DURATION_S
        const secondFlapEnd = frontCoverEnd + SECOND_FLAP_DURATION_S

        const scaleTrack = new THREE.VectorKeyframeTrack(
            '.scale',
            [0, summonEnd],
            [SUMMON_START_SCALE, SUMMON_START_SCALE, SUMMON_START_SCALE, 1, 1, 1]
        )
        const frontCoverTrack = new THREE.NumberKeyframeTrack(
            `${HINGE_NAME.frontCover}.rotation[y]`,
            [summonEnd, frontCoverEnd],
            [0, FLAP_OPEN_ROTATION]
        )
        const frontCoverDepthTrack = new THREE.NumberKeyframeTrack(
            `${HINGE_NAME.frontCover}.position[z]`,
            [summonEnd, frontCoverEnd],
            [-2 * STACK_GAP, 0]
        )
        const secondFlapTrack = new THREE.NumberKeyframeTrack(
            `${HINGE_NAME.secondFlap}.rotation[y]`,
            [frontCoverEnd, secondFlapEnd],
            [0, FLAP_OPEN_ROTATION]
        )
        const secondFlapDepthTrack = new THREE.NumberKeyframeTrack(
            `${HINGE_NAME.secondFlap}.position[z]`,
            [frontCoverEnd, secondFlapEnd],
            [-STACK_GAP, 0]
        )

        return new THREE.AnimationClip('game-box-fold-open', secondFlapEnd, [
            scaleTrack, frontCoverTrack, frontCoverDepthTrack, secondFlapTrack, secondFlapDepthTrack
        ])
    }

    private buildPanelMesh(): THREE.Mesh {
        const geometry = new THREE.BoxGeometry(BOX_WIDTH, BOX_HEIGHT, BOX_DEPTH)
        const mesh = new THREE.Mesh(geometry, this.plainMaterial)
        mesh.name = 'game-box-fold-panel'
        return mesh
    }
}
