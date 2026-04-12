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

function makeScene() {
    return new THREE.Scene()
}

function makeMesh(width = 2.0, height = 0.4): THREE.Mesh {
    const material = new THREE.MeshStandardMaterial()
    ;(material as THREE.MeshStandardMaterial).map = new THREE.DataTexture(
        new Uint8Array(4),
        1, 1,
        THREE.RGBAFormat
    )
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
}

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

    it('creates a sign and adds it to scene', () => {
        const position = new THREE.Vector3(1, 2, 3)
        const object = renderer.setSign({
            uniqueIdentifier: 'TestSign',
            position,
            text: 'Hello',
        }, scene)

        expect(scene.children).toContain(object)
        expect(createSignMock).toHaveBeenCalledOnce()
        expect((object as THREE.Mesh).position).toMatchObject({ x: 1, y: 2, z: 3 })
    })

    it('applies facingY to mesh.rotation.y on create', () => {
        const mesh = renderer.setSign({
            uniqueIdentifier: 'Rotated',
            position: new THREE.Vector3(0, 0, 0),
            text: 'Rotated',
            facingY: Math.PI / 2,
        }, scene) as THREE.Mesh

        expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2, 6)
    })

    it('passes style colors and derived dimensions to SignageRenderer.createSign', () => {
        renderer.setSign({
            uniqueIdentifier: 'Styled',
            position: new THREE.Vector3(0, 0, 0),
            text: 'Styled',
            style: {
                backgroundColor: 0xff0000,
                textColor: 0x00ff00,
                fontSize: 0.2,
                padding: '0.1 0.2',
            },
        }, scene)

        const [config] = createSignMock.mock.calls[0]
        expect(config.backgroundColor).toBe(0xff0000)
        expect(config.textColor).toBe(0x00ff00)
        expect(config.width).toBeCloseTo(1.12, 6)
        expect(config.height).toBeCloseTo(0.4, 6)
    })

    it('recycles geometry when dimensions are unchanged', () => {
        renderer.setSign({ uniqueIdentifier: 'S', position: new THREE.Vector3(), text: 'A' }, scene)
        createSignMock.mockClear()

        const newPosition = new THREE.Vector3(5, 5, 5)
        const mesh = renderer.setSign({ uniqueIdentifier: 'S', position: newPosition, text: 'B' }, scene) as THREE.Mesh

        expect(createSignMock).not.toHaveBeenCalled()
        expect(bakeTextureMock).toHaveBeenCalledWith('B', expect.any(Number), expect.any(Number))
        expect(mesh.position.x).toBeCloseTo(5, 6)
    })

    it('updates facingY on recycle', () => {
        renderer.setSign({ uniqueIdentifier: 'R', position: new THREE.Vector3(), text: 'X', facingY: 0 }, scene)
        const mesh = renderer.setSign({ uniqueIdentifier: 'R', position: new THREE.Vector3(), text: 'X', facingY: Math.PI }, scene) as THREE.Mesh
        expect(mesh.rotation.y).toBeCloseTo(Math.PI, 6)
    })

    it('replaces geometry when dimensions change', () => {
        renderer.setSign({
            uniqueIdentifier: 'D',
            position: new THREE.Vector3(),
            text: 'T',
            style: { fontSize: 0.18, padding: '0.05' },
        }, scene)

        const mesh = renderer.setSign({
            uniqueIdentifier: 'D',
            position: new THREE.Vector3(),
            text: 'T',
            style: { fontSize: 0.3, padding: '0.2 0.3' },
        }, scene) as THREE.Mesh

        const parameters = (mesh.geometry as THREE.PlaneGeometry).parameters
        expect(parameters.width).toBeCloseTo(0.78, 6)
        expect(parameters.height).toBeCloseTo(0.7, 6)
    })

    it('removes sign from scene and returns true', () => {
        renderer.setSign({ uniqueIdentifier: 'ToRemove', position: new THREE.Vector3(), text: 'bye' }, scene)
        expect(scene.children.length).toBe(1)

        const result = renderer.removeSign('ToRemove', scene)
        expect(result).toBe(true)
        expect(scene.children.length).toBe(0)
    })

    it('returns false when removing a non-existent identifier', () => {
        const result = renderer.removeSign('ghost', scene)
        expect(result).toBe(false)
    })

    it('does not re-add a removed sign on a second remove call', () => {
        renderer.setSign({ uniqueIdentifier: 'X', position: new THREE.Vector3(), text: 'x' }, scene)
        renderer.removeSign('X', scene)
        const result = renderer.removeSign('X', scene)
        expect(result).toBe(false)
    })

    it('removes all signs from scene on dispose', () => {
        renderer.setSign({ uniqueIdentifier: 'A', position: new THREE.Vector3(0, 0, 0), text: 'A' }, scene)
        renderer.setSign({ uniqueIdentifier: 'B', position: new THREE.Vector3(1, 0, 0), text: 'B' }, scene)
        expect(scene.children.length).toBe(2)

        renderer.dispose(scene)
        expect(scene.children.length).toBe(0)
    })
})
