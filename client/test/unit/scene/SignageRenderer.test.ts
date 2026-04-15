import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof THREE>()
  return {
    ...actual,
    DataTexture: vi.fn().mockImplementation(function (this: Record<string, unknown>, data: Uint8Array, width: number, height: number) {
      return {
        _data: data,
        _width: width,
        _height: height,
        needsUpdate: false,
        dispose: vi.fn(),
      }
    }),
    CanvasTexture: vi.fn().mockImplementation(function () { return { needsUpdate: false, dispose: vi.fn() } }),
    MeshStandardMaterial: vi.fn().mockImplementation(function (this: Record<string, unknown>, params: Record<string, unknown>) {
      return {
        ...params,
        map: params.map,
        dispose: vi.fn(),
      }
    }),
    PlaneGeometry: vi.fn().mockImplementation(function () { return { dispose: vi.fn() } }),
    Mesh: vi.fn().mockImplementation(function (this: Record<string, unknown>, geometry: unknown, material: unknown) {
      const obj: Record<string, unknown> = {
        geometry,
        material,
        name: '',
        position: { copy: vi.fn() },
        userData: {} as Record<string, unknown>,
      }
      return obj
    }),
    Vector3: actual.Vector3,
    RGBAFormat: (actual as { RGBAFormat?: number }).RGBAFormat ?? 1023,
  }
})

import { SignageRenderer } from '../../../src/scene/SignageRenderer'

describe('SignageRenderer', () => {
  const makeConfig = (text: string) => ({
    text,
    position: new THREE.Vector3(0, 0, 0),
    backgroundColor: 0x1a3a5c,
    textColor: 0xffffff,
  })

  it('stores label text in userData.signText', () => {
    const renderer = new SignageRenderer()
    const sign = renderer.createSign(makeConfig('Action'))
    expect((sign.userData as Record<string, unknown>).signText).toBe('Action')
  })

  it('creates independent DataTextures per sign (no shared mutable texture source)', () => {
    const renderer = new SignageRenderer()
    const labels = ['Action', 'RPG', 'Strategy', 'Indie', 'Early Access']
    labels.forEach(l => renderer.createSign(makeConfig(l)))

    const DataTextureMock = THREE.DataTexture as unknown as ReturnType<typeof vi.fn>
    const calls = DataTextureMock.mock.calls as [Uint8Array, number, number][]
    const dataRefs = calls.slice(-labels.length).map(([data]) => data)
    expect(new Set(dataRefs).size).toBe(labels.length)
  })

  it('same-text signs still get separate DataTexture pixel buffers', () => {
    const renderer = new SignageRenderer()
    renderer.createSign(makeConfig('Action'))
    renderer.createSign(makeConfig('Action'))

    const DataTextureMock = THREE.DataTexture as unknown as ReturnType<typeof vi.fn>
    const calls = DataTextureMock.mock.calls as [Uint8Array, number, number][]
    const [d1, d2] = calls.slice(-2).map(([data]) => data)
    expect(d1).not.toBe(d2)
  })

  it('names the mesh with sign-canvas- prefix and text slug', () => {
    const renderer = new SignageRenderer()
    const sign = renderer.createSign(makeConfig('Recently Played'))
    expect((sign as unknown as { name: string }).name).toMatch(/^sign-canvas-recently-played/)
  })

  it('produces unique non-empty names for distinct sign texts', () => {
    const renderer = new SignageRenderer()
    const labels = ['Action', 'RPG', 'Strategy']
    const signs = labels.map(l => renderer.createSign(makeConfig(l)))
    const names = signs.map(s => (s as unknown as { name: string }).name)
    expect(names.every(n => n.length > 0)).toBe(true)
    expect(new Set(names).size).toBe(labels.length)
  })
})
