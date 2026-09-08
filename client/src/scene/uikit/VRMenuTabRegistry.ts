/**
 * The VR settings menu's tab list - what VRSettingsMenuShell renders as its tab column. Ported
 * one entry at a time as DOM pause-menu panels migrate onto SettingsSchema (Story 5 of
 * docs/plans/vr-uikit-menu-migration-plan.md). A DOM panel without a real entry here isn't listed
 * twice with a dead stub - it just isn't a VR tab yet, same as before this registry existed.
 */

import type { Container } from '@pmndrs/uikit'
import type { AppSettings } from '../../core/AppSettings'
import { VRDisplayAdvancedPanel } from './panels/VRDisplayAdvancedPanel'
import { VRPlaceholderPanel } from './panels/VRPlaceholderPanel'

export interface VRMenuTabContent {
    readonly container: Container
}

export interface VRMenuTab {
    /** Matches the DOM PauseMenuPanel.id this tab mirrors, so UIEventTypes.MenuPanelChanged can
     *  sync the two menus by a shared id rather than each side inventing its own. */
    readonly panelId: string
    readonly title: string
    readonly icon: string
    build(appSettings: AppSettings): VRMenuTabContent
}

const MORE_SETTINGS_PANEL_ID = 'vr-more-settings'

export const VR_MENU_TABS: readonly VRMenuTab[] = [
    {
        panelId: 'display-advanced',
        title: 'Display · Advanced',
        icon: '🔬',
        build: appSettings => new VRDisplayAdvancedPanel(appSettings)
    },
    {
        // Doesn't correspond to a real DOM panel id - stands in for every DOM panel not yet
        // ported to VR, so the shell has more than one tab to prove switching actually works
        // (Story 4's acceptance criterion) without overclaiming coverage Story 5 hasn't built yet.
        panelId: MORE_SETTINGS_PANEL_ID,
        title: 'More Settings',
        icon: '🚧',
        build: () => new VRPlaceholderPanel({
            title: 'More Settings',
            message: 'The rest of the settings menu is still flatscreen-only - use the pause menu for now.'
        })
    }
]

export const DEFAULT_VR_MENU_TAB_PANEL_ID = VR_MENU_TABS[0].panelId
