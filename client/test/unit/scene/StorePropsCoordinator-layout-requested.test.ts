import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { DataDomain } from '../../../src/core/data/DataTypes'
import {
    GameEventTypes,
    SteamEventTypes,
    StorePropsEventTypes,
    UIEventTypes,
} from '../../../src/types/InteractionEvents'

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

function makeGames(count: number): Array<{ appid: number; name: string }> {
    return Array.from({ length: count }, (_, index) => ({
        appid: index + 1,
        name: `Game ${index + 1}`,
    }))
}

function getRegisteredLayoutHandler(eventManager: EventManagerMockInstance): Function {
    const registration = vi.mocked(eventManager.registerEventHandler).mock.calls.find(
        ([eventType]) => eventType === UIEventTypes.LayoutRequested
    )

    expect(registration).toBeDefined()
    return registration?.[1] as Function
}

describe('StorePropsCoordinator layout replay', () => {
    beforeEach(async () => {
        vi.resetModules()
        await resetEventManager()
        const { DataManager } = await import('../../../src/core/data/DataManager')
        DataManager.resetInstance()
    })

    afterEach(async () => {
        vi.clearAllMocks()
        const { DataManager } = await import('../../../src/core/data/DataManager')
        DataManager.resetInstance()
    })

    it('re-emits manifest and game data with recomputed batch count on layout switch', async () => {
        const [{ DataManager }, { EventManager }] = await Promise.all([
            import('../../../src/core/data/DataManager'),
            import('../../../src/core/EventManager'),
        ])

        await import('../../../src/scene/props/StorePropsCoordinator')

        const dataManager = DataManager.getInstance()
        dataManager.set('steam.games', makeGames(19), {
            domain: DataDomain.SteamIntegration,
        })

        const eventManager = EventManager.getInstance() as unknown as EventManagerMockInstance
        const handleLayoutRequested = getRegisteredLayoutHandler(eventManager)

        handleLayoutRequested(new CustomEvent(UIEventTypes.LayoutRequested, {
            detail: { layoutMode: 'grid' },
        }))

        const emitCalls = vi.mocked(eventManager.emit).mock.calls
        const setupCallIndex = emitCalls.findIndex(([eventType]) => eventType === StorePropsEventTypes.SetupRequest)
        const manifestCallIndex = emitCalls.findIndex(([eventType]) => eventType === SteamEventTypes.LibraryManifestReady)
        const gameDataCallIndex = emitCalls.findIndex(([eventType]) => eventType === GameEventTypes.GameDataReady)

        expect(setupCallIndex).toBeGreaterThanOrEqual(0)
        expect(manifestCallIndex).toBeGreaterThan(setupCallIndex)
        expect(gameDataCallIndex).toBeGreaterThan(manifestCallIndex)

        expect(emitCalls[manifestCallIndex]?.[1]).toEqual({ totalGames: 19 })
        expect(emitCalls[gameDataCallIndex]?.[1]).toEqual({ totalGames: 19, totalBatches: 2 })
    })
})