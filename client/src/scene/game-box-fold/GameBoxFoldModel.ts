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

// All three faces (identity/store/debug) share one resolution - bumped up from the original
// 256 once the identity and store panels grew from one or two lines to several stacked sections
// (2026-08-12, "we can fit a ton more onto these game spaces"). Exported: GameBoxFoldCoordinator's
// raycast hit-testing needs it too, to convert a THREE.Intersection's UV into a canvas-space point.
export const PANEL_CANVAS_SIZE = 512

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

// A fixed step per wheel event rather than scaling with the event's own deltaY - trackpads and
// mouse wheels report wildly different magnitudes, and a fixed step is simpler to reason about
// (and test) than trying to normalize that.
const DEBUG_SCROLL_LINES_PER_TICK = 3

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
    /** Pre-formatted, e.g. "92% · Overwhelmingly Positive" or "Unrated" - see RatingFormat.ts. */
    readonly rating?: string
    readonly playtimeHours?: number
    readonly recentPlaytimeHours?: number
    /** Genres + top community tags, pre-built/ordered/capped by the caller. */
    readonly tags?: readonly string[]
    /** Steam's own feature categories (Single-player, Steam Achievements, ...), distinct from tags. */
    readonly categories?: readonly string[]
    /** The desktop user's own Steam library collections this game belongs to. */
    readonly userCollections?: readonly string[]
    readonly description?: string
    /** Pre-formatted, e.g. "Metacritic: 84". */
    readonly metacritic?: string
    /** Pretty-printed JSON of the raw cache entry - debug content, see drawDebugPanel(). */
    readonly debugJson?: string
}

/** Decoded header-art pixels for the store panel's disc, from GameArtworkProvider's CORS-safe
 *  pixel pipeline (same reason GameBoxFoldCoordinator never uses a raw cross-origin <img> for
 *  artwork - see applyHeaderImage() there). */
export interface GameBoxFoldHeaderImage {
    readonly pixels: Uint8ClampedArray
    readonly width: number
    readonly height: number
}

/**
 * A standalone (non-instanced) hinged box: three same-size panels stacked directly on top of one
 * another when closed - base (never moves), front cover (hinged on its left edge, outermost/
 * closest to the viewer when closed - what you see as "the box"), and a second flap beneath the
 * cover (hinged on its right edge). Opening swings the front cover flat to the left first, then
 * the second flap flat to the right, ending as three coplanar panels in a row - see
 * docs/plans/game-box-open-interaction-plan.md. Each panel has a distinct role: front cover =
 * identity (name/rating/playtime/tags), base/center = store page (header art on a disc, play
 * zone, description), second flap = debug (raw cache-entry JSON). Owns its own animation via a
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
    private readonly storePanelMaterial: THREE.MeshBasicMaterial
    private readonly leftContentMaterial: THREE.MeshBasicMaterial
    private readonly rightContentMaterial: THREE.MeshBasicMaterial

    private readonly leftCanvas: HTMLCanvasElement
    private readonly leftContext: CanvasRenderingContext2D
    private readonly leftTexture: THREE.CanvasTexture
    private readonly rightCanvas: HTMLCanvasElement
    private readonly rightContext: CanvasRenderingContext2D
    private readonly rightTexture: THREE.CanvasTexture
    private readonly centerCanvas: HTMLCanvasElement
    private readonly centerContext: CanvasRenderingContext2D
    private readonly centerTexture: THREE.CanvasTexture

    // Header art, rasterized once by setHeaderImage() into a scratch canvas drawImage() can read
    // from directly - avoids re-decoding pixel data on every redrawStorePanel() call.
    private headerImageCanvas: HTMLCanvasElement | null = null
    // setContent() and setHeaderImage() can arrive independently/in either order (one's a sync
    // call, the other follows an async artwork fetch) - redrawStorePanel() needs both, so it
    // keeps the last-known content around rather than requiring both in one call.
    private latestContent: GameBoxFoldContent | null = null

    // Canvas-space rect of the store panel's Play button as last drawn - GameBoxFoldCoordinator
    // hit-tests clicks against this rather than either side hardcoding the layout twice.
    private playButtonRect: { x: number; y: number; width: number; height: number } | null = null
    // Line offset into the wrapped debug JSON, adjusted by scrollDebugPanel(). Reset per
    // selection by setContent() so a new game doesn't inherit the previous one's scroll position.
    private debugScrollLine = 0
    private debugMaxScrollLine = 0

    private readonly mixer: THREE.AnimationMixer
    private readonly openAction: THREE.AnimationAction

    constructor() {
        this.group = new THREE.Group()
        this.group.name = 'game-box-fold-model'

        this.plainMaterial = new THREE.MeshBasicMaterial({ color: 0x3a2a1a })

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

        const centerContent = this.createContentCanvas()
        this.centerCanvas = centerContent.canvas
        this.centerContext = centerContent.context
        this.centerTexture = centerContent.texture
        this.storePanelMaterial = new THREE.MeshBasicMaterial({ map: this.centerTexture })

        // Base: bottom of the stack, furthest from the viewer (largest local Z). Its front (-Z)
        // face carries the store panel, so opening reveals it once the two flaps swing away.
        this.baseMesh = this.buildPanelMesh([
            this.plainMaterial, this.plainMaterial, this.plainMaterial, this.plainMaterial,
            this.plainMaterial, this.storePanelMaterial
        ])
        this.baseMesh.position.z = 0
        this.group.add(this.baseMesh)

        // Front cover: outermost/closest to the viewer when closed (most negative local Z - see
        // FACE_INDEX's comment, -Z is "toward the viewer"). See FRONT_COVER_HINGE_X/
        // SECOND_FLAP_HINGE_X above for why "left"/"right" don't match the raw sign here.
        this.leftHinge = this.buildFlap(FRONT_COVER_HINGE_X, -2 * STACK_GAP, this.leftContentMaterial)
        this.leftHinge.name = HINGE_NAME.frontCover
        // Second flap: sits between base and front cover when closed.
        this.rightHinge = this.buildFlap(SECOND_FLAP_HINGE_X, -STACK_GAP, this.rightContentMaterial)
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
    }

    /** The three faces GameBoxFoldCoordinator can raycast against for click/scroll interaction -
     *  identity (front cover) and debug (second flap) are each a hinge's single content mesh;
     *  store is the base mesh itself. */
    getInteractiveMeshes(): { store: THREE.Mesh; identity: THREE.Mesh; debug: THREE.Mesh } {
        return {
            store: this.baseMesh,
            identity: this.leftHinge.children[0] as THREE.Mesh,
            debug: this.rightHinge.children[0] as THREE.Mesh
        }
    }

    /** Whether a raycast intersection's materialIndex is actually the visible content face for
     *  the given mesh (each panel mesh has 5 blank plainMaterial faces and one content face - see
     *  FACE_INDEX) - keeps that face-index knowledge internal rather than exporting FACE_INDEX. */
    isContentFaceHit(mesh: THREE.Mesh, materialIndex: number | undefined): boolean {
        return materialIndex === (mesh === this.baseMesh ? FACE_INDEX.negZ : FACE_INDEX.posZ)
    }

    /** Whether a store-panel canvas-space point falls within the last-drawn Play button. */
    isPointInPlayButton(canvasX: number, canvasY: number): boolean {
        const rect = this.playButtonRect
        if (!rect) {
            return false
        }
        return canvasX >= rect.x && canvasX <= rect.x + rect.width
            && canvasY >= rect.y && canvasY <= rect.y + rect.height
    }

    /** Scrolls the debug panel by DEBUG_SCROLL_LINES_PER_TICK lines, direction from the wheel
     *  event's sign (positive deltaY = scroll down/forward through the JSON). Clamped to
     *  [0, debugMaxScrollLine], which drawDebugPanel() maintains as a side effect of its last draw. */
    scrollDebugPanel(direction: number): void {
        const next = this.debugScrollLine + Math.sign(direction) * DEBUG_SCROLL_LINES_PER_TICK
        this.debugScrollLine = Math.max(0, Math.min(this.debugMaxScrollLine, next))
        this.drawDebugPanel(this.rightContext, this.latestContent?.debugJson)
        this.rightTexture.needsUpdate = true
    }

    /** Rasterizes header-art pixel data into a scratch canvas used to paint the store panel's
     *  disc, and redraws it. Pass null to clear back to a placeholder. Caller owns the pixel
     *  data's lifecycle - a plain typed array, nothing to dispose. */
    setHeaderImage(image: GameBoxFoldHeaderImage | null): void {
        if (!image) {
            this.headerImageCanvas = null
        } else {
            const canvas = document.createElement('canvas')
            canvas.width = image.width
            canvas.height = image.height
            const ctx = canvas.getContext('2d')
            if (!ctx) {
                throw new Error('GameBoxFoldModel: failed to get 2D canvas context for header image')
            }
            // createImageData() (not `new ImageData(...)`) - the global ImageData constructor
            // isn't guaranteed to exist in every environment this runs in (e.g. jsdom under
            // vitest), while every 2D context can always produce its own compatible instance.
            const imageData = ctx.createImageData(image.width, image.height)
            imageData.data.set(image.pixels)
            ctx.putImageData(imageData, 0, 0)
            this.headerImageCanvas = canvas
        }
        this.redrawStorePanel()
        this.centerTexture.needsUpdate = true
    }

    /** Redraws all three faces in place, reusing the same canvas/texture objects every call - the
     *  mechanism behind "pre-warmed, near-instant swap-in" (no texture allocation per selection).
     *  See the class doc comment for what each face shows. */
    setContent(content: GameBoxFoldContent): void {
        this.latestContent = content
        this.debugScrollLine = 0

        this.drawIdentityPanel(this.leftContext, content)
        this.leftTexture.needsUpdate = true

        this.drawDebugPanel(this.rightContext, content.debugJson)
        this.rightTexture.needsUpdate = true

        this.redrawStorePanel()
        this.centerTexture.needsUpdate = true
    }

    dispose(): void {
        this.mixer.stopAllAction()
        this.baseMesh.geometry.dispose()
        this.leftHinge.children.forEach(child => (child as THREE.Mesh).geometry.dispose())
        this.rightHinge.children.forEach(child => (child as THREE.Mesh).geometry.dispose())

        this.plainMaterial.dispose()
        this.storePanelMaterial.dispose()
        this.leftContentMaterial.dispose()
        this.rightContentMaterial.dispose()
        this.leftTexture.dispose()
        this.rightTexture.dispose()
        this.centerTexture.dispose()
    }

    /**
     * hingeX: group-local X of the pivot edge (one side of the shared central footprint). The
     * panel itself is offset -hingeX within the hinge's own local space, so it sits centered on
     * the group's origin when closed (rotation 0) and lands a full BOX_WIDTH to the opposite side
     * once open (rotation PI negates local X - see buildOpenClip). closedZ: local Z when closed,
     * establishing this panel's depth in the closed stack.
     */
    private buildFlap(hingeX: number, closedZ: number, contentMaterial: THREE.MeshBasicMaterial): THREE.Group {
        const hinge = new THREE.Group()
        hinge.position.set(hingeX, 0, closedZ)

        const materials: THREE.MeshBasicMaterial[] = [
            this.plainMaterial, this.plainMaterial, this.plainMaterial, this.plainMaterial,
            this.plainMaterial, this.plainMaterial
        ]
        materials[FACE_INDEX.posZ] = contentMaterial

        const mesh = this.buildPanelMesh(materials)
        mesh.position.x = -hingeX
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
        canvas.width = PANEL_CANVAS_SIZE
        canvas.height = PANEL_CANVAS_SIZE
        const context = canvas.getContext('2d')
        if (!context) {
            throw new Error('GameBoxFoldModel: failed to get 2D canvas context')
        }
        const texture = new THREE.CanvasTexture(canvas)
        return { canvas, context, texture }
    }

    /** Front cover face: the player's relationship to this game - rating, playtime, and (until we
     *  have real data for them, see docs/plans/game-box-store-data-research.md) reserved rows for
     *  screenshots/videos. The title itself now lives on the store panel instead (2026-08-12,
     *  "put the title at the middle top, above the disk"). +Z faces use standard (non-reversed)
     *  UVs - see FACE_INDEX's comment - so no pre-mirroring is needed here, unlike
     *  LabelTextureArrayManager's -Z-mapped labels. */
    private drawIdentityPanel(ctx: CanvasRenderingContext2D, content: GameBoxFoldContent): void {
        const size = PANEL_CANVAS_SIZE
        this.clearPanel(ctx)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        let y = size * 0.12

        if (content.rating) {
            ctx.font = `${Math.floor(size / 18)}px Arial, sans-serif`
            ctx.fillStyle = '#e0c15a'
            ctx.fillText(content.rating, size / 2, y, size * 0.85)
            y += size * 0.07
        }

        y += size * 0.02
        ctx.textBaseline = 'alphabetic'
        ctx.font = `${Math.floor(size / 26)}px Arial, sans-serif`
        ctx.fillStyle = '#9a9a9a'
        ctx.fillText('PLAYTIME', size / 2, y)
        y += size * 0.05
        ctx.font = `bold ${Math.floor(size / 11)}px Arial, sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.fillText(content.playtimeHours !== undefined ? `${content.playtimeHours}h` : '—', size / 2, y)
        y += size * 0.055
        ctx.font = `${Math.floor(size / 24)}px Arial, sans-serif`
        ctx.fillStyle = '#c9c9c9'
        ctx.fillText(
            content.recentPlaytimeHours ? `${content.recentPlaytimeHours}h in last 2 weeks` : 'Not played recently',
            size / 2, y
        )
        y += size * 0.1

        this.drawComingSoonRows(ctx, y, ['Screenshots', 'Videos'])
    }

    /** One labeled, wrapped chip-line section (e.g. "TAGS: Action · Indie · ...") - returns the Y
     *  to continue drawing at, unchanged if there was nothing to show. Shared by the three
     *  categorization sections in drawIdentityPanel() so they don't triplicate this layout. */
    private drawLabeledChipLines(
        ctx: CanvasRenderingContext2D,
        startY: number,
        label: string,
        items: readonly string[] | undefined,
        color: string
    ): number {
        if (!items || items.length === 0) {
            return startY
        }
        const size = PANEL_CANVAS_SIZE
        let y = startY

        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.font = `${Math.floor(size / 28)}px Arial, sans-serif`
        ctx.fillStyle = '#9a9a9a'
        ctx.fillText(label, size / 2, y)
        y += size * 0.045

        ctx.textBaseline = 'middle'
        ctx.font = `${Math.floor(size / 24)}px Arial, sans-serif`
        ctx.fillStyle = color
        const lines = this.wrapLines(ctx, items.join('  ·  '), size * 0.85).slice(0, 2)
        const lineHeight = size / 18
        lines.forEach((line, i) => ctx.fillText(line, size / 2, y + i * lineHeight, size * 0.85))

        return y + lines.length * lineHeight + size * 0.035
    }

    /** Second flap face: description up top (right-aligned, moved here from the store panel per
     *  explicit request - "top-right, debug section makes room for it"), then the raw cache-entry
     *  JSON this box's content was built from - carried over from BinderGameDetailPanel's debug
     *  dump per explicit request. The JSON viewport already scrolls (GameBoxFoldCoordinator's wheel
     *  handling -> scrollDebugPanel(), which re-invokes this with the same debugJson at the new
     *  this.debugScrollLine offset), so shrinking its visible window to make room costs nothing -
     *  reads this.latestContent directly for the description, same pattern redrawStorePanel()
     *  uses, since debugJson alone doesn't carry it. */
    private drawDebugPanel(ctx: CanvasRenderingContext2D, debugJson: string | undefined): void {
        const size = PANEL_CANVAS_SIZE
        this.clearPanel(ctx)

        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#9a9a9a'
        ctx.font = `${Math.floor(size / 26)}px Arial, sans-serif`
        ctx.fillText('DEBUG: CACHE ENTRY', size * 0.06, size * 0.04)

        let jsonStartY = size * 0.1
        const description = this.latestContent?.description
        if (description) {
            ctx.textAlign = 'right'
            ctx.font = `${Math.floor(size / 30)}px Arial, sans-serif`
            ctx.fillStyle = '#c9c9c9'
            const descLineHeight = size / 22
            const descLines = this.wrapLines(ctx, description, size * 0.55).slice(0, 3)
            descLines.forEach((line, i) => ctx.fillText(line, size * 0.94, jsonStartY + i * descLineHeight, size * 0.55))
            jsonStartY += descLines.length * descLineHeight + size * 0.03
            ctx.textAlign = 'left'
        }

        if (!debugJson) {
            this.debugMaxScrollLine = 0
            return
        }

        const fontSize = Math.floor(size / 32)
        ctx.font = `${fontSize}px "Courier New", monospace`
        const maxWidth = size * 0.88
        const lineHeight = fontSize * 1.25
        const startY = jsonStartY
        const maxLines = Math.floor((size * 0.96 - startY) / lineHeight)

        const wrapped = this.wrapMonospaceLines(ctx, debugJson.split('\n'), maxWidth, Number.POSITIVE_INFINITY)
        this.debugMaxScrollLine = Math.max(0, wrapped.length - maxLines)
        this.debugScrollLine = Math.min(this.debugScrollLine, this.debugMaxScrollLine)

        const shown = wrapped.slice(this.debugScrollLine, this.debugScrollLine + maxLines)
        ctx.fillStyle = '#8fd68f'
        shown.forEach((line, i) => ctx.fillText(line, size * 0.06, startY + i * lineHeight))

        if (this.debugMaxScrollLine > 0) {
            ctx.fillStyle = '#9a9a9a'
            ctx.font = `italic ${Math.floor(size / 28)}px Arial, sans-serif`
            const hint = this.debugScrollLine < this.debugMaxScrollLine ? '⋯ scroll for more' : '⋯ end'
            ctx.fillText(hint, size * 0.06, size * 0.97 - fontSize)
        }
    }

    /** Breaks JSON source lines to fit maxWidth without relying on wrap-friendly spaces (JSON
     *  often has long single-line array/string bodies) - cuts at the widest substring that still
     *  fits, character by character, rather than word-by-word like wrapLines(). Stops once
     *  maxLines is reached, since the caller only renders that many anyway. */
    private wrapMonospaceLines(ctx: CanvasRenderingContext2D, sourceLines: string[], maxWidth: number, maxLines: number): string[] {
        const wrapped: string[] = []
        for (const rawLine of sourceLines) {
            if (wrapped.length >= maxLines) break
            if (ctx.measureText(rawLine).width <= maxWidth) {
                wrapped.push(rawLine)
                continue
            }
            let remaining = rawLine
            while (remaining.length > 0 && wrapped.length < maxLines) {
                let cut = remaining.length
                while (cut > 1 && ctx.measureText(remaining.slice(0, cut)).width > maxWidth) {
                    cut--
                }
                wrapped.push(remaining.slice(0, cut))
                remaining = remaining.slice(cut)
            }
        }
        return wrapped
    }

    /** Base/center face: revealed once both flaps swing away. Title up top, then header art
     *  presented like a disc emerging from its sleeve (2026-08-12 direction - visual identity to
     *  iterate on, see the plan doc), a Play button sharing its row with a condensed playtime
     *  summary, metacritic, tags/categories/collections (moved here from the identity panel per
     *  explicit request), and placeholder rows for sections with no data source wired up yet
     *  (DLC/achievements - screenshots/videos moved to the identity panel). Description lives on
     *  the debug face instead (see drawDebugPanel()), not here. Reads this.latestContent directly
     *  rather than taking a parameter, since it can be triggered by either setContent() or
     *  setHeaderImage() alone. */
    private redrawStorePanel(): void {
        const size = PANEL_CANVAS_SIZE
        const ctx = this.centerContext
        const content = this.latestContent
        this.clearPanel(ctx)

        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = `bold ${Math.floor(size / 14)}px Arial, sans-serif`
        ctx.fillStyle = '#ffffff'
        const nameLines = content ? this.wrapLines(ctx, content.name, size * 0.85).slice(0, 2) : []
        const nameLineHeight = size / 13
        const titleTop = size * 0.05
        nameLines.forEach((line, i) => ctx.fillText(line, size / 2, titleTop + i * nameLineHeight, size * 0.85))

        // Widened from 0.28 per direct request ("make the disc bigger/wider") - 0.4 still clears
        // the canvas edges at diskCenterX +/- diskRadius (0.1-0.9 of size) with room to spare.
        const diskRadius = size * 0.4
        const diskCenterX = size / 2
        const diskCenterY = titleTop + Math.max(nameLines.length, 1) * nameLineHeight + size * 0.02 + diskRadius

        ctx.save()
        ctx.beginPath()
        ctx.arc(diskCenterX, diskCenterY, diskRadius, Math.PI, 2 * Math.PI)
        ctx.closePath()
        ctx.clip()
        if (this.headerImageCanvas) {
            const img = this.headerImageCanvas
            const scale = Math.max((diskRadius * 2) / img.width, (diskRadius * 2) / img.height)
            const drawW = img.width * scale
            const drawH = img.height * scale
            ctx.drawImage(img, diskCenterX - drawW / 2, diskCenterY - drawH / 2, drawW, drawH)
        } else {
            ctx.fillStyle = '#333333'
            ctx.fillRect(diskCenterX - diskRadius, diskCenterY - diskRadius, diskRadius * 2, diskRadius)
        }
        ctx.restore()

        ctx.beginPath()
        ctx.arc(diskCenterX, diskCenterY, diskRadius, Math.PI, 2 * Math.PI)
        ctx.strokeStyle = '#0a0a0a'
        ctx.lineWidth = size * 0.008
        ctx.stroke()

        // Sleeve: the disk's bottom half reads as tucked behind this band.
        const sleeveTop = diskCenterY - size * 0.01
        ctx.fillStyle = '#241f1a'
        ctx.fillRect(0, sleeveTop, size, size - sleeveTop)
        ctx.strokeStyle = '#0a0a0a'
        ctx.lineWidth = size * 0.006
        ctx.beginPath()
        ctx.moveTo(0, sleeveTop)
        ctx.lineTo(size, sleeveTop)
        ctx.stroke()

        let y = sleeveTop + size * 0.08

        // Play button + condensed playtime summary share one row (2026-08-12, "can we fit
        // playtime and last played on the same line with the play button?"). Button outlined,
        // not filled, so it doesn't read as a working control before it actually is one - see
        // the plan doc's interaction follow-up (this is now wired to a click, but keeping the
        // outlined treatment until it's had real visual confirmation).
        const playH = size * 0.07
        const playW = size * 0.28
        const playX = size * 0.08
        ctx.strokeStyle = '#5fae5f'
        ctx.lineWidth = size * 0.006
        ctx.strokeRect(playX, y, playW, playH)
        ctx.fillStyle = '#5fae5f'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = `${Math.floor(size / 24)}px Arial, sans-serif`
        ctx.fillText('▶ PLAY', playX + playW / 2, y + playH / 2)
        this.playButtonRect = { x: playX, y, width: playW, height: playH }

        ctx.textAlign = 'right'
        ctx.font = `${Math.floor(size / 28)}px Arial, sans-serif`
        ctx.fillStyle = '#c9c9c9'
        const playtimeLine = content?.playtimeHours !== undefined ? `${content.playtimeHours}h played` : 'Not played yet'
        const lastPlayedLine = content?.recentPlaytimeHours ? `${content.recentPlaytimeHours}h last 2wk` : 'No recent activity'
        ctx.fillText(playtimeLine, size * 0.92, y + playH * 0.35)
        ctx.fillText(lastPlayedLine, size * 0.92, y + playH * 0.75)
        y += playH + size * 0.06

        // Description moved to the debug face (top-right, above the cache-entry JSON) per direct
        // request - see drawDebugPanel().
        if (content?.metacritic) {
            ctx.textAlign = 'center'
            ctx.font = `bold ${Math.floor(size / 24)}px Arial, sans-serif`
            ctx.fillStyle = '#66cc33'
            ctx.fillText(content.metacritic, size / 2, y)
            y += size * 0.06
        }

        y += size * 0.02
        y = this.drawLabeledChipLines(ctx, y, 'TAGS', content?.tags, '#8fc7ff')
        y = this.drawLabeledChipLines(ctx, y, 'FEATURES', content?.categories, '#a0d8a0')
        y = this.drawLabeledChipLines(ctx, y, 'YOUR COLLECTIONS', content?.userCollections, '#e0a0e0')

        y += size * 0.02
        this.drawComingSoonRows(ctx, y, ['DLC', 'Achievements'])
    }

    /** Shared "label ... coming soon" row layout - used by both the identity panel
     *  (screenshots/videos) and the store panel (DLC/achievements), sections with no data source
     *  wired up yet (see docs/plans/game-box-store-data-research.md). */
    private drawComingSoonRows(ctx: CanvasRenderingContext2D, startY: number, rows: readonly string[]): void {
        const size = PANEL_CANVAS_SIZE
        let y = startY
        ctx.textBaseline = 'middle'
        ctx.font = `${Math.floor(size / 28)}px Arial, sans-serif`
        for (const row of rows) {
            if (y > size * 0.95) break
            ctx.fillStyle = '#7a7a7a'
            ctx.textAlign = 'left'
            ctx.fillText(row, size * 0.08, y)
            ctx.fillStyle = '#555555'
            ctx.textAlign = 'right'
            ctx.fillText('coming soon', size * 0.92, y)
            y += size * 0.05
        }
    }

    private clearPanel(ctx: CanvasRenderingContext2D): void {
        const size = PANEL_CANVAS_SIZE
        ctx.clearRect(0, 0, size, size)
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(0, 0, size, size)
    }

    /** Greedy word-wrap: assumes ctx.font is already set to the font it should measure with. */
    private wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
        const words = text.split(/\s+/).filter(Boolean)
        const lines: string[] = []
        let current = ''
        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word
            if (current && ctx.measureText(candidate).width > maxWidth) {
                lines.push(current)
                current = word
            } else {
                current = candidate
            }
        }
        if (current) {
            lines.push(current)
        }
        return lines
    }
}
