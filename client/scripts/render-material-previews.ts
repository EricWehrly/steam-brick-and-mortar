/**
 * Material Preview Renderer
 *
 * Renders every registered procedural wall material (diffuse + normal) to PNGs, plus a
 * simple raking-light shaded preview and a repeated/rotated "wall composite" approximation
 * of how it looks applied to an actual wall -- so a look can be judged by opening image
 * files, without running the full app or a browser.
 *
 * This started as a throwaway vitest-based script, rebuilt from scratch three separate
 * times while tuning the drywall/wood/brick painters (see
 * docs/plans/procedural-textures-phase1-plan.md for that history). It earned a permanent
 * home here rather than being reinvented again for the next material.
 *
 * Run: yarn preview:materials
 * Output: test-results/material-previews/<material>-{tile,shaded,wall}.png (gitignored)
 *
 * To add a material: register it in MATERIALS below with its painters, preset options,
 * and how it's actually applied (repeat, rotation) -- keep that in sync with
 * SharedMaterialManager.ts's real prewarm* method for the material, so the preview matches
 * production, not a guess.
 */

import { createCanvas, type Canvas } from 'canvas'
import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

import { paintWallDrywall, paintWallDrywallNormal } from '../src/utils/textures/painters/wall-drywall'
import { paintWoodPaneling, paintWoodPanelingNormal } from '../src/utils/textures/painters/wood-paneling'
import { paintWallBrick, paintWallBrickNormal } from '../src/utils/textures/painters/wall-brick'
import { WALL_DRYWALL_DIFFUSE_OPTIONS, WALL_DRYWALL_NORMAL_OPTIONS, WALL_DRYWALL_REPEAT } from '../src/utils/materials/presets/wallDrywallTextureProfiles'
import { WALL_WOOD_DIFFUSE_OPTIONS, WALL_WOOD_NORMAL_OPTIONS, WOOD_PANELING_WALNUT_DIFFUSE_OPTIONS } from '../src/utils/materials/presets/woodTextureProfiles'
import { WALL_BRICK_DIFFUSE_OPTIONS, WALL_BRICK_NORMAL_OPTIONS } from '../src/utils/materials/presets/wallBrickTextureProfiles'

type Painter = (data: Uint8ClampedArray, width: number, height: number, opts: Record<string, unknown>) => void

interface MaterialPreviewDef {
    paintDiffuse: Painter
    paintNormal: Painter
    diffuseOpts: Record<string, unknown>
    normalOpts: Record<string, unknown>
    /** Must match the real repeat used in SharedMaterialManager.ts's prewarm* method. */
    repeatX: number
    repeatY: number
    /** Must match whether SharedMaterialManager.ts rotates this texture 90deg. */
    rotate90: boolean
}

const MATERIALS: Record<string, MaterialPreviewDef> = {
    drywall: {
        paintDiffuse: paintWallDrywall as Painter,
        paintNormal: paintWallDrywallNormal as Painter,
        diffuseOpts: WALL_DRYWALL_DIFFUSE_OPTIONS,
        normalOpts: WALL_DRYWALL_NORMAL_OPTIONS,
        repeatX: WALL_DRYWALL_REPEAT.x,
        repeatY: WALL_DRYWALL_REPEAT.y,
        rotate90: false,
    },
    'wood-honeyoak': {
        paintDiffuse: paintWoodPaneling as Painter,
        paintNormal: paintWoodPanelingNormal as Painter,
        diffuseOpts: WALL_WOOD_DIFFUSE_OPTIONS,
        normalOpts: WALL_WOOD_NORMAL_OPTIONS,
        repeatX: 1,
        repeatY: 4,
        rotate90: true,
    },
    'wood-walnut': {
        paintDiffuse: paintWoodPaneling as Painter,
        paintNormal: paintWoodPanelingNormal as Painter,
        diffuseOpts: WOOD_PANELING_WALNUT_DIFFUSE_OPTIONS,
        normalOpts: WALL_WOOD_NORMAL_OPTIONS,
        repeatX: 1,
        repeatY: 4,
        rotate90: true,
    },
    brick: {
        paintDiffuse: paintWallBrick as Painter,
        paintNormal: paintWallBrickNormal as Painter,
        diffuseOpts: WALL_BRICK_DIFFUSE_OPTIONS,
        normalOpts: WALL_BRICK_NORMAL_OPTIONS,
        repeatX: 3,
        repeatY: 3,
        rotate90: false,
    },
}

const OUT_DIR = path.resolve(__dirname, '../test-results/material-previews')
const TILE_SIZE = 512 // downscaled from the 1024 production textures -- plenty for visual review, faster to render

function toCanvas(data: Uint8ClampedArray, width: number, height: number): Canvas {
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    const imageData = ctx.createImageData(width, height)
    imageData.data.set(data)
    ctx.putImageData(imageData, 0, 0)
    return canvas
}

function saveCanvas(canvas: Canvas, filePath: string): void {
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'))
}

/** Simple Lambertian shading from a fixed raking light, decoding a tangent-space normal map. */
function shadedPreview(albedo: Uint8ClampedArray, normal: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(width * height * 4)
    const lx = 0.75, ly = 0.55, lz = 0.35
    const len = Math.sqrt(lx * lx + ly * ly + lz * lz)
    const Lx = lx / len, Ly = ly / len, Lz = lz / len
    const ambient = 0.55
    for (let i = 0; i < width * height; i++) {
        const idx = i * 4
        const nx = (normal[idx] / 255) * 2 - 1
        const ny = (normal[idx + 1] / 255) * 2 - 1
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
        const ndotl = Math.max(0, nx * Lx + ny * Ly + nz * Lz)
        const light = ambient + (1 - ambient) * ndotl
        out[idx]     = Math.min(255, albedo[idx] * light)
        out[idx + 1] = Math.min(255, albedo[idx + 1] * light)
        out[idx + 2] = Math.min(255, albedo[idx + 2] * light)
        out[idx + 3] = 255
    }
    return out
}

/** Composite a repeated (and optionally 90deg-rotated) tile into a wall-scale preview canvas,
 *  matching how SharedMaterialManager.ts applies `.repeat` and `.rotation` to the real texture. */
function compositeWall(tile: Canvas, repeatX: number, repeatY: number, rotate90: boolean, outSize: number): Canvas {
    const canvas = createCanvas(outSize, outSize)
    const ctx = canvas.getContext('2d')
    ctx.save()
    if (rotate90) {
        ctx.translate(outSize / 2, outSize / 2)
        ctx.rotate(Math.PI / 2)
        ctx.translate(-outSize / 2, -outSize / 2)
    }
    const tileW = outSize / repeatX
    const tileH = outSize / repeatY
    for (let ry = 0; ry < repeatY; ry++) {
        for (let rx = 0; rx < repeatX; rx++) {
            ctx.drawImage(tile, rx * tileW, ry * tileH, tileW, tileH)
        }
    }
    ctx.restore()
    return canvas
}

describe('material previews', () => {
    fs.mkdirSync(OUT_DIR, { recursive: true })

    for (const [name, def] of Object.entries(MATERIALS)) {
        it(`renders ${name}`, () => {
            const albedo = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4)
            const normal = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4)
            def.paintDiffuse(albedo, TILE_SIZE, TILE_SIZE, def.diffuseOpts)
            def.paintNormal(normal, TILE_SIZE, TILE_SIZE, def.normalOpts)

            const tileCanvas = toCanvas(albedo, TILE_SIZE, TILE_SIZE)
            const tilePath = path.join(OUT_DIR, `${name}-tile.png`)
            saveCanvas(tileCanvas, tilePath)

            const shaded = shadedPreview(albedo, normal, TILE_SIZE, TILE_SIZE)
            const shadedPath = path.join(OUT_DIR, `${name}-shaded.png`)
            saveCanvas(toCanvas(shaded, TILE_SIZE, TILE_SIZE), shadedPath)

            const shadedCanvas = toCanvas(shaded, TILE_SIZE, TILE_SIZE)
            const wallPath = path.join(OUT_DIR, `${name}-wall.png`)
            saveCanvas(compositeWall(shadedCanvas, def.repeatX, def.repeatY, def.rotate90, 600), wallPath)

            // Sanity check only -- confirms the files actually got written, not that they
            // look good. "Looks good" is a human judgment call (Read the PNGs directly).
            expect(fs.existsSync(tilePath)).toBe(true)
            expect(fs.existsSync(shadedPath)).toBe(true)
            expect(fs.existsSync(wallPath)).toBe(true)
        })
    }
})
