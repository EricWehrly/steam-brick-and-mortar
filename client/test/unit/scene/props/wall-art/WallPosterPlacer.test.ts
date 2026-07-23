import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import * as THREE from 'three'
import { RoomEventTypes, type RoomResizedEvent } from '../../../../../src/types/InteractionEvents'

type EventManagerMockInstance = {
    registerEventHandler: Mock
    registerOverrideHandler: Mock
    emit: Mock
}

function createEventManagerMock(): EventManagerMockInstance {
    return {
        registerEventHandler: vi.fn(),
        registerOverrideHandler: vi.fn(),
        emit: vi.fn(),
    }
}

vi.mock('../../../../../src/core/EventManager', async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>
    let mockInstance: EventManagerMockInstance | null = null

    return {
        ...actual,
        EventManager: Object.assign(vi.fn(), {
            getInstance: vi.fn(() => {
                mockInstance ??= createEventManagerMock()
                return mockInstance
            }),
            resetInstance: () => {
                mockInstance = null
            },
        }),
    }
})

const fakeScreenshots = [
    { appid: 440, filename: '440/a.jpg', width: 1600, height: 1000, creation: 100, caption: null },
    { appid: 620, filename: '620/a.jpg', width: 1600, height: 1000, creation: 200, caption: null },
]

vi.mock('../../../../../src/steam/LocalScreenshotReader', () => ({
    LocalScreenshotReader: {
        listScreenshots: vi.fn().mockResolvedValue(fakeScreenshots),
        readScreenshotBytes: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    },
}))

vi.mock('../../../../../src/scene/props/wall-art/PosterTexture', () => ({
    buildPosterTexture: vi.fn().mockImplementation(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 1600
        canvas.height = 1000
        return Promise.resolve(new THREE.CanvasTexture(canvas))
    }),
}))

async function flushMicrotasks(times = 15): Promise<void> {
    for (let i = 0; i < times; i++) {
        await Promise.resolve()
    }
}

function resizeEvent(width: number, depth = 16): CustomEvent<RoomResizedEvent> {
    return new CustomEvent(RoomEventTypes.Resized, {
        detail: {
            dimensions: { width, depth, height: 3.5 },
            centerOffset: { x: 0, y: 0, z: -6 },
        },
    })
}

describe('WallPosterPlacer', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('places one frame per distinct game once screenshots and room geometry are both known', async () => {
        const { EventManager } = await import('../../../../../src/core/EventManager')
        const { WallPosterPlacer } = await import('../../../../../src/scene/props/wall-art/WallPosterPlacer')

        const scene = new THREE.Scene()
        WallPosterPlacer.getInstance(scene)
        await flushMicrotasks()

        const eventManager = EventManager.getInstance() as unknown as EventManagerMockInstance
        const resizeCall = vi.mocked(eventManager.registerEventHandler).mock.calls.find(
            ([eventType]) => eventType === RoomEventTypes.Resized
        )
        expect(resizeCall).toBeDefined()
        const resizeHandler = resizeCall?.[1] as (event: CustomEvent<RoomResizedEvent>) => void

        resizeHandler(resizeEvent(22))
        await flushMicrotasks()

        expect(scene.children).toHaveLength(2)
    })

    it('spaces placed frames by the 3-frame-width gap pitch, centered on the wall', async () => {
        const { EventManager } = await import('../../../../../src/core/EventManager')
        const { WallPosterPlacer } = await import('../../../../../src/scene/props/wall-art/WallPosterPlacer')

        const scene = new THREE.Scene()
        WallPosterPlacer.getInstance(scene)
        await flushMicrotasks()

        const eventManager = EventManager.getInstance() as unknown as EventManagerMockInstance
        const resizeHandler = vi.mocked(eventManager.registerEventHandler).mock.calls.find(
            ([eventType]) => eventType === RoomEventTypes.Resized
        )?.[1] as (event: CustomEvent<RoomResizedEvent>) => void

        resizeHandler(resizeEvent(22))
        await flushMicrotasks()

        const xs = scene.children.map(child => child.position.x).sort((a, b) => a - b)
        expect(xs[1] - xs[0]).toBeCloseTo(10.8)
    })

    it('does not rebuild textures when a later resize repeats the same dimensions', async () => {
        const { EventManager } = await import('../../../../../src/core/EventManager')
        const { WallPosterPlacer } = await import('../../../../../src/scene/props/wall-art/WallPosterPlacer')
        const { buildPosterTexture } = await import('../../../../../src/scene/props/wall-art/PosterTexture')

        const scene = new THREE.Scene()
        WallPosterPlacer.getInstance(scene)
        await flushMicrotasks()

        const eventManager = EventManager.getInstance() as unknown as EventManagerMockInstance
        const resizeHandler = vi.mocked(eventManager.registerEventHandler).mock.calls.find(
            ([eventType]) => eventType === RoomEventTypes.Resized
        )?.[1] as (event: CustomEvent<RoomResizedEvent>) => void

        resizeHandler(resizeEvent(22))
        await flushMicrotasks()
        const callsAfterFirst = vi.mocked(buildPosterTexture).mock.calls.length

        resizeHandler(resizeEvent(22))
        await flushMicrotasks()

        expect(vi.mocked(buildPosterTexture).mock.calls.length).toBe(callsAfterFirst)
    })
})
