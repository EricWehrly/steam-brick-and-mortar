/**
 * Builds one framed-poster THREE.Group: a four-box molding border, a mat-board backing plane, and
 * a contain-fit image plane - no separate glass pane (the "glass front" is faked via low
 * roughness on the image material itself). See docs/plans/wall-poster-placement-plan.md for why
 * each of these shapes was chosen over the alternatives (extruded-profile molding, real glass).
 *
 * Outer *width* is always fixed (WallPosterLayout's pitch unit). Outer *height* is picked from a
 * small set of aspect-ratio presets, nearest to the actual image's aspect - a single fixed outer
 * aspect for every poster caused visible letterboxing ("black bars") whenever an image's aspect
 * didn't match it. The border is a fraction of each dimension (not a flat meters value), so the
 * aperture keeps the outer footprint's own aspect exactly - the only remaining source of
 * letterboxing is the (usually small) gap between an image's real aspect and its nearest preset.
 *
 * Local coordinates: z=0 is the molding's front (viewer-facing) face; the frame extends backward
 * to z=-FRAME_DEPTH_METERS, which is what a placer aligns just off the wall surface.
 */

import * as THREE from 'three'
import { BlockbusterColors } from '../../../utils/Colors'

/** The frame's own size data belongs here, not in a layout/placement module - WallPosterLayout
 *  imports getFrameOuterWidth() rather than this file importing a width from elsewhere. */
export const FRAME_OUTER_WIDTH_METERS = 2.7
export const FRAME_DEPTH_METERS = 0.12

/** Outer width is fixed (unlike outer height, which varies by preset - see getFrameOuterHeight
 *  below), so this takes no group argument. */
export function getFrameOuterWidth(): number {
    return FRAME_OUTER_WIDTH_METERS
}

/** Fraction of each dimension taken by the molding, applied to width and height independently
 *  so the aperture's aspect ratio always matches the outer footprint's - see file header. */
const BORDER_FRACTION = 0.06

const MAT_BOARD_COLOR = 0x161616

interface PosterSizePreset {
    readonly name: string
    readonly aspect: number
}

/** A deliberately small set, not one per possible aspect - matched against real sources as
 *  they're confirmed. Local screenshots (2560x1600, 1280x800) are exactly 'widescreen'; add
 *  presets here as new content sources bring genuinely different aspects, not speculatively. */
export const POSTER_SIZE_PRESETS: readonly PosterSizePreset[] = [
    { name: 'widescreen', aspect: 16 / 10 },
    { name: 'standard', aspect: 4 / 3 },
]

/** Nearest preset by log-ratio distance (symmetric under inversion, unlike a plain difference). */
export function pickPosterSizePreset(imageAspect: number): PosterSizePreset {
    return POSTER_SIZE_PRESETS.reduce((closest, candidate) =>
        Math.abs(Math.log(imageAspect / candidate.aspect)) < Math.abs(Math.log(imageAspect / closest.aspect))
            ? candidate
            : closest
    )
}

let moldingMaterial: THREE.MeshStandardMaterial | null = null
let matBoardMaterial: THREE.MeshStandardMaterial | null = null

function getMoldingMaterial(): THREE.MeshStandardMaterial {
    moldingMaterial ??= new THREE.MeshStandardMaterial({
        color: BlockbusterColors.steamLibraryAccent,
        roughness: 0.35,
        metalness: 0.25,
    })
    return moldingMaterial
}

function getMatBoardMaterial(): THREE.MeshStandardMaterial {
    matBoardMaterial ??= new THREE.MeshStandardMaterial({
        color: MAT_BOARD_COLOR,
        roughness: 0.9,
    })
    return matBoardMaterial
}

function buildMoldingBar(width: number, height: number, centerX: number, centerY: number): THREE.Mesh {
    const bar = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, FRAME_DEPTH_METERS),
        getMoldingMaterial()
    )
    bar.position.set(centerX, centerY, -FRAME_DEPTH_METERS / 2)
    bar.castShadow = true
    bar.receiveShadow = true
    return bar
}

function buildMolding(outerHeight: number, borderX: number, borderY: number): THREE.Mesh[] {
    const halfOuterWidth = FRAME_OUTER_WIDTH_METERS / 2
    const halfOuterHeight = outerHeight / 2
    const apertureHeight = outerHeight - 2 * borderY

    return [
        buildMoldingBar(FRAME_OUTER_WIDTH_METERS, borderY, 0, halfOuterHeight - borderY / 2),
        buildMoldingBar(FRAME_OUTER_WIDTH_METERS, borderY, 0, -(halfOuterHeight - borderY / 2)),
        buildMoldingBar(borderX, apertureHeight, -(halfOuterWidth - borderX / 2), 0),
        buildMoldingBar(borderX, apertureHeight, halfOuterWidth - borderX / 2, 0),
    ]
}

function buildMatBoard(apertureWidth: number, apertureHeight: number, z: number): THREE.Mesh {
    const mat = new THREE.Mesh(
        new THREE.PlaneGeometry(apertureWidth, apertureHeight),
        getMatBoardMaterial()
    )
    mat.position.z = z
    mat.receiveShadow = true
    return mat
}

/** Scales to fit inside the aperture preserving aspect - never crops, never upscales past it. */
function computeContainFitSize(
    imageAspect: number,
    apertureWidth: number,
    apertureHeight: number
): { width: number; height: number } {
    const apertureAspect = apertureWidth / apertureHeight
    if (imageAspect > apertureAspect) {
        return { width: apertureWidth, height: apertureWidth / imageAspect }
    }
    return { width: apertureHeight * imageAspect, height: apertureHeight }
}

function buildImagePlane(
    texture: THREE.CanvasTexture,
    imageAspect: number,
    apertureWidth: number,
    apertureHeight: number,
    z: number
): THREE.Mesh {
    const { width, height } = computeContainFitSize(imageAspect, apertureWidth, apertureHeight)

    const image = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshStandardMaterial({ map: texture, roughness: 0.15, metalness: 0.05 })
    )
    image.position.z = z
    return image
}

interface PosterFrameUserData {
    readonly outerHeight: number
}

/** Every built frame's outer height varies with its chosen preset (see file header) - a placer
 *  positioning many frames on the same wall needs this to align them by a consistent measure
 *  (e.g. floor clearance) rather than assuming a shared height. */
export function getFrameOuterHeight(group: THREE.Group): number {
    return (group.userData as PosterFrameUserData).outerHeight
}

export function buildPosterFrame(texture: THREE.CanvasTexture): THREE.Group {
    const imageAspect = texture.image.width / texture.image.height
    const preset = pickPosterSizePreset(imageAspect)

    const outerHeight = FRAME_OUTER_WIDTH_METERS / preset.aspect
    const borderX = FRAME_OUTER_WIDTH_METERS * BORDER_FRACTION
    const borderY = outerHeight * BORDER_FRACTION
    const apertureWidth = FRAME_OUTER_WIDTH_METERS - 2 * borderX
    const apertureHeight = outerHeight - 2 * borderY

    const matZ = -FRAME_DEPTH_METERS / 2
    const imageZ = matZ + 0.002

    const group = new THREE.Group()
    group.add(...buildMolding(outerHeight, borderX, borderY))
    group.add(buildMatBoard(apertureWidth, apertureHeight, matZ))
    group.add(buildImagePlane(texture, imageAspect, apertureWidth, apertureHeight, imageZ))
    group.userData = { outerHeight } satisfies PosterFrameUserData
    return group
}
