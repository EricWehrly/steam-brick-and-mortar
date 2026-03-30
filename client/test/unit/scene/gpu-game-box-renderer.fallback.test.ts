import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { GpuGameBoxRenderer } from '../../../src/scene/game-box/GpuGameBoxRenderer'

const labelAddInstanceSpy = vi.fn((..._args: any[]) => true)
const artworkSetFromUrlSpy = vi.fn(() => Promise.resolve({ success: true }))

vi.mock('../../../src/scene/game-box/instancing/InstancedLabelRenderer', () => {
    class MockInstancedLabelRenderer {
        constructor(_config?: unknown) {}

        public addLabelInstance = labelAddInstanceSpy
        public setLabelInstance = vi.fn(() => true)
        public isReady = vi.fn(() => true)
        public dispose = vi.fn()
    }

    return { InstancedLabelRenderer: MockInstancedLabelRenderer }
})

vi.mock('../../../src/scene/game-box/instancing/LodArtworkOrchestratorDebug', () => {
    class MockLodArtworkOrchestratorDebug {
        constructor(_config?: unknown) {}

        public setArtworkInstanceFromUrl = artworkSetFromUrlSpy
        public dispose = vi.fn()
        public getMemoryStats = vi.fn(() => ({}))
        public logMemoryStats = vi.fn()
        public setGlobalLod = vi.fn()
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

describe('GpuGameBoxRenderer fallback behavior', () => {
    beforeEach(() => {
        labelAddInstanceSpy.mockClear()
        artworkSetFromUrlSpy.mockClear()
    })

    it('uses a unique label instance index for each fallback label', () => {
        const renderer = new GpuGameBoxRenderer(10)
        const position = new THREE.Vector3(0, 0, 0)

        renderer.createLabelGameBox({ appid: 1, name: 'Game A' } as any, position)
        renderer.createLabelGameBox({ appid: 2, name: 'Game B' } as any, position)

        expect(labelAddInstanceSpy).toHaveBeenCalledTimes(2)
        const firstCall = labelAddInstanceSpy.mock.calls[0] as any[]
        const secondCall = labelAddInstanceSpy.mock.calls[1] as any[]

        expect(firstCall[1]).toBe('Game A')
        expect(secondCall[1]).toBe('Game B')
    })

    it('always attempts artwork when artwork metadata is available', () => {
        const renderer = new GpuGameBoxRenderer(10)
        const game = {
            appid: 10,
            name: 'Game With Artwork',
            artwork: { library: 'https://example.com/library.jpg' },
        } as any

        renderer.createGameBoxAuto(game, new THREE.Vector3(1, 2, 3))

        expect(artworkSetFromUrlSpy).toHaveBeenCalledTimes(1)
        expect(labelAddInstanceSpy).not.toHaveBeenCalled()
    })

    it('falls back to label when artwork metadata is unavailable', () => {
        const renderer = new GpuGameBoxRenderer(10)
        const game = {
            name: 'No Artwork Game',
            artwork: undefined,
        } as any

        renderer.createGameBoxAuto(game, new THREE.Vector3(1, 2, 3))

        expect(labelAddInstanceSpy).toHaveBeenCalledTimes(1)
    })
})
