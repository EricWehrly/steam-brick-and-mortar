/**
 * The summoned box's physical size, shared by the geometry that builds it (GameBoxFoldModel), the
 * uikit page laid out on its faces (panels/GameBoxPanelStyle), and the coordinator that has to fit
 * the open box in view. One home for these so the panel page size can be *derived* from the real
 * face size instead of two files agreeing by hand.
 */

// Matches LodArtworkOrchestrator's buildDefaultLodConfig() boxWidth/boxHeight/boxDepth, so the
// summoned box doesn't visually mismatch the shelf instance it stands in for.
export const BOX_WIDTH = 0.3
export const BOX_HEIGHT = 0.4
export const BOX_DEPTH = 0.08

/**
 * Fully open, each flap's own center lands exactly BOX_WIDTH out from the box's center (its hinge
 * starts at BOX_WIDTH/2, and the 180-degree swing doubles that offset - see GameBoxFoldModel's
 * buildFlap()). Add the panel's own half-width to reach its outer edge: 1.5 * BOX_WIDTH from
 * center. GameBoxFoldCoordinator sizes its camera-anchor hold distance off this real footprint
 * rather than a guessed constant.
 */
export const OPEN_BOX_HALF_WIDTH = BOX_WIDTH * 1.5
