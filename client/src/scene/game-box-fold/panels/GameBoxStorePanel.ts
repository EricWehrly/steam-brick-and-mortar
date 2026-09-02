/**
 * Base/center face, revealed once both flaps swing away: title, header art presented as a disc
 * emerging from its sleeve (2026-08-12 direction), a Play button sharing its row with a condensed
 * playtime summary, the user's own collections, and placeholder rows for sections with no data
 * source wired up yet. Description, rating, metacritic, genres, tags and features all live on the
 * debug face instead (see GameBoxDebugPanel).
 *
 * The disc is a plain uikit Container whose two top corners are rounded by half its width, with
 * overflow:'hidden' clipping the header Image inside it - the flexbox equivalent of the semicircle
 * the canvas version drew with ctx.arc(PI, 2*PI) + ctx.clip(). The sleeve is the next sibling, so
 * it paints over the disc's bottom edge and the disc reads as tucked behind it.
 *
 * Header art arrives as raw pixels (GameArtworkProvider's CORS-safe pipeline), so this owns the one
 * scratch canvas that turns them into a texture uikit can show. That canvas is a pixel *carrier*,
 * not a drawing surface - nothing here is hand-drawn.
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
// Pulls the sleeve up over the disc's flat bottom edge so the two overlap rather than merely
// abut - the "emerging from its sleeve" read.
const SLEEVE_OVERLAP = 6
const SECTION_GAP = 10
const PLAY_BUTTON_RADIUS = 4
const PLAY_BUTTON_PADDING_X = 14
const PLAY_BUTTON_PADDING_Y = 6
const PLAY_BUTTON_HOVER_BACKGROUND = '#2a3a2a'

export class GameBoxStorePanel {
    readonly container: Container

    private readonly titleText: Text
    private readonly disc: Container
    private readonly playtimeText: Text
    private readonly recentPlaytimeText: Text
    private readonly sleeveSections: Container

    private headerCanvas: HTMLCanvasElement | null = null
    private headerTexture: THREE.CanvasTexture | null = null
    // Held as a plain Object3D: uikit's Image is generic over its src type, and detaching it is all
    // this needs from it.
    private headerImage: THREE.Object3D | null = null

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
     *  one canvas/texture pair across selections rather than allocating per game. */
    setHeaderImage(image: GameBoxFoldHeaderImage | null): void {
        if (!image) {
            this.headerImage?.removeFromParent()
            this.headerImage = null
            return
        }

        const canvas = this.resolveHeaderCanvas(image.width, image.height)
        const context = canvas.getContext('2d')
        if (!context) {
            throw new Error('GameBoxStorePanel: failed to get 2D canvas context for header image')
        }
        // createImageData() (not `new ImageData(...)`) - the global ImageData constructor isn't
        // guaranteed to exist in every environment this runs in (e.g. jsdom under vitest), while
        // every 2D context can always produce its own compatible instance.
        const imageData = context.createImageData(image.width, image.height)
        imageData.data.set(image.pixels)
        context.putImageData(imageData, 0, 0)

        this.headerTexture ??= new THREE.CanvasTexture(canvas)
        this.headerTexture.needsUpdate = true

        if (!this.headerImage) {
            this.headerImage = new Image({
                src: this.headerTexture,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                keepAspectRatio: false
            })
            this.disc.add(this.headerImage)
        }
    }

    dispose(): void {
        this.headerTexture?.dispose()
        this.headerTexture = null
        this.headerCanvas = null
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
        return new Container({
            width: DISC_DIAMETER,
            height: DISC_HEIGHT,
            alignSelf: 'center',
            marginTop: PANEL_PADDING / 2,
            overflow: 'hidden',
            borderTopLeftRadius: DISC_HEIGHT,
            borderTopRightRadius: DISC_HEIGHT,
            borderTopWidth: DISC_EDGE_WIDTH,
            borderLeftWidth: DISC_EDGE_WIDTH,
            borderRightWidth: DISC_EDGE_WIDTH,
            borderColor: DISC_EDGE_COLOR,
            backgroundColor: PANEL_COLORS.border
        })
    }

    private buildSleeve(): Container {
        const sleeve = new Container({
            flexDirection: 'column',
            gap: SECTION_GAP,
            width: '100%',
            flexGrow: 1,
            marginTop: -SLEEVE_OVERLAP,
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

    private resolveHeaderCanvas(width: number, height: number): HTMLCanvasElement {
        if (this.headerCanvas?.width === width && this.headerCanvas.height === height) {
            return this.headerCanvas
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        this.headerCanvas = canvas
        // A resized canvas is a different image source - the existing texture can't be pointed at
        // it, so drop it and let setHeaderImage() build a fresh one.
        this.headerTexture?.dispose()
        this.headerTexture = null
        this.headerImage?.removeFromParent()
        this.headerImage = null
        return canvas
    }
}
