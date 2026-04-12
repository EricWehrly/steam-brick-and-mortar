/// <reference lib="webworker" />
/**
 * NeonGeometryWorker — off-thread font rasterization and tube path extraction.
 *
 * Loads the Three.js font JSON via fetch (workers can fetch, not use DOM FontLoader).
 * Builds a flat Float32Array of tube vertex positions per glyph path and posts them
 * back as Transferables (zero-copy).
 *
 * Current rendering approach — outline tracing:
 *   Each glyph contour (outer edge + inner holes) becomes a separate tube loop.
 *   This produces a "hollow letters" look: tubes running along the perimeter of each
 *   stroke rather than through its centre. Letters read as outlines, not solid neon.
 *
 * TD: stroke-skeleton rendering
 *   Real neon signs bend a single continuous tube along the *medial axis* of each
 *   stroke (the centreline, equidistant from both edges). To pursue that:
 *   - Use a font with explicit stroke/skeleton data (Hershey fonts are defined as
 *     polylines rather than outlines and are a natural fit), or
 *   - Extract the medial axis by thinning the filled glyph shape (Voronoi / straight
 *     skeleton algorithm). opentype.js + potrace is one documented path.
 *   Either approach eliminates the seam artifact at contour start/end and produces
 *   single unbroken tube paths per letter stroke.
 *
 * Message protocol:
 *   IN:  NeonGeometryRequest
 *   OUT: NeonGeometryResponse | NeonGeometryError
 */

// Worker global scope
const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

export {}

// ─── Message Types (exported so NeonGeometryWorker.ts can import them) ────────

export interface NeonGeometryRequest {
    kind: 'neon-geometry'
    messageId: string
    text: string
    fontSize: number
    tubeRadius: number
    segments: number
}

export interface NeonGeometryResponse {
    kind: 'neon-geometry'
    messageId: string
    /** Flat Float32Array per tube: [x,y,z, x,y,z, ...] */
    tubes: Float32Array[]
    offsetX: number
    offsetY: number
}

export interface NeonGeometryError {
    kind: 'neon-geometry-error'
    messageId: string
    error: string
}

// ─── Internal font type (subset of Three.js Font) ────────────────────────────

interface FontGlyph {
    o?: string
}

interface FontData {
    glyphs: Record<string, FontGlyph>
    familyName?: string
    resolution?: number
    boundingBox?: { yMin: number; yMax: number }
}

// ─── Font cache ───────────────────────────────────────────────────────────────

let cachedFontData: FontData | null = null

async function loadFont(): Promise<FontData> {
    if (cachedFontData) return cachedFontData
    const res = await fetch('/fonts/helvetiker_bold.typeface.json')
    if (!res.ok) throw new Error(`Failed to fetch font: ${res.status} ${res.statusText}`)
    cachedFontData = (await res.json()) as FontData
    return cachedFontData
}

// ─── Path extraction from typeface.js glyph format ───────────────────────────

interface Vec2 { x: number; y: number }

/**
 * Parse a typeface.js glyph outline string into a list of contours.
 * Each contour is an array of Vec2 points (already interpolated with segments).
 */
function parseGlyphPaths(glyph: FontGlyph, resolution: number, segments: number): Vec2[][] {
    const outline = glyph.o
    if (!outline) return []

    const contours: Vec2[][] = []
    let current: Vec2[] = []
    const parts = outline.split(' ')
    let i = 0

    while (i < parts.length) {
        const cmd = parts[i++]
        if (cmd === 'm') {
            // moveto — start new contour
            if (current.length > 0) contours.push(current)
            current = []
            const x = parseFloat(parts[i++]) / resolution
            const y = parseFloat(parts[i++]) / resolution
            current.push({ x, y })
        } else if (cmd === 'l') {
            const x = parseFloat(parts[i++]) / resolution
            const y = parseFloat(parts[i++]) / resolution
            current.push({ x, y })
        } else if (cmd === 'q') {
            // quadratic bezier — control point + end point
            const cpX = parseFloat(parts[i++]) / resolution
            const cpY = parseFloat(parts[i++]) / resolution
            const endX = parseFloat(parts[i++]) / resolution
            const endY = parseFloat(parts[i++]) / resolution
            const start = current[current.length - 1]
            for (let s = 1; s <= segments; s++) {
                const t = s / segments
                const it = 1 - t
                current.push({
                    x: it * it * start.x + 2 * it * t * cpX + t * t * endX,
                    y: it * it * start.y + 2 * it * t * cpY + t * t * endY,
                })
            }
        } else if (cmd === 'b') {
            // cubic bezier
            const cp1X = parseFloat(parts[i++]) / resolution
            const cp1Y = parseFloat(parts[i++]) / resolution
            const cp2X = parseFloat(parts[i++]) / resolution
            const cp2Y = parseFloat(parts[i++]) / resolution
            const endX = parseFloat(parts[i++]) / resolution
            const endY = parseFloat(parts[i++]) / resolution
            const start = current[current.length - 1]
            for (let s = 1; s <= segments; s++) {
                const t = s / segments
                const it = 1 - t
                current.push({
                    x: it * it * it * start.x + 3 * it * it * t * cp1X + 3 * it * t * t * cp2X + t * t * t * endX,
                    y: it * it * it * start.y + 3 * it * it * t * cp1Y + 3 * it * t * t * cp2Y + t * t * t * endY,
                })
            }
        } else if (cmd === 'z') {
            // close path — close the contour back to first point
            if (current.length > 0 && (current[0].x !== current[current.length - 1].x || current[0].y !== current[current.length - 1].y)) {
                current.push({ ...current[0] })
            }
        }
        // unknown commands: skip
    }
    if (current.length > 0) contours.push(current)
    return contours
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function handleRequest(req: NeonGeometryRequest): Promise<void> {
    const { messageId, text, fontSize, segments } = req

    let fontData: FontData
    try {
        fontData = await loadFont()
    } catch (err) {
        ctx.postMessage({
            kind: 'neon-geometry-error',
            messageId,
            error: String(err),
        } satisfies NeonGeometryError)
        return
    }

    const resolution = fontData.resolution ?? 1000
    const scale = fontSize

    // Collect all path contours across all glyphs
    const allContours: Vec2[][] = []
    let cursorX = 0

    for (const char of text) {
        const glyph = fontData.glyphs[char] ?? fontData.glyphs['?']
        if (!glyph) { cursorX += 0.2 * scale; continue }

        const contours = parseGlyphPaths(glyph, resolution, segments)
        // Translate by cursor position
        for (const contour of contours) {
            allContours.push(contour.map(p => ({ x: p.x * scale + cursorX, y: p.y * scale })))
        }

        // Advance cursor: approximate glyph width from bounds
        const pts = contours.flat()
        if (pts.length > 0) {
            const maxX = Math.max(...pts.map(p => p.x)) * scale
            cursorX += maxX + 0.02 * scale
        } else {
            cursorX += 0.3 * scale
        }
    }

    // Compute bounding box for centering
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    for (const contour of allContours) {
        for (const p of contour) {
            if (p.x < minX) minX = p.x
            if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y
            if (p.y > maxY) maxY = p.y
        }
    }
    const offsetX = -(minX + maxX) / 2
    const offsetY = -(minY + maxY) / 2

    // Build Float32Array per contour (tube path)
    const tubes: Float32Array[] = []
    for (const contour of allContours) {
        if (contour.length < 2) continue
        const arr = new Float32Array(contour.length * 3)
        for (let j = 0; j < contour.length; j++) {
            arr[j * 3]     = contour[j].x + offsetX
            arr[j * 3 + 1] = contour[j].y + offsetY
            arr[j * 3 + 2] = 0
        }
        tubes.push(arr)
    }

    ctx.postMessage(
        { kind: 'neon-geometry', messageId, tubes, offsetX, offsetY } satisfies NeonGeometryResponse,
        tubes.map(t => t.buffer)
    )
}

ctx.onmessage = (event: MessageEvent<NeonGeometryRequest>) => {
    if (event.data.kind === 'neon-geometry') {
        handleRequest(event.data).catch(err => {
            ctx.postMessage({
                kind: 'neon-geometry-error',
                messageId: event.data.messageId,
                error: String(err),
            } satisfies NeonGeometryError)
        })
    }
}
