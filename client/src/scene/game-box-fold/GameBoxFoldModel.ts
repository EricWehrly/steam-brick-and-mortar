import * as THREE from 'three'

// Matches LodArtworkOrchestrator's buildDefaultLodConfig() boxWidth/boxHeight/boxDepth, so the
// summoned box doesn't visually mismatch the shelf instance it stands in for.
const BOX_WIDTH = 0.3
const BOX_HEIGHT = 0.4
const BOX_DEPTH = 0.08

// Closed-state stacking: base, front cover, and second flap sit at the SAME X/Y footprint,
// separated only by this much local Z, so they read as one closed box (front cover outermost,
// hiding the other two) rather than three coplanar panels z-fighting in the same plane.
const STACK_GAP = 0.01

const WING_CONTENT_CANVAS_SIZE = 256

// Animation timing (seconds - THREE.AnimationClip's own unit). Summon (scale) plays first, then
// the front cover swings open, then the second flap - "front cover unfolds to the left, THEN the
// flap beneath unfolds to the right," not simultaneously. playClose() runs this same clip with
// timeScale=-1, so closing is just the reverse in reverse order - no separate close logic needed.
const SUMMON_START_SCALE = 0.05
const SUMMON_DURATION_S = 0.2
const FRONT_COVER_DURATION_S = 0.2
const SECOND_FLAP_DURATION_S = 0.2

const HINGE_NAME = {
    frontCover: 'game-box-fold-front-cover-hinge',
    secondFlap: 'game-box-fold-second-flap-hinge'
} as const

// THREE.BoxGeometry's per-face material groups are built in a fixed order:
// [+X, -X, +Y, -Y, +Z, -Z]. The hinges below only ever rotate 0 <-> PI around Y, so "outer"
// (visible closed) and "inner" (visible open) always land on -Z and +Z respectively regardless
// of which flap. Unlike LabelTextureArrayManager's shelf boxes, nothing here needs a UV mirror
// correction: GameBoxFoldCoordinator rotates the whole model 180 degrees to face its anchor (see
// MODEL_FACING_ROTATION_Y there), and that rotation combined with BoxGeometry's inherently
// reversed -Z winding cancels out to a correctly-oriented image by default - verified against
// BoxGeometry's actual UV generation (node_modules/three/src/geometries/BoxGeometry.js), not
// assumed from the shelf's differently-rotated case.
const FACE_INDEX = { posZ: 4, negZ: 5 } as const

export interface GameBoxFoldContent {
    readonly name: string
    readonly genre?: string
    readonly playtimeHours?: number
}

/**
 * A standalone (non-instanced) hinged box: three same-size panels stacked directly on top of one
 * another when closed - base (never moves), front cover (hinged on its left edge, outermost/
 * closest to the viewer when closed - what you see as "the box"), and a second flap beneath the
 * cover (hinged on its right edge). Opening swings the front cover flat to the left first, then
 * the second flap flat to the right, ending as three coplanar panels in a row (left / base-center
 * / right) - see docs/plans/game-box-open-interaction-plan.md. Owns its own animation via a
 * THREE.AnimationMixer/AnimationClip (playOpen()/playClose() play one clip forward/backward - see
 * buildOpenClip()) rather than a hand-rolled phase/progress state machine. Otherwise a pure
 * display object: no events, no globals beyond what the caller explicitly drives via update().
 * Built once and reused for every selection (see GameBoxFoldCoordinator).
 */
export class GameBoxFoldModel {
    readonly group: THREE.Group

    private readonly baseMesh: THREE.Mesh
    private readonly leftHinge: THREE.Group
    private readonly rightHinge: THREE.Group

    // Unlit (not MeshStandardMaterial): this is printed box art, not a physically-lit surface -
    // PBR lighting response under this scene's lighting made the artwork look washed out.
    private readonly plainMaterial: THREE.MeshBasicMaterial
    private readonly coverMaterial: THREE.MeshBasicMaterial
    private readonly leftContentMaterial: THREE.MeshBasicMaterial
    private readonly rightContentMaterial: THREE.MeshBasicMaterial

    private readonly leftCanvas: HTMLCanvasElement
    private readonly leftContext: CanvasRenderingContext2D
    private readonly leftTexture: THREE.CanvasTexture
    private readonly rightCanvas: HTMLCanvasElement
    private readonly rightContext: CanvasRenderingContext2D
    private readonly rightTexture: THREE.CanvasTexture

    private coverTexture: THREE.Texture | null = null

    private readonly mixer: THREE.AnimationMixer
    private readonly openAction: THREE.AnimationAction

    constructor() {
        this.group = new THREE.Group()
        this.group.name = 'game-box-fold-model'

        this.plainMaterial = new THREE.MeshBasicMaterial({ color: 0x3a2a1a })
        this.coverMaterial = new THREE.MeshBasicMaterial({ color: 0x808080 })

        const leftContent = this.createContentCanvas()
        this.leftCanvas = leftContent.canvas
        this.leftContext = leftContent.context
        this.leftTexture = leftContent.texture
        this.leftContentMaterial = new THREE.MeshBasicMaterial({ map: this.leftTexture })

        const rightContent = this.createContentCanvas()
        this.rightCanvas = rightContent.canvas
        this.rightContext = rightContent.context
        this.rightTexture = rightContent.texture
        this.rightContentMaterial = new THREE.MeshBasicMaterial({ map: this.rightTexture })

        // Base: bottom of the stack, furthest from the viewer (largest local Z). Its front (-Z)
        // face also carries the cover art, so opening reveals a big centered cover once the two
        // flaps swing away - see GameBoxFoldCoordinator.applyCoverTexture.
        this.baseMesh = this.buildPanelMesh([
            this.plainMaterial, this.plainMaterial, this.plainMaterial, this.plainMaterial,
            this.plainMaterial, this.coverMaterial
        ])
        this.baseMesh.position.z = 0
        this.group.add(this.baseMesh)

        // Front cover: outermost/closest to the viewer when closed (most negative local Z - see
        // FACE_INDEX's comment, -Z is "toward the viewer"). Hinges on its LEFT edge.
        this.leftHinge = this.buildFlap(-BOX_WIDTH / 2, BOX_WIDTH / 2, -2 * STACK_GAP, this.leftContentMaterial)
        this.leftHinge.name = HINGE_NAME.frontCover
        // Second flap: sits between base and front cover when closed. Hinges on its RIGHT edge.
        this.rightHinge = this.buildFlap(BOX_WIDTH / 2, -BOX_WIDTH / 2, -STACK_GAP, this.rightContentMaterial)
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
     *  fully closed. No separate close-animation logic: it's just this clip played backward. */
    playClose(): void {
        this.openAction.paused = false
        this.openAction.timeScale = -1
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
    }

    /** Swaps the front-facing cover texture (both the front cover's closed face and the base's
     *  revealed-when-open face). Caller (GameBoxFoldCoordinator) owns the texture's lifecycle -
     *  it's cached/reused across selections, so this method never disposes the previous texture,
     *  only stops referencing it. Pass null to reset to a plain placeholder. */
    setCoverTexture(texture: THREE.Texture | null): void {
        this.coverTexture = texture
        this.coverMaterial.map = texture
        this.coverMaterial.color.set(texture ? 0xffffff : 0x808080)
        this.coverMaterial.needsUpdate = true
    }

    /** Redraws the two flap faces in place, reusing the same canvas/texture objects every call -
     *  the mechanism behind "pre-warmed, near-instant swap-in" (no texture allocation per
     *  selection). Placeholder content only - see the plan doc's face-content open question. */
    setContent(content: GameBoxFoldContent): void {
        this.drawContentPanel(this.leftContext, content.name)
        this.leftTexture.needsUpdate = true

        const genreLine = content.genre ?? 'Unknown genre'
        const playtimeLine = content.playtimeHours !== undefined
            ? `${content.playtimeHours}h played`
            : 'Not played yet'
        this.drawContentPanel(this.rightContext, `${genreLine}\n${playtimeLine}`)
        this.rightTexture.needsUpdate = true
    }

    dispose(): void {
        this.mixer.stopAllAction()
        this.baseMesh.geometry.dispose()
        this.leftHinge.children.forEach(child => (child as THREE.Mesh).geometry.dispose())
        this.rightHinge.children.forEach(child => (child as THREE.Mesh).geometry.dispose())

        this.plainMaterial.dispose()
        this.coverMaterial.dispose()
        this.leftContentMaterial.dispose()
        this.rightContentMaterial.dispose()
        this.leftTexture.dispose()
        this.rightTexture.dispose()
    }

    /**
     * hingeX: world/group-local X of the pivot edge (one side of the shared central footprint).
     * meshLocalX: the panel's offset from that pivot, in the hinge's own local space - chosen so
     * the panel sits centered on the group's origin when closed (rotation 0) and lands a full
     * BOX_WIDTH to the opposite side once open (rotation PI negates local X - see buildOpenClip).
     * closedZ: local Z when closed, establishing this panel's depth in the closed stack.
     */
    private buildFlap(hingeX: number, meshLocalX: number, closedZ: number, contentMaterial: THREE.MeshBasicMaterial): THREE.Group {
        const hinge = new THREE.Group()
        hinge.position.set(hingeX, 0, closedZ)

        const materials: THREE.MeshBasicMaterial[] = [
            this.plainMaterial, this.plainMaterial, this.plainMaterial, this.plainMaterial,
            this.plainMaterial, this.plainMaterial
        ]
        materials[FACE_INDEX.posZ] = contentMaterial

        const mesh = this.buildPanelMesh(materials)
        mesh.position.x = meshLocalX
        hinge.add(mesh)

        return hinge
    }

    /**
     * One clip, played forward for open and backward (timeScale=-1) for close - see playOpen()/
     * playClose(). Track name conventions are THREE.AnimationMixer's own: '.scale' with no node
     * prefix targets the root object itself (this.group); 'nodeName.property[component]' finds a
     * named descendant (see HINGE_NAME) via the mixer's own object-name lookup.
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
            [0, Math.PI]
        )
        const secondFlapTrack = new THREE.NumberKeyframeTrack(
            `${HINGE_NAME.secondFlap}.rotation[y]`,
            [frontCoverEnd, secondFlapEnd],
            [0, Math.PI]
        )

        return new THREE.AnimationClip('game-box-fold-open', secondFlapEnd, [scaleTrack, frontCoverTrack, secondFlapTrack])
    }

    private buildPanelMesh(materials: THREE.MeshBasicMaterial[]): THREE.Mesh {
        const geometry = new THREE.BoxGeometry(BOX_WIDTH, BOX_HEIGHT, BOX_DEPTH)
        const mesh = new THREE.Mesh(geometry, materials)
        mesh.name = 'game-box-fold-panel'
        return mesh
    }

    private createContentCanvas(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
        const canvas = document.createElement('canvas')
        canvas.width = WING_CONTENT_CANVAS_SIZE
        canvas.height = WING_CONTENT_CANVAS_SIZE
        const context = canvas.getContext('2d')
        if (!context) {
            throw new Error('GameBoxFoldModel: failed to get 2D canvas context')
        }
        const texture = new THREE.CanvasTexture(canvas)
        return { canvas, context, texture }
    }

    private drawContentPanel(ctx: CanvasRenderingContext2D, text: string): void {
        const size = WING_CONTENT_CANVAS_SIZE
        ctx.clearRect(0, 0, size, size)
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(0, 0, size, size)

        // +Z faces use standard (non-reversed) UVs - see FACE_INDEX's comment - so no
        // pre-mirroring is needed here, unlike LabelTextureArrayManager's -Z-mapped labels.
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${Math.floor(size / 12)}px Arial, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const lines = text.split('\n')
        const lineHeight = size / 10
        const startY = size / 2 - ((lines.length - 1) * lineHeight) / 2
        lines.forEach((line, i) => {
            ctx.fillText(line, size / 2, startY + i * lineHeight, size * 0.9)
        })
    }
}
