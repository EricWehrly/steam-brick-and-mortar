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
import { AppSettings, type SettingChangedEvent } from '../../core/AppSettings'
import { AppSettingsEventTypes, UIEventTypes, type MenuPanelChangedEvent } from '../../types/InteractionEvents'
import { VR_MENU_SCHEMAS, DEFAULT_VR_MENU_TAB_PANEL_ID, findVRMenuSchema } from './VRMenuTabRegistry'
import { schemaTabTitle, type SettingsPanelSchema } from '../../ui/settings/SettingsSchema'
import { buildSettingsPanel, type SettingsSchemaPanel } from './SettingsSchemaUIKitRenderer'
import { toUikitSafeText } from './UikitTextSanitizer'
import { MENU_CLASS } from './VRMenuStyleSheet'
import { resolveMenuPixelSize } from './VRMenuPixelSize'

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
    private activeContent: SettingsSchemaPanel | null = null

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
        this.eventManager.registerEventHandler<SettingChangedEvent>(AppSettingsEventTypes.Changed, this.handleSettingChanged)

        this.showTab(this.activePanelId, { emit: false })
    }

    private build(): { container: Container; tabRow: Container; contentArea: Container } {
        // pixelSize is the one style value that isn't static (it tracks the user's font-scale
        // setting), so it's set here rather than in the stylesheet. It's an inherited property, so
        // this single assignment scales the whole menu - see handleSettingChanged().
        const container = new Container(
            { pixelSize: resolveMenuPixelSize(this.appSettings) },
            [MENU_CLASS.menuRoot]
        )

        const tabRow = new Container(undefined, [MENU_CLASS.menuTabRow])
        for (const schema of VR_MENU_SCHEMAS) {
            const handle = this.buildTabButton(schema)
            this.tabButtons.set(schema.id, handle)
            tabRow.add(handle.button)
        }
        container.add(tabRow)

        const contentArea = new Container(undefined, [MENU_CLASS.menuContentArea])
        container.add(contentArea)

        return { container, tabRow, contentArea }
    }

    private buildTabButton(schema: SettingsPanelSchema): TabButtonHandle {
        const label = new Text(
            { text: toUikitSafeText(`${schema.icon} ${schemaTabTitle(schema)}`) },
            [MENU_CLASS.menuTabLabel]
        )
        const button = new Button({ variant: 'ghost', onClick: () => this.selectTab(schema.id) }, [MENU_CLASS.menuTabButton])
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
        const schema = findVRMenuSchema(panelId)
        if (!schema) {
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
        this.activeContent = buildSettingsPanel(schema, this.appSettings)
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
        handle.button.classList.replace(
            active ? MENU_CLASS.menuTabButton : MENU_CLASS.menuTabButtonActive,
            active ? MENU_CLASS.menuTabButtonActive : MENU_CLASS.menuTabButton
        )
        handle.label.classList.replace(
            active ? MENU_CLASS.menuTabLabel : MENU_CLASS.menuTabLabelActive,
            active ? MENU_CLASS.menuTabLabelActive : MENU_CLASS.menuTabLabel
        )
    }

    /** UI Font Scale applies to the open menu, not just the next one (review feedback, 2026-09-09:
     *  "we need to be able to do this live"). pixelSize is inherited and uikit's properties are
     *  reactive signals, so reassigning it on the root alone rescales every descendant - no rebuild,
     *  no reopen. This only holds while no descendant sets its own pixelSize; a child that does
     *  outranks the inherited value and would stop scaling. */
    private readonly handleSettingChanged = (event: CustomEvent<SettingChangedEvent>): void => {
        if (event.detail.settingName !== 'uiFontScale') {
            return
        }
        this.container.setProperties({ pixelSize: resolveMenuPixelSize(this.appSettings) })
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuPanelChanged, this.handleMenuPanelChanged)
        this.eventManager.deregisterEventHandler(AppSettingsEventTypes.Changed, this.handleSettingChanged)
    }
}
