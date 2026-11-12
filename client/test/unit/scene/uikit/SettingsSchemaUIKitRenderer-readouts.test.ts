/**
 * The renderer's two live bindings: a readout row shows what an owner reports through
 * ReadoutsUpdated, and a setting-bound row follows that setting when it changes elsewhere. Both
 * stop once the panel is disposed.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { AppSettings } from '../../../../src/core/AppSettings'
import { EventManager } from '../../../../src/core/EventManager'
import { buildSettingsPanel } from '../../../../src/scene/uikit/SettingsSchemaUIKitRenderer'
import { UIEventTypes, type ReadoutsRequestedEvent, type ReadoutsUpdatedEvent } from '../../../../src/types/InteractionEvents'
import { CACHE_MANAGEMENT_SCHEMA, CACHE_READOUT_ID } from '../../../../src/ui/settings/schemas/CacheManagementSchema'
import { createTestPanelContext, resolvedProps } from '../../../utils/settings-panel-context'

function reportReadouts(values: ReadoutsUpdatedEvent['values']): void {
    EventManager.getInstance().emit<ReadoutsUpdatedEvent>(UIEventTypes.ReadoutsUpdated, { values })
}

describe('buildSettingsPanel readouts', () => {
    const appSettings = AppSettings.getInstance()

    // Panel children: title, then the one section [heading, count row, storage row, refresh, clear].
    function readoutText(panel: ReturnType<typeof buildSettingsPanel>, rowIndex: number): unknown {
        const row = panel.container.children[1].children[rowIndex]
        return resolvedProps(row.children[1]).text
    }

    afterEach(() => {
        appSettings.resetSettingsToDefaults(['cameraFov'])
    })

    it('starts a readout on a placeholder and shows what is reported', () => {
        const panel = buildSettingsPanel(CACHE_MANAGEMENT_SCHEMA, appSettings, createTestPanelContext().context)
        expect(readoutText(panel, 1)).toBe('...')

        reportReadouts({ [CACHE_READOUT_ID.ImageCacheCount]: '12' })

        expect(readoutText(panel, 1)).toBe('12')
        expect(readoutText(panel, 2)).toBe('...')
        panel.dispose()
    })

    it('asks for its readouts by id when built', () => {
        const requested: string[][] = []
        function recordRequest(event: CustomEvent<ReadoutsRequestedEvent>): void {
            requested.push([...event.detail.ids])
        }
        const eventManager = EventManager.getInstance()
        eventManager.registerEventHandler<ReadoutsRequestedEvent>(UIEventTypes.ReadoutsRequested, recordRequest)

        const panel = buildSettingsPanel(CACHE_MANAGEMENT_SCHEMA, appSettings, createTestPanelContext().context)

        eventManager.deregisterEventHandler(UIEventTypes.ReadoutsRequested, recordRequest)
        expect(requested).toEqual([[CACHE_READOUT_ID.ImageCacheCount, CACHE_READOUT_ID.StorageUsage]])
        panel.dispose()
    })

    it('stops showing reports after dispose()', () => {
        const panel = buildSettingsPanel(CACHE_MANAGEMENT_SCHEMA, appSettings, createTestPanelContext().context)
        panel.dispose()

        reportReadouts({ [CACHE_READOUT_ID.ImageCacheCount]: '99' })

        expect(readoutText(panel, 1)).toBe('...')
    })
})
