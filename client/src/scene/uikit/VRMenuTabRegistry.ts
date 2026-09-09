/**
 * Which panels the VR settings menu shows as tabs, and in what order. Just an ordered list of
 * schemas: a tab's id, title and icon come from the schema itself, so they can't drift from the
 * DOM panel of the same id the way a separately-declared tab list did (this registry used to say
 * 'Display · Advanced' while the schema said 'Advanced', and nothing read the schema's copy).
 *
 * Ported one entry at a time as DOM pause-menu panels migrate onto SettingsSchema (Story 5 of
 * docs/plans/vr-uikit-menu-migration-plan.md). A DOM panel without an entry here isn't listed
 * twice with a dead stub - it just isn't a VR tab yet.
 */

import type { SettingsPanelSchema } from '../../ui/settings/SettingsSchema'
import { DISPLAY_ADVANCED_SCHEMA } from '../../ui/settings/schemas/DisplayAdvancedSchema'
import { DISPLAY_UI_SCHEMA } from '../../ui/settings/schemas/DisplayUISchema'

export const VR_MENU_SCHEMAS: readonly SettingsPanelSchema[] = [
    DISPLAY_ADVANCED_SCHEMA,
    DISPLAY_UI_SCHEMA
]

export const DEFAULT_VR_MENU_TAB_PANEL_ID = VR_MENU_SCHEMAS[0].id

export function findVRMenuSchema(panelId: string): SettingsPanelSchema | undefined {
    return VR_MENU_SCHEMAS.find(schema => schema.id === panelId)
}
