/**
 * BlockLetterSignRenderer
 *
 * ISignRenderer implementation producing chunky extruded 3D block letters.
 * Uses THREE.TextGeometry (ExtrudeGeometry on font shapes) for a solid,
 * square-edged appearance — contrasting with the round/bendy NeonTubeSign.
 *
 * Geometry is built synchronously (TextGeometry is fast — no tube iteration).
 * Font is loaded once and cached for subsequent signs.
 */

import * as THREE from 'three'
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import type { ISignRenderer, SignRequest } from './ISignRenderer'

const FONT_URL        = '/fonts/helvetiker_bold.typeface.json'
const DEFAULT_FONT_SIZE  = 0.28   // metres — slightly smaller than neon for legibility at extrude depth
const DEFAULT_DEPTH      = 0.06   // how far letters poke out
const BEVEL_SIZE         = 0.008
const BEVEL_THICKNESS    = 0.004

interface BlockSignEntry {
    group: THREE.Group
    material: THREE.MeshStandardMaterial
}

export class BlockLetterSignRenderer implements ISignRenderer {
    private readonly entries = new Map<string, BlockSignEntry>()
    private font: Font | null = null
    private fontLoadPromise: Promise<Font> | null = null

    private loadFont(): Promise<Font> {
        if (this.font) return Promise.resolve(this.font)
        if (this.fontLoadPromise) return this.fontLoadPromise

        this.fontLoadPromise = new Promise<Font>((resolve, reject) => {
            new FontLoader().load(
                FONT_URL,
                (font) => { this.font = font; resolve(font) },
                undefined,
                reject
            )
        })
        return this.fontLoadPromise
    }

    setSign(request: SignRequest, scene: THREE.Scene): THREE.Object3D {
        this.removeSign(request.uniqueIdentifier, scene)

        const text = request.text ?? ''
        const color    = request.style?.color ?? 0xffffff
        const fontSize = request.style?.fontSize ?? DEFAULT_FONT_SIZE
        const depth    = request.style?.depth   ?? DEFAULT_DEPTH

        const group = new THREE.Group()
        group.position.copy(request.position)
        if (request.facingY !== undefined) group.rotation.y = request.facingY
        if (request.scale   !== undefined) group.scale.setScalar(request.scale)
        scene.add(group)

        const material = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.3,
            metalness: 0.1,
        })

        this.entries.set(request.uniqueIdentifier, { group, material })

        void this.loadFont()
            .then((font) => this.onFontLoaded(font, request.uniqueIdentifier, text, fontSize, depth))
            .catch((err) => this.onFontLoadFailed(request.uniqueIdentifier, err))

        return group
    }

    private buildLetterGeometry(font: Font, text: string, fontSize: number, depth: number): THREE.BufferGeometry {
        const geometry = new TextGeometry(text, {
            font,
            size:           fontSize,
            depth,
            bevelEnabled:   true,
            bevelSize:      BEVEL_SIZE,
            bevelThickness: BEVEL_THICKNESS,
            bevelSegments:  2,
        })
        geometry.computeBoundingBox()
        const box = geometry.boundingBox
        if (box) {
            const offsetX = -(box.max.x + box.min.x) / 2
            const offsetY = -(box.max.y + box.min.y) / 2
            geometry.translate(offsetX, offsetY, 0)
        }
        return geometry
    }

    private onFontLoaded(font: Font, uniqueIdentifier: string, text: string, fontSize: number, depth: number): void {
        const entry = this.entries.get(uniqueIdentifier)
        if (!entry) return  // removed while font was loading
        entry.group.add(new THREE.Mesh(this.buildLetterGeometry(font, text, fontSize, depth), entry.material))
    }

    private onFontLoadFailed(uniqueIdentifier: string, err: unknown): void {
        console.error(`[BlockLetterSignRenderer] Failed to build "${uniqueIdentifier}":`, err)
    }

    private disposeEntryGeometry(entry: BlockSignEntry): void {
        entry.group.traverse((child) => {
            if (child instanceof THREE.Mesh) child.geometry.dispose()
        })
    }

    removeSign(uniqueIdentifier: string, scene: THREE.Scene): boolean {
        const entry = this.entries.get(uniqueIdentifier)
        if (!entry) return false
        this.entries.delete(uniqueIdentifier)
        scene.remove(entry.group)
        this.disposeEntryGeometry(entry)
        entry.material.dispose()
        return true
    }

    clearAll(scene: THREE.Scene): void {
        for (const uniqueIdentifier of [...this.entries.keys()]) {
            this.removeSign(uniqueIdentifier, scene)
        }
    }

    dispose(scene: THREE.Scene): void {
        this.clearAll(scene)
        this.font = null
        this.fontLoadPromise = null
    }
}
