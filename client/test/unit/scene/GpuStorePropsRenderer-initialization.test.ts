import { describe, expect, it } from 'vitest'
import { StorePropsEventTypes } from '../../../src/types/InteractionEvents'

describe('StoreProps event surface cleanup', () => {
    it('does not expose dead tee-up events', () => {
        const eventTypes = StorePropsEventTypes as Record<string, string | undefined>

        expect(eventTypes.RendererReady).toBeUndefined()
        expect(eventTypes.SetupStarted).toBeUndefined()
        expect(eventTypes.AtmosphericRequest).toBeUndefined()
        expect(eventTypes.GameBoxSpawned).toBeUndefined()
    })
})
