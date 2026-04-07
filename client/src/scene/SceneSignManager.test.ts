import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

const mockScene = new THREE.Scene()
const createSignMock = vi.fn()

vi.mock('../core/data/DataManager', () => ({
  DataManager: {
    getInstance: () => ({
      get: () => mockScene,
    }),
  },
}))

vi.mock('./SignageRenderer', () => ({
  SignageRenderer: class {
    createSign(config: { position: THREE.Vector3 }) {
      return createSignMock(config)
    }
    dispose() {}
  },
}))

import { SceneSignManager } from './SceneSignManager'

describe('SceneSignManager above-shelf mount math', () => {
  beforeEach(() => {
    createSignMock.mockImplementation((config: { position: THREE.Vector3 }) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
      mesh.position.copy(config.position)
      return mesh
    })
  })

  it('applies frontOffset along signFacingY and writes mesh.rotation.y', () => {
    const manager = new SceneSignManager()
    const anchor = new THREE.Vector3(10, 2, -5)
    const signFacingY = Math.PI / 2
    const frontOffset = 0.3

    const mesh = manager.setSign({
      label: 'Played This Week',
      anchorPosition: anchor,
      mount: {
        style: 'above-shelf',
        yOffset: 0.2,
        frontOffset,
        signFacingY,
      },
    })

    expect(mesh.position.x).toBeCloseTo(anchor.x + Math.sin(signFacingY) * frontOffset, 6)
    expect(mesh.position.y).toBeCloseTo(anchor.y + 0.2, 6)
    expect(mesh.position.z).toBeCloseTo(anchor.z + Math.cos(signFacingY) * frontOffset, 6)
    expect(mesh.rotation.y).toBeCloseTo(signFacingY, 6)

    manager.dispose()
  })
})
