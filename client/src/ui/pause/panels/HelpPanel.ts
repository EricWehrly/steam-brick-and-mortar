/**
 * HelpPanel - Display controls and help information in pause menu
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import { renderTemplate } from '../../../utils/TemplateEngine'
import helpPanelTemplate from '../templates/help-panel.html?raw'
import '../../../styles/pause-menu/help-panel.css'

export class HelpPanel extends PauseMenuPanel {
    readonly id = 'help'
    readonly title = 'Help & Controls'
    readonly icon = '❓'

    constructor(config: PauseMenuPanelConfig = {}) {
        super(config)
    }

    render(): string {
        return renderTemplate(helpPanelTemplate, {})
    }

    attachEvents(): void {
        // No interactive elements in this basic help panel
    }

    onShow(): void {
        // Panel shown - no special actions needed
    }

    onHide(): void {
        // Panel hidden - no special actions needed
    }

    dispose(): void {
        super.dispose()
    }
}
