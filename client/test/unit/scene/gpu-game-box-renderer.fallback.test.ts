import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { GpuGameBoxRenderer } from '../../../src/scene/game-box/GpuGameBoxRenderer'

const labelAddInstanceSpy = vi.fn((..._args: any[]) => true)

vi.mock('../../../src/scene/game-box/instancing/InstancedLabelRenderer', () => {
    class MockInstancedLabelRenderer {
        constructor(_config?: unknown) {}

        public addLabelInstance = labelAddInstanceSpy
        public setLabelInstance = vi.fn(() => true)
        public isReady = vi.fn(() => true)
        public clear = vi.fn()
        public dispose = vi.fn()
    }

    return { InstancedLabelRenderer: MockInstancedLabelRenderer }
})

vi.mock('../../../src/scene/game-box/instancing/LodArtworkOrchestratorDebug', () => {
    class MockLodArtworkOrchestratorDebug {
        public setArtworkInstanceFromUrl = vi.fn(() => Promise.resolve({ success: true }))
        public prefetchArtwork = vi.fn(() => Promise.resolve('prefetched'))
        public placeInstance = vi.fn(() => 0)
        public clearPlacements = vi.fn()
        public dispose = vi.fn()
        public getMemoryStats = vi.fn(() => ({}))
        public logMemoryStats = vi.fn()
        public setGlobalLod = vi.fn()
        static fromAppSettings(_maxGames?: number) { return new MockLodArtworkOrchestratorDebug() }
    }
    return { LodArtworkOrchestratorDebug: MockLodArtworkOrchestratorDebug }
})

vi.mock('../../../src/scene/game-box/instancing/LodDistanceManagerDebug', () => {
    class MockLodDistanceManagerDebug {
        constructor(_renderer?: unknown) {}
        public dispose = vi.fn()
    }
    return { LodDistanceManagerDebug: MockLodDistanceManagerDebug }
})

vi.mock('../../../src/core/AppSettings', () => {
    const Setting = {
        LodHighReductionRatio: 'lodHighReductionRatio',
        LodMedReductionRatio: 'lodMedReductionRatio',
        LodMaxHighSlots: 'lodMaxHighSlots',
        EnableLabels: 'enableLabels',
    }

    const AppSettings = {
        get: vi.fn((key: string) => {
            if (key === Setting.LodHighReductionRatio) return 0.5
            if (key === Setting.LodMedReductionRatio) return 0.25
            if (key === Setting.LodMaxHighSlots) return 128
            if (key === Setting.EnableLabels) return true
            return undefined
        }),
    }

    return { AppSettings, Setting }
})

describe('GpuGameBoxRenderer — pure execution surface', () => {
    beforeEach(() => {
        labelAddInstanceSpy.mockClear()
    })

    it('placeLabelBox forwards directly to InstancedLabelRenderer', () => {
        const renderer = new GpuGameBoxRenderer(10)
        const game = { appid: 1, name: 'Game A' } as any

        renderer.placeLabelBox(game, new THREE.Vector3(0, 0, 0))

        expect(labelAddInstanceSpy).toHaveBeenCalledTimes(1)
        expect(labelAddInstanceSpy.mock.calls[0][1]).toBe('Game A')
    })

    it('placeLabelBox uses a unique call per game', () => {
        const renderer = new GpuGameBoxRenderer(10)

        renderer.placeLabelBox({ appid: 1, name: 'Game A' } as any, new THREE.Vector3(0, 0, 0))
        renderer.placeLabelBox({ appid: 2, name: 'Game B' } as any, new THREE.Vector3(1, 0, 0))

        expect(labelAddInstanceSpy).toHaveBeenCalledTimes(2)
        expect(labelAddInstanceSpy.mock.calls[0][1]).toBe('Game A')
        expect(labelAddInstanceSpy.mock.calls[1][1]).toBe('Game B')
    })

    it('clearPlacements resets instanced label renderer', () => {
        const renderer = new GpuGameBoxRenderer(10)
        renderer.placeLabelBox({ appid: 1, name: 'Game A' } as any, new THREE.Vector3(0, 0, 0))

        // clearPlacements should not throw even after label boxes placed
        expect(() => renderer.clearPlacements()).not.toThrow()
    })
})
