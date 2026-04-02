import { describe, it, expect } from 'vitest'
import * as THREE from 'three'

import { SceneLayer } from '../../src/scene/SceneLayers'
import { LegacyGameBoxRenderer } from '../../src/scene/game-box/LegacyGameBoxRenderer'
import { LodGameArtworkRenderer, type LodTextureArrays, LOD_LEVEL } from '../../src/scene/game-box/instancing/LodGameArtworkRenderer'

describe('Interactable layer contract', () => {
    it('LegacyGameBoxRenderer creates game boxes on interactable layer', () => {
        const renderer = new LegacyGameBoxRenderer()
        const gameBox = renderer.createGameBox(
            { appid: '10', name: 'Legacy Test', playtime_forever: 1 },
            new THREE.Vector3(0, 0, -2)
        )

        expect(gameBox.layers.isEnabled(SceneLayer.Interactable)).toBe(true)
        renderer.dispose()
    })

    it('LodGameArtworkRenderer mesh is on interactable layer', () => {
        const scene = new THREE.Scene()

        const highData = new Uint8Array(4)
        const midData = new Uint8Array(4)

        const high = new THREE.DataArrayTexture(highData, 1, 1, 1)
        high.needsUpdate = true

        const mid = new THREE.DataArrayTexture(midData, 1, 1, 1)
        mid.needsUpdate = true

        const textureArrays: LodTextureArrays = { high, mid }

        const renderer = new LodGameArtworkRenderer({
            maxInstances: 8,
            boxWidth: 0.3,
            boxHeight: 0.4,
            boxDepth: 0.1,
            defaultLod: LOD_LEVEL.MID
        })

        renderer.initialize(textureArrays, scene)

        const mesh = renderer.getMesh()
        expect(mesh).toBeTruthy()
        expect(mesh?.layers.isEnabled(SceneLayer.Interactable)).toBe(true)

        renderer.dispose()
    })
})
