/**
 * Const gate for the fold-open game-box interaction (see
 * docs/plans/game-box-open-interaction-plan.md). When true, GameBoxFoldCoordinator handles
 * shelf-driven GameEventTypes.Selected instead of GameLibraryBinderUI's flat detail overlay - see
 * GameLibraryBinderUI's own GameEventTypes.Selected registration (registered as a default handler,
 * capability-based handler selection via EventManager). Flip to false to revert to the old flat
 * overlay while the new mechanism isn't yet functionally equivalent.
 */
export const USE_FOLD_OPEN_GAME_BOX_INTERACTION = true
