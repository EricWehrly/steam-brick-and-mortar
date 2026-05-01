import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { GameEventTypes, GameRenderEventTypes, StorePropsEventTypes } from '../../../../src/types/InteractionEvents'

type EventManagerMockInstance = {
    registerEventHandler: Mock
    deregisterEventHandler: Mock
}

function createEventManagerMock(): EventManagerMockInstance {
    return {
        registerEventHandler: vi.fn(),
        deregisterEventHandler: vi.fn(),
    }
}

vi.mock('../../../../src/core/EventManager', async (importOriginal) => {
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

const resetEventManager = () => {
    return import('../../../../src/core/EventManager').then(({ EventManager }) => {
        ;(EventManager as unknown as { resetInstance: () => void }).resetInstance()
    })
}

describe('InstancedShelfRenderer reset contract', () => {
    beforeEach(async () => {
        vi.resetModules()
        await resetEventManager()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('does not subscribe shelf reset to placement-run reset events', async () => {
        const [{ EventManager }, { InstancedShelfRenderer }] = await Promise.all([
            import('../../../../src/core/EventManager'),
            import('../../../../src/scene/instancing/InstancedShelfRenderer'),
        ])

        new InstancedShelfRenderer()

        const eventManager = EventManager.getInstance() as unknown as EventManagerMockInstance
        const registeredEvents = vi
            .mocked(eventManager.registerEventHandler)
            .mock.calls
            .map(([eventType]) => eventType)

        expect(registeredEvents).toContain(GameEventTypes.SomeBatchesComplete)
        expect(registeredEvents).toContain(StorePropsEventTypes.ShelfReady)
        expect(registeredEvents).toContain(GameEventTypes.ShelfLayoutDetermined)
        expect(registeredEvents).not.toContain(GameRenderEventTypes.PlacementRunResetRequested)
    })
})
