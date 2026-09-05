/**
 * Minimal stand-in VR panel for a DOM pause-menu panel not yet ported to uikit. Lets the VR tab
 * shell (VRSettingsMenuShell) show a complete tab list without pretending every tab has real VR
 * content yet - covers both panels not yet migrated (Story 5 of
 * docs/plans/vr-uikit-menu-migration-plan.md) and panels explicitly out of VR scope for now
 * (CacheManagement/Debug/Controls, per that plan's Non-goals).
 */

import { Container, Text } from '@pmndrs/uikit'
import { COLOR_TOKENS } from '../../../ui/ColorTokens'

const CONTAINER_GAP = 8
const CONTAINER_PADDING = 20
const TITLE_FONT_SIZE = 18
const MESSAGE_FONT_SIZE = 14
const MESSAGE_COLOR = COLOR_TOKENS.textTertiary
const DEFAULT_MESSAGE = 'Not available in VR yet - use the flatscreen menu for this tab.'

export interface VRPlaceholderPanelOptions {
    readonly title: string
    readonly message?: string
}

export class VRPlaceholderPanel {
    readonly container: Container

    constructor(options: VRPlaceholderPanelOptions) {
        this.container = new Container({ flexDirection: 'column', gap: CONTAINER_GAP, padding: CONTAINER_PADDING, width: '100%' })
        this.container.add(new Text({ text: options.title, fontSize: TITLE_FONT_SIZE, color: COLOR_TOKENS.textPrimary }))
        this.container.add(new Text({
            text: options.message ?? DEFAULT_MESSAGE,
            fontSize: MESSAGE_FONT_SIZE,
            color: MESSAGE_COLOR
        }))
    }
}
