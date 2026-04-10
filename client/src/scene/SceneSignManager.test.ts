import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../core/EventManager'
import { GameEventTypes, StorePropsEventTypes, type ShelfReadyEvent } from '../types/InteractionEvents'
import type { GamesSortEvent } from '../types/EnvironmentEvents'
import type { SteamGameData } from './game-box/types/GameData'

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
    EventManager.getInstance().removeAllListeners()
    mockScene.clear()
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

  it('places recently-played and time-bucket signs from GamesSort + ShelfReady', () => {
    const manager = new SceneSignManager()
    const events = EventManager.getInstance()

    const game: SteamGameData = {
      appid: 42,
      name: 'Half-Life 3',
      playtime_forever: 120,
      rtime_last_played: Math.floor(Date.now() / 1000) - 3600,
      img_icon_url: '',
      img_logo_url: '',
    } as SteamGameData

    events.emit<GamesSortEvent>(GameEventTypes.GamesSort, {
      sortedGames: [game],
      buckets: new Map(),
      hasRecentlyPlayedData: true,
    })

    events.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
      shelfId: 0,
      position: new THREE.Vector3(0, 0, -5),
      rotationY: 0,
    })

    expect(createSignMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    const positions = createSignMock.mock.calls.map(([config]) => config.position as THREE.Vector3)
    expect(positions.some((p) => Math.abs(p.y - (3.2 - 0.5)) < 0.001)).toBe(true)

    manager.dispose()
  })
})
