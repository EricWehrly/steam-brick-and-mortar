/**
 * Front-cover face: reserved rows for screenshots/videos until we have real data for them (see
 * docs/plans/game-box-store-data-research.md). Title, playtime, and rating all live on the store
 * panel instead - deliberately little content here yet.
 */

import { Container } from '@pmndrs/uikit'
import { buildComingSoonRows } from './GameBoxPanelParts'
import { PANEL_PADDING, PANEL_ROOT_PROPERTIES } from './GameBoxPanelStyle'

// Where the reserved rows start down the face - carried over from the canvas layout's 0.27 of
// panel height, which read as "upper third" rather than crowding the top edge.
const CONTENT_TOP_PADDING = 108

export class GameBoxIdentityPanel {
    readonly container: Container

    constructor() {
        this.container = new Container({
            ...PANEL_ROOT_PROPERTIES,
            paddingLeft: PANEL_PADDING,
            paddingRight: PANEL_PADDING,
            paddingTop: CONTENT_TOP_PADDING
        })
        this.container.add(buildComingSoonRows(['Screenshots', 'Videos']))
    }
}
