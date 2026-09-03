/**
 * Base/center face, revealed once both flaps swing away: title, header art presented as a disc
 * emerging from its sleeve (2026-08-12 direction), a Play button sharing its row with a condensed
 * playtime summary, the user's own collections, and placeholder rows for sections with no data
 * source wired up yet. Description, rating, metacritic, genres, tags and features all live on the
 * debug face instead (see GameBoxDebugPanel).
 *
 * The disc's semicircle is entirely canvas-drawn - background fill, header art, and the edge
 * stroke together, in one drawDiscTexture() call - rather than split between a uikit Container's
 * own rounded-corner fill/border and a separately alpha-clipped child Image. That split looked
 * almost right (uikit's rounded-rect fill/border shader is a real per-fragment curve, not a
 * rectangle) but not quite: the two shapes are computed by different code paths that don't
 * provably agree pixel-for-pixel, and in practice left small pointy artifacts at the top corners
 * where they disagreed (direct request, 2026-09-02, screenshot markup: "thefuck stupid wings").
 * Drawing the whole disc - fill, art, and stroke - from ONE ctx.arc(PI, 2*PI) path removes the
 * second code path entirely, so there's nothing left to disagree with. This is the canvas escape
 * hatch (see docs/architecture/in-scene-ui-substrate.md), used for exactly the freeform-shape case
 * it exists for, not for the box's layout or text.
 *
 * With the disc's own texture always the correct shape (placeholder or loaded), the sleeve doesn't
 * need to overlap it to hide a square edge - it just abuts, which also avoids the z-fight risk two
 * siblings overlapping via negative margin would have at equal depth.
 */

import * as THREE from 'three'
import { Container, Image, Text } from '@pmndrs/uikit'
import type { GameBoxFoldContent, GameBoxFoldHeaderImage } from '../GameBoxFoldContent'
import { buildChipSection, buildComingSoonRows } from './GameBoxPanelParts'
import { toUikitSafeText } from '../../uikit/UikitTextSanitizer'
import {
    BODY_FONT_SIZE, LABEL_FONT_SIZE, PANEL_COLORS, PANEL_PADDING,
    PANEL_ROOT_PROPERTIES, PANEL_WIDTH_PX, TITLE_FONT_SIZE
} from './GameBoxPanelStyle'

const TITLE_MAX_HEIGHT = 50
// Widened from the canvas version's original 0.28-of-width per direct request ("make the disc
// bigger/wider"); 0.8 of the page still leaves a margin either side.
const DISC_DIAMETER = PANEL_WIDTH_PX * 0.8
const DISC_HEIGHT = DISC_DIAMETER / 2
const DISC_EDGE_COLOR = '#0a0a0a'
const DISC_EDGE_WIDTH = 2
const SECTION_GAP = 10
const PLAY_BUTTON_RADIUS = 4
const PLAY_BUTTON_PADDING_X = 14
const PLAY_BUTTON_PADDING_Y = 6
const PLAY_BUTTON_HOVER_BACKGROUND = '#2a3a2a'

// The disc texture's own resolution - independent of the source artwork's size (see
// drawDiscTexture()) and independent of PANEL_WIDTH_PX (a layout unit, not a texture one). Fixed
// 2:1 to match DISC_DIAMETER:DISC_HEIGHT exactly, so the Image can show it with a plain 'fill'
// instead of doing its own crop. The stroke width below is chosen in these texture pixels, not
// DISC_EDGE_WIDTH's layout units - the two scales are close enough (256 texture px for a ~240
// layout-px disc) that reusing the same number reads the same either way.
const DISC_TEXTURE_WIDTH = 256
const DISC_TEXTURE_HEIGHT = DISC_TEXTURE_WIDTH / 2

export class GameBoxStorePanel {
    readonly container: Container

    private readonly titleText: Text
    private readonly disc: Container
    private readonly playtimeText: Text
    private readonly recentPlaytimeText: Text
    private readonly sleeveSections: Container

    private readonly discCanvas: HTMLCanvasElement
    private readonly discContext: CanvasRenderingContext2D
    private readonly discTexture: THREE.CanvasTexture

    constructor(private readonly onPlay: () => void) {
        this.titleText = new Text({
            text: '',
            fontSize: TITLE_FONT_SIZE,
            color: PANEL_COLORS.title,
            textAlign: 'center',
            width: '100%'
        })
        this.playtimeText = new Text({ text: '', fontSize: LABEL_FONT_SIZE, color: PANEL_COLORS.body })
        this.recentPlaytimeText = new Text({ text: '', fontSize: LABEL_FONT_SIZE, color: PANEL_COLORS.body })

        this.discCanvas = document.createElement('canvas')
        this.discCanvas.width = DISC_TEXTURE_WIDTH
        this.discCanvas.height = DISC_TEXTURE_HEIGHT
        const discContext = this.discCanvas.getContext('2d')
        if (!discContext) {
            throw new Error('GameBoxStorePanel: failed to get 2D canvas context for the disc')
        }
        this.discContext = discContext
        this.discTexture = new THREE.CanvasTexture(this.discCanvas)
        this.drawDiscTexture(null)

        this.disc = this.buildDisc()
        this.sleeveSections = new Container({ flexDirection: 'column', gap: SECTION_GAP, width: '100%' })

        this.container = this.build()
    }

    setContent(content: GameBoxFoldContent | null): void {
        this.titleText.setProperties({ text: toUikitSafeText(content?.name ?? '') })
        this.playtimeText.setProperties({
            text: content?.playtimeHours !== undefined ? `${content.playtimeHours}h played` : 'Not played yet'
        })
        this.recentPlaytimeText.setProperties({
            text: content?.recentPlaytimeHours ? `${content.recentPlaytimeHours}h last 2wk` : 'No recent activity'
        })

        this.sleeveSections.clear()
        const collections = buildChipSection('YOUR COLLECTIONS', content?.userCollections, PANEL_COLORS.collections)
        if (collections) {
            this.sleeveSections.add(collections)
        }
        this.sleeveSections.add(buildComingSoonRows(['DLC', 'Achievements']))
    }

    /** Rasterizes header-art pixels into the disc, or clears back to the plain placeholder. Reuses
     *  the same canvas/texture/Image across selections - only the drawn content changes. */
    setHeaderImage(image: GameBoxFoldHeaderImage | null): void {
        if (!image) {
            this.drawDiscTexture(null)
            this.discTexture.needsUpdate = true
            return
        }

        // Raw pixels arrive at whatever size GameArtworkProvider fetched - a small scratch canvas
        // is just a way to hand drawImage() a source it can sample from and cover-scale; it isn't
        // shown directly and doesn't need to persist between calls.
        const source = document.createElement('canvas')
        source.width = image.width
        source.height = image.height
        const sourceContext = source.getContext('2d')
        if (!sourceContext) {
            throw new Error('GameBoxStorePanel: failed to get 2D canvas context for header image')
        }
        // createImageData() (not `new ImageData(...)`) - the global ImageData constructor isn't
        // guaranteed to exist in every environment this runs in (e.g. jsdom under vitest), while
        // every 2D context can always produce its own compatible instance.
        const imageData = sourceContext.createImageData(image.width, image.height)
        imageData.data.set(image.pixels)
        sourceContext.putImageData(imageData, 0, 0)

        this.drawDiscTexture(source)
        this.discTexture.needsUpdate = true
    }

    dispose(): void {
        this.discTexture.dispose()
    }

    /** Draws the disc's entire visible content - background fill or header art, plus the edge
     *  stroke - clipped to one ctx.arc(PI, 2*PI) semicircle path, the same math the pre-uikit
     *  canvas panel used. Pass null for the plain placeholder (no header art loaded yet/cleared). */
    private drawDiscTexture(source: HTMLCanvasElement | null): void {
        const ctx = this.discContext
        ctx.clearRect(0, 0, DISC_TEXTURE_WIDTH, DISC_TEXTURE_HEIGHT)

        const centerX = DISC_TEXTURE_WIDTH / 2
        const centerY = DISC_TEXTURE_HEIGHT // circle center sits at the bottom edge - only its
        const radius = DISC_TEXTURE_HEIGHT  // top half (within the canvas) is ever visible

        ctx.save()
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI)
        ctx.closePath()
        ctx.clip()

        if (source) {
            const scale = Math.max((radius * 2) / source.width, (radius * 2) / source.height)
            const drawWidth = source.width * scale
            const drawHeight = source.height * scale
            ctx.drawImage(source, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight)
        } else {
            ctx.fillStyle = PANEL_COLORS.border
            ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius)
        }
        ctx.restore()

        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI)
        ctx.strokeStyle = DISC_EDGE_COLOR
        ctx.lineWidth = DISC_EDGE_WIDTH
        ctx.stroke()
    }

    private build(): Container {
        const root = new Container({ ...PANEL_ROOT_PROPERTIES, paddingTop: PANEL_PADDING })

        const titleArea = new Container({
            width: '100%',
            maxHeight: TITLE_MAX_HEIGHT,
            overflow: 'hidden',
            paddingLeft: PANEL_PADDING,
            paddingRight: PANEL_PADDING
        })
        titleArea.add(this.titleText)
        root.add(titleArea)
        root.add(this.disc)
        root.add(this.buildSleeve())

        return root
    }

    private buildDisc(): Container {
        const disc = new Container({
            width: DISC_DIAMETER,
            height: DISC_HEIGHT,
            alignSelf: 'center',
            marginTop: PANEL_PADDING / 2
        })
        disc.add(new Image({
            src: this.discTexture,
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            keepAspectRatio: false
        }))
        return disc
    }

    private buildSleeve(): Container {
        const sleeve = new Container({
            flexDirection: 'column',
            gap: SECTION_GAP,
            width: '100%',
            flexGrow: 1,
            padding: PANEL_PADDING,
            backgroundColor: PANEL_COLORS.sleeve,
            borderTopWidth: DISC_EDGE_WIDTH,
            borderColor: DISC_EDGE_COLOR
        })
        sleeve.add(this.buildPlayRow())
        sleeve.add(this.sleeveSections)
        return sleeve
    }

    private buildPlayRow(): Container {
        const row = new Container({
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%'
        })
        row.add(this.buildPlayButton())

        const playtime = new Container({ flexDirection: 'column', alignItems: 'flex-end' })
        playtime.add(this.playtimeText)
        playtime.add(this.recentPlaytimeText)
        row.add(playtime)

        return row
    }

    /** Outlined rather than filled - the treatment it had while it was still only a drawn
     *  rectangle. It's a real control now (uikit's own onClick, no raycast-to-UV hit-testing), but
     *  the look is unchanged until it's had visual confirmation. */
    private buildPlayButton(): Container {
        const button = new Container({
            paddingLeft: PLAY_BUTTON_PADDING_X,
            paddingRight: PLAY_BUTTON_PADDING_X,
            paddingTop: PLAY_BUTTON_PADDING_Y,
            paddingBottom: PLAY_BUTTON_PADDING_Y,
            borderTopLeftRadius: PLAY_BUTTON_RADIUS,
            borderTopRightRadius: PLAY_BUTTON_RADIUS,
            borderBottomLeftRadius: PLAY_BUTTON_RADIUS,
            borderBottomRightRadius: PLAY_BUTTON_RADIUS,
            borderTopWidth: DISC_EDGE_WIDTH,
            borderLeftWidth: DISC_EDGE_WIDTH,
            borderRightWidth: DISC_EDGE_WIDTH,
            borderBottomWidth: DISC_EDGE_WIDTH,
            borderColor: PANEL_COLORS.play,
            cursor: 'pointer',
            onClick: () => this.onPlay(),
            onHoverChange: (hovered: boolean) => button.setProperties({
                backgroundColor: hovered ? PLAY_BUTTON_HOVER_BACKGROUND : undefined
            })
        })
        button.add(new Text({ text: 'PLAY', fontSize: BODY_FONT_SIZE, color: PANEL_COLORS.play }))
        return button
    }
}
