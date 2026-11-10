/**
 * A SettingsPanelContext for tests, with the immersive-session signal exposed so a test can flip it.
 */

import { signal } from '@preact/signals-core'
import type { SettingsPanelContext } from '../../src/scene/uikit/SettingsSchemaUIKitRenderer'

/** A uikit node's current property values, with signal-valued properties already unwrapped. Read
 *  via peek(): the `.value` accessor doesn't resolve a signal-valued property such as `display`. */
export function resolvedProps(node: object): Record<string, unknown> {
    return (node as unknown as { properties: { peek(): Record<string, unknown> } }).properties.peek()
}

export function createTestPanelContext() {
    const immersiveSession = signal(false)
    const context: SettingsPanelContext = { immersiveSession }

    return { context, immersiveSession }
}
