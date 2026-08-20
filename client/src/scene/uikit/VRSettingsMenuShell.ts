/**
 * VR settings menu tab shell - owns the tab column + content-swap area for the VR uikit settings
 * panel. Long-lived like VRSettingsPanelCoordinator itself: constructed once (in the coordinator's
 * constructor, not per-activation) and subscribes to UIEventTypes.MenuPanelChanged immediately, so
 * it doesn't miss the DOM menu's initial panel choice - PauseMenuManager.open() emits that before
 * the MenuOpen event this shell's container gets attached in response to even exists yet. Only the
 * container's visibility/anchor is toggled per open/close (see VRSettingsPanelCoordinator); the
 * shell instance and its subscription persist for the app's lifetime, the same pattern
 * VRSettingsPanelCoordinator itself already uses for MenuOpen/MenuClose.
 *
 * Syncs "which panel is active" with the DOM pause menu bidirectionally via MenuPanelChanged,
 * without either side calling the other directly - see PauseMenuManager.showPanel() for the DOM
 * half of the same event, and docs/plans/vr-uikit-menu-migration-plan.md's "who owns the active
 * panel" decision.
 */

import { Container, Text } from '@pmndrs/uikit'
import { Button } from '@pmndrs/uikit-default'
import { EventManager } from '../../core/EventManager'
import { AppSettings } from '../../core/AppSettings'
import { UIEventTypes, type MenuPanelChangedEvent } from '../../types/InteractionEvents'
import { VR_MENU_TABS, DEFAULT_VR_MENU_TAB_PANEL_ID, type VRMenuTab, type VRMenuTabContent } from './VRMenuTabRegistry'
import { toUikitSafeText } from './UikitTextSanitizer'

const SHELL_PIXEL_SIZE = 0.0008
const TAB_COLUMN_WIDTH = 170
const CONTENT_WIDTH = 640
// Fixed rather than autosized to whichever tab happens to be shortest - per direct request ("the
// settings menu can be taller ... start with the tallest page, and work towards the most
// complicated"), every tab gets this much room up front, with contentArea's overflow:'scroll'
// below absorbing anything taller still.
const SHELL_HEIGHT = 640
const SHELL_GAP = 12
const TAB_COLUMN_PADDING = 16
const TAB_BUTTON_GAP = 8
const TAB_LABEL_FONT_SIZE = 13
const TAB_INACTIVE_COLOR = '#e8e8ec'
const TAB_ACTIVE_COLOR = '#ffffff'
const TAB_ACTIVE_BACKGROUND = '#33333d'
const TAB_INACTIVE_BACKGROUND = 'transparent'

// Same as the panel-level constant this replaces (VRDisplayAdvancedPanel used to set this on its
// own root before it became one tab's content nested inside this shell) - the panel represents
// active UI and should never be occluded by scene content while open. depthTest/renderOrder are
// both inherited uikit properties, so setting them here on the shell's root covers every tab's
// content too without each one repeating it.
const ALWAYS_ON_TOP_RENDER_ORDER = 1000

interface TabButtonHandle {
    readonly button: Button
    readonly label: Text
}

export class VRSettingsMenuShell {
    readonly container: Container

    private readonly tabColumn: Container
    private readonly contentArea: Container
    private readonly tabButtons = new Map<string, TabButtonHandle>()
    private activePanelId: string
    private activeContent: VRMenuTabContent | null = null

    constructor(
        private readonly eventManager: EventManager,
        private readonly appSettings: AppSettings
    ) {
        this.activePanelId = DEFAULT_VR_MENU_TAB_PANEL_ID

        const built = this.build()
        this.container = built.container
        this.tabColumn = built.tabColumn
        this.contentArea = built.contentArea

        this.eventManager.registerEventHandler<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, this.handleMenuPanelChanged)

        this.showTab(this.activePanelId, { emit: false })
    }

    private build(): { container: Container; tabColumn: Container; contentArea: Container } {
        const container = new Container({
            flexDirection: 'row',
            gap: SHELL_GAP,
            width: TAB_COLUMN_WIDTH + CONTENT_WIDTH + SHELL_GAP,
            height: SHELL_HEIGHT,
            pixelSize: SHELL_PIXEL_SIZE,
            depthTest: false,
            renderOrder: ALWAYS_ON_TOP_RENDER_ORDER,
            backgroundColor: '#1c1c22',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12
        })

        const tabColumn = new Container({
            flexDirection: 'column',
            gap: TAB_BUTTON_GAP,
            width: TAB_COLUMN_WIDTH,
            height: SHELL_HEIGHT,
            padding: TAB_COLUMN_PADDING
        })
        for (const tab of VR_MENU_TABS) {
            const handle = this.buildTabButton(tab)
            this.tabButtons.set(tab.panelId, handle)
            tabColumn.add(handle.button)
        }
        container.add(tabColumn)

        // overflow:'scroll' - SHELL_HEIGHT is a fixed budget, not a guarantee every tab fits
        // within it; a future tall tab (see the "tallest page" direction above) scrolls instead
        // of overflowing the panel's rounded frame.
        const contentArea = new Container({ flexDirection: 'column', width: CONTENT_WIDTH, height: SHELL_HEIGHT, overflow: 'scroll' })
        container.add(contentArea)

        return { container, tabColumn, contentArea }
    }

    private buildTabButton(tab: VRMenuTab): TabButtonHandle {
        const label = new Text({ text: toUikitSafeText(`${tab.icon} ${tab.title}`), fontSize: TAB_LABEL_FONT_SIZE, color: TAB_INACTIVE_COLOR })
        const button = new Button({
            variant: 'ghost',
            backgroundColor: TAB_INACTIVE_BACKGROUND,
            onClick: () => this.selectTab(tab.panelId)
        })
        button.add(label)
        return { button, label }
    }

    /** User-initiated tab selection (a tab button's onClick) - always emits, so the DOM menu
     *  follows along. Public so tests can simulate "the user clicked this tab" without needing to
     *  synthesize a real pointer-events click through uikit's Button. */
    selectTab(panelId: string): void {
        this.showTab(panelId, { emit: true })
    }

    get activeTabPanelId(): string {
        return this.activePanelId
    }

    private readonly handleMenuPanelChanged = (event: CustomEvent<MenuPanelChangedEvent>): void => {
        this.showTab(event.detail.panelId, { emit: false })
    }

    private showTab(panelId: string, options: { readonly emit: boolean }): void {
        const tab = VR_MENU_TABS.find(entry => entry.panelId === panelId)
        if (!tab) {
            // The DOM menu switched to a panel VR doesn't have a tab for yet (Story 5 territory)
            // - leave whatever VR tab is currently shown rather than clearing the content area.
            return
        }
        if (panelId === this.activePanelId && this.activeContent) {
            return
        }

        this.setTabButtonActive(this.activePanelId, false)
        this.activePanelId = panelId
        this.setTabButtonActive(panelId, true)

        this.activeContent?.container.removeFromParent()
        this.activeContent = tab.build(this.appSettings)
        this.contentArea.add(this.activeContent.container)

        if (options.emit) {
            this.eventManager.emit<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, { panelId })
        }
    }

    private setTabButtonActive(panelId: string, active: boolean): void {
        const handle = this.tabButtons.get(panelId)
        if (!handle) {
            return
        }
        handle.button.setProperties({ backgroundColor: active ? TAB_ACTIVE_BACKGROUND : TAB_INACTIVE_BACKGROUND })
        handle.label.setProperties({ color: active ? TAB_ACTIVE_COLOR : TAB_INACTIVE_COLOR })
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuPanelChanged, this.handleMenuPanelChanged)
    }
}
