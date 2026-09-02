/**
 * Render order for uikit surfaces that must draw over ordinary scene content, and for the pointer
 * affordances that in turn must draw over those.
 *
 * Not every uikit surface wants this: the game box's panels sit flush on a real physical face and
 * depth-test normally, so they occlude and are occluded like any other geometry (see
 * GameBoxPanelStyle). It's floating panels - the VR settings menu - that need the override.
 */

export const ALWAYS_ON_TOP_RENDER_ORDER = 1000
