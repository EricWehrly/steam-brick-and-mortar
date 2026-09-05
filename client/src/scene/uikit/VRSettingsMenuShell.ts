/**
 * VR settings menu tab shell - owns the tab row + content-swap area for the VR uikit settings
 * panel. Long-lived like VRSettingsPanelCoordinator itself: constructed once (in the coordinator's
 * constructor, not per-activation) and subscribes to UIEventTypes.MenuPanelChanged immediately, so
 * it doesn't miss the DOM menu's initial panel choice - PauseMenuManager.open() emits that before
 * the MenuOpen event this shell's container gets attached in response to even exists yet. Only the
 * container's visibility/anchor is toggled per open/close (see VRSettingsPanelCoordinator); the
 * shell instance and its subscription persist for the app's lifetime, the same pattern
 * VRSettingsPanelCoordinator itself already uses for MenuOpen/MenuClose.
 *
 * Tabs render as a row across the top (flexWrap: 'wrap' if there are ever too many to fit one
 * line), content below - matching the DOM pause menu's own #pause-menu-tabs layout (see
 * PauseMenuManager.ts). A left-side vertical tab column was tried first and reverted per direct
 * request (2026-08-20): "I want the menu to return to its tabs-on-top navigation, at least for
 * now."
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
import { COLOR_TOKENS } from '../../ui/ColorTokens'

// Bumped from 0.0008 - direct request (2026-08-20): a flatscreen screenshot comparison against the
// DOM menu showed the VR panel reading much smaller/denser despite occupying a similar screen
// width, because every uikit-px (text, gaps, padding, controls) scales off this one factor. This is
// the single lever for "the whole panel is too small," not a per-row font tweak. Exported so every
// standalone uikit root (VRCategoryReferencePanel today) shares one real value instead of each
// re-declaring its own copy of the same magic number.
export const SHELL_PIXEL_SIZE = 0.0011
const PANEL_WIDTH = 820
// Fixed rather than autosized to whichever tab happens to be shortest - per direct request ("the
// settings menu can be taller ... start with the tallest page, and work towards the most
// complicated"), every tab gets this much room up front, with contentArea's overflow:'scroll'
// below absorbing anything taller still. This is the content area's own scroll budget, separate
// from the tab row's height above it.
const CONTENT_HEIGHT = 640
const SHELL_GAP = 12
const TAB_ROW_PADDING = 12
const TAB_BUTTON_GAP = 8
const TAB_LABEL_FONT_SIZE = 13
const TAB_INACTIVE_COLOR = COLOR_TOKENS.textSecondary
const TAB_ACTIVE_COLOR = COLOR_TOKENS.textPrimary
const TAB_ACTIVE_BACKGROUND = COLOR_TOKENS.surface3
const TAB_INACTIVE_BACKGROUND = 'transparent'

/** Exported so other VR uikit surfaces (e.g. VRControllerPointer's cursor/beam) can render above
 *  this menu's own geometry without guessing a number that happens to be higher. */
export const ALWAYS_ON_TOP_RENDER_ORDER = 1000

interface TabButtonHandle {
    readonly button: Button
    readonly label: Text
}

export class VRSettingsMenuShell {
    readonly container: Container

    private readonly tabRow: Container
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
        this.tabRow = built.tabRow
        this.contentArea = built.contentArea

        this.eventManager.registerEventHandler<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, this.handleMenuPanelChanged)

        this.showTab(this.activePanelId, { emit: false })
    }

    private build(): { container: Container; tabRow: Container; contentArea: Container } {
        const container = new Container({
            flexDirection: 'column',
            gap: SHELL_GAP,
            width: PANEL_WIDTH,
            pixelSize: SHELL_PIXEL_SIZE,
            depthTest: false,
            renderOrder: ALWAYS_ON_TOP_RENDER_ORDER,
            backgroundColor: COLOR_TOKENS.surface1,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12
        })

        const tabRow = new Container({
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: TAB_BUTTON_GAP,
            width: '100%',
            padding: TAB_ROW_PADDING
        })
        for (const tab of VR_MENU_TABS) {
            const handle = this.buildTabButton(tab)
            this.tabButtons.set(tab.panelId, handle)
            tabRow.add(handle.button)
        }
        container.add(tabRow)

        // overflow:'scroll' - CONTENT_HEIGHT is a fixed budget, not a guarantee every tab fits
        // within it; a future tall tab (see the "tallest page" direction above) scrolls instead
        // of overflowing the panel's rounded frame.
        const contentArea = new Container({ flexDirection: 'column', width: '100%', height: CONTENT_HEIGHT, overflow: 'scroll' })
        container.add(contentArea)

        return { container, tabRow, contentArea }
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
