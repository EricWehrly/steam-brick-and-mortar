/**
 * ControlsPanel - Display controls/help information in pause menu
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import { renderTemplate } from '../../../utils/TemplateEngine'
import controlsPanelTemplate from '../templates/controls-panel.html?raw'
import '../../../styles/pause-menu/controls-panel.css'

export class ControlsPanel extends PauseMenuPanel {
    readonly id = 'controls'
    readonly title = 'Input'
    readonly icon = '⌨️'

    constructor(config: PauseMenuPanelConfig = {}) {
        super(config)
    }

    render(): string {
        return renderTemplate(controlsPanelTemplate, {})
    }

    attachEvents(): void {
        // No interactive elements currently.
    }

    onShow(): void {
        // No-op
    }

    onHide(): void {
        // No-op
    }

    dispose(): void {
        super.dispose()
    }
}
