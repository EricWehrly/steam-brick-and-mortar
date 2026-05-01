import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import * as THREE from 'three'
import { DataDomain } from '../../../src/core/data/DataTypes'
import { StorePropsEventTypes, UIEventTypes } from '../../../src/types/InteractionEvents'

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

vi.mock('../../../src/core/EventManager', async (importOriginal) => {
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
    return import('../../../src/core/EventManager').then(({ EventManager }) => {
        ;(EventManager as unknown as { resetInstance: () => void }).resetInstance()
    })
}

const shelfRendererResetSpy = vi.fn()

vi.mock('../../../src/scene/instancing/InstancedShelfRenderer', () => {
    return {
        InstancedShelfRenderer: class {
            public initialize(): Promise<void> {
                return Promise.resolve()
            }

            public reset(): void {
                shelfRendererResetSpy()
            }

            public dispose(): void {}
        },
    }
})

describe('StorePropsCoordinator shelf reset ownership', () => {
    beforeEach(async () => {
        vi.resetModules()
        shelfRendererResetSpy.mockReset()
        await resetEventManager()
        const { DataManager } = await import('../../../src/core/data/DataManager')
        DataManager.resetInstance()

        const dataManager = DataManager.getInstance()
        dataManager.set('core.mainScene', new THREE.Scene(), {
            domain: DataDomain.Scene,
        })
        dataManager.set('steam.games', Array.from({ length: 20 }, (_, index) => ({ appid: index + 1 })), {
            domain: DataDomain.SteamIntegration,
        })
    })

    afterEach(async () => {
        vi.clearAllMocks()
        const { DataManager } = await import('../../../src/core/data/DataManager')
        DataManager.resetInstance()
    })

    it('resets shelf renderer on arrangement request, library reload, and batch-count changes', async () => {
        const { EventManager } = await import('../../../src/core/EventManager')
        await import('../../../src/scene/props/StorePropsCoordinator')

        const eventManager = EventManager.getInstance() as unknown as EventManagerMockInstance

        const setupCall = vi.mocked(eventManager.registerOverrideHandler).mock.calls.find(
            ([eventType]) => eventType === StorePropsEventTypes.SetupRequest
        )
        expect(setupCall).toBeDefined()
        const setupHandler = setupCall?.[1] as (event: CustomEvent<unknown>) => Promise<void>
        await setupHandler(new CustomEvent(StorePropsEventTypes.SetupRequest, { detail: {} }))

        const arrangementCall = vi.mocked(eventManager.registerEventHandler).mock.calls.find(
            ([eventType]) => eventType === UIEventTypes.ArrangementRequested
        )
        expect(arrangementCall).toBeDefined()
        const arrangementHandler = arrangementCall?.[1] as () => void
        arrangementHandler()

        const reloadCall = vi.mocked(eventManager.registerOverrideHandler).mock.calls.find(
            ([eventType]) => eventType === StorePropsEventTypes.LibraryReloadRequest
        )
        expect(reloadCall).toBeDefined()
        const reloadHandler = reloadCall?.[1] as (event: CustomEvent<unknown>) => void
        reloadHandler(new CustomEvent(StorePropsEventTypes.LibraryReloadRequest, { detail: {} }))

        const batchReadyCall = vi.mocked(eventManager.registerEventHandler).mock.calls.find(
            ([eventType]) => eventType === StorePropsEventTypes.BatchReadyForPlacement
        )
        expect(batchReadyCall).toBeDefined()
        const batchReadyHandler = batchReadyCall?.[1] as (event: CustomEvent<{ totalBatches: number }>) => void
        batchReadyHandler(new CustomEvent(StorePropsEventTypes.BatchReadyForPlacement, { detail: { totalBatches: 2 } }))
        batchReadyHandler(new CustomEvent(StorePropsEventTypes.BatchReadyForPlacement, { detail: { totalBatches: 3 } }))

        expect(shelfRendererResetSpy).toHaveBeenCalledTimes(3)
    })
})
