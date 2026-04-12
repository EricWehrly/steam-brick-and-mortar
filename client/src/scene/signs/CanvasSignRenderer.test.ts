import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// ─── Mock SignageRenderer ─────────────────────────────────────────────────────

const createSignMock = vi.fn()
const bakeTextureMock = vi.fn()

vi.mock('../SignageRenderer', () => ({
    SignageRenderer: class {
        createSign(config: { position: THREE.Vector3 }) {
            return createSignMock(config)
        }
        bakeTexture(text: string, bg: number, fg: number) {
            return bakeTextureMock(text, bg, fg)
        }
        dispose() {}
    },
}))

// Import after mock is registered
import { CanvasSignRenderer } from './CanvasSignRenderer'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeScene() {
    return new THREE.Scene()
}

function makeMesh(width = 2.0, height = 0.4): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial()
    // Simulate an existing map so dispose can be called
    ;(mat as THREE.MeshStandardMaterial).map = new THREE.DataTexture(
        new Uint8Array(4),
        1, 1,
        THREE.RGBAFormat
    )
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CanvasSignRenderer', () => {
    let renderer: CanvasSignRenderer
    let scene: THREE.Scene

    beforeEach(() => {
        vi.clearAllMocks()
        renderer = new CanvasSignRenderer()
        scene = makeScene()

        createSignMock.mockImplementation((config: { position: THREE.Vector3 }) => {
            const mesh = makeMesh()
            mesh.position.copy(config.position)
            return mesh
        })
        bakeTextureMock.mockReturnValue(new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat))
    })

    // ── create ────────────────────────────────────────────────────────────────

    it('creates a sign and adds it to scene', () => {
        const pos = new THREE.Vector3(1, 2, 3)
        const obj = renderer.setSign({
            label: 'TestSign',
            position: pos,
            text: 'Hello',
        }, scene)

        expect(scene.children).toContain(obj)
        expect(createSignMock).toHaveBeenCalledOnce()
        expect((obj as THREE.Mesh).position).toMatchObject({ x: 1, y: 2, z: 3 })
    })

    it('applies facingY to mesh.rotation.y on create', () => {
        const mesh = renderer.setSign({
            label: 'Rotated',
            position: new THREE.Vector3(0, 0, 0),
            text: 'Rotated',
            facingY: Math.PI / 2,
        }, scene) as THREE.Mesh

        expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2, 6)
    })

    it('passes style colors and dimensions to SignageRenderer.createSign', () => {
        renderer.setSign({
            label: 'Styled',
            position: new THREE.Vector3(0, 0, 0),
            text: 'Styled',
            style: {
                backgroundColor: 0xff0000,
                textColor: 0x00ff00,
                width: 3.0,
                height: 0.6,
            },
        }, scene)

        const [config] = createSignMock.mock.calls[0]
        expect(config.backgroundColor).toBe(0xff0000)
        expect(config.textColor).toBe(0x00ff00)
        expect(config.width).toBe(3.0)
        expect(config.height).toBe(0.6)
    })

    // ── update (same dims) ────────────────────────────────────────────────────

    it('recycles geometry when dimensions are unchanged', () => {
        renderer.setSign({ label: 'S', position: new THREE.Vector3(), text: 'A' }, scene)
        createSignMock.mockClear()

        const newPos = new THREE.Vector3(5, 5, 5)
        const mesh = renderer.setSign({ label: 'S', position: newPos, text: 'B' }, scene) as THREE.Mesh

        // No new mesh created
        expect(createSignMock).not.toHaveBeenCalled()
        // bakeTexture called to re-render text
        expect(bakeTextureMock).toHaveBeenCalledWith('B', expect.any(Number), expect.any(Number))
        // Position updated
        expect(mesh.position.x).toBeCloseTo(5, 6)
    })

    it('updates facingY on recycle', () => {
        renderer.setSign({ label: 'R', position: new THREE.Vector3(), text: 'X', facingY: 0 }, scene)
        const mesh = renderer.setSign({ label: 'R', position: new THREE.Vector3(), text: 'X', facingY: Math.PI }, scene) as THREE.Mesh
        expect(mesh.rotation.y).toBeCloseTo(Math.PI, 6)
    })

    // ── update (different dims) ───────────────────────────────────────────────

    it('replaces geometry when dimensions change', () => {
        renderer.setSign({
            label: 'D',
            position: new THREE.Vector3(),
            text: 'T',
            style: { width: 2.0, height: 0.4 },
        }, scene)

        const mesh = renderer.setSign({
            label: 'D',
            position: new THREE.Vector3(),
            text: 'T',
            style: { width: 4.0, height: 0.8 },
        }, scene) as THREE.Mesh

        // Geometry should reflect new dimensions
        // PlaneGeometry stores parameters; check it was replaced (not the same 2x0.4 plane)
        const params = (mesh.geometry as THREE.PlaneGeometry).parameters
        expect(params.width).toBeCloseTo(4.0, 6)
        expect(params.height).toBeCloseTo(0.8, 6)
    })

    // ── removeSign ────────────────────────────────────────────────────────────

    it('removes sign from scene and returns true', () => {
        renderer.setSign({ label: 'ToRemove', position: new THREE.Vector3(), text: 'bye' }, scene)
        expect(scene.children.length).toBe(1)

        const result = renderer.removeSign('ToRemove', scene)
        expect(result).toBe(true)
        expect(scene.children.length).toBe(0)
    })

    it('returns false when removing a non-existent label', () => {
        const result = renderer.removeSign('ghost', scene)
        expect(result).toBe(false)
    })

    it('does not re-add a removed sign on a second remove call', () => {
        renderer.setSign({ label: 'X', position: new THREE.Vector3(), text: 'x' }, scene)
        renderer.removeSign('X', scene)
        const result = renderer.removeSign('X', scene)
        expect(result).toBe(false)
    })

    // ── dispose ───────────────────────────────────────────────────────────────

    it('removes all signs from scene on dispose', () => {
        renderer.setSign({ label: 'A', position: new THREE.Vector3(0, 0, 0), text: 'A' }, scene)
        renderer.setSign({ label: 'B', position: new THREE.Vector3(1, 0, 0), text: 'B' }, scene)
        expect(scene.children.length).toBe(2)

        renderer.dispose(scene)
        expect(scene.children.length).toBe(0)
    })
})
