/**
 * A SettingsPanelContext for tests, with the pieces a test needs to look at: the confirmations a
 * panel asked for, and the immersive-session signal to flip.
 */

import { signal } from '@preact/signals-core'
import { EventManager } from '../../src/core/EventManager'
import type { SettingsPanelContext } from '../../src/scene/uikit/SettingsSchemaUIKitRenderer'
import type { ConfirmationRequest } from '../../src/scene/uikit/VRMenuConfirmDialog'

/** A uikit node's current property values, with signal-valued properties already unwrapped. Read
 *  via peek(): the `.value` accessor doesn't resolve a signal-valued property such as `display`. */
export function resolvedProps(node: object): Record<string, unknown> {
    return (node as unknown as { properties: { peek(): Record<string, unknown> } }).properties.peek()
}

export function createTestPanelContext() {
    const confirmations: ConfirmationRequest[] = []
    const immersiveSession = signal(false)
    const eventManager = EventManager.getInstance()

    const context: SettingsPanelContext = {
        eventManager,
        requestConfirmation: request => { confirmations.push(request) },
        immersiveSession
    }

    return { context, confirmations, immersiveSession, eventManager }
}
