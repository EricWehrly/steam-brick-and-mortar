# Feature: Game Detail Screen

**Act**: 2 (Best Effort — design pass tied to VR implementation)
**Status**: Stable — uikit-panel rewrite merged to `act2/default` 2026-09-05 via
[PR #162](https://github.com/EricWehrly/steam-brick-and-mortar/pull/162)/[#161](https://github.com/EricWehrly/steam-brick-and-mortar/pull/161)
(`yarn tsc` clean, full suite green); meant as the reference implementation for the VR
settings-menu migration and the new in-world-UI thread (see [VR Support](vr-support.md)'s Notes).
Still pending manual/real-headset verification.
**Priority**: Medium

## Goal

Replace the diagnostic flat detail panel with a real, VR-native interaction: selecting a game box
summons a standalone 3D box that unfolds into a multi-face spread, in both flatscreen and VR. See
[`docs/plans/game-box-open-interaction-plan.md`](../plans/game-box-open-interaction-plan.md) for
the full design.

## Context

The game detail panel (`BinderGameDetailPanel`) exists and works as a flat DOM/CSS overlay:
clicking a game box opens a panel showing game info, artwork, and categories. It was built as a
development tool — useful for verifying data was flowing correctly, not designed for end users.

Real-headset testing (2026-08-10) confirmed the gap this doc anticipated: the panel doesn't render
in VR at all (see `docs/bugs.md`'s "Game detail overlay doesn't render in the VR view") — DOM
overlays have no representation in a WebXR session's headset-only render surface. Rather than
adapting the existing flat panel for VR, the decided direction (2026-08-10) is to replace the
interaction entirely: the box comes off the shelf into the player's hand (VR) or in front of the
camera (flatscreen) and opens like a physical PC game box, unfolding left/right side panels into a
3-face spread (extensible to 4 later). This becomes the interaction for both VR and flatscreen —
the old flat panel stays in the codebase gated behind a const until the new mechanism is
functionally equivalent, per this project's rule for architectural swaps.

This keeps the "do the design work once with VR in mind" intent this doc originally stated, just
resolved concretely: not a redesigned 2D panel with a VR adaptation, but one 3D interaction that is
its own VR adaptation by construction.

## Acceptance Criteria

Carried forward from the original (pre-fold-open) criteria list below, not dropped — the mechanism
changed, the underlying requirements didn't. Items still genuinely unmet are marked **(open)**.

- Selecting a game box (any input device, VR or flatscreen) summons a 3D box near the player's
  hand/view and opens it into a multi-face spread — no flat DOM overlay involved (met — this is
  the mechanism itself)
- Artwork is prominently featured on at least one face (reuses the shelf instance's already-loaded
  texture, no refetch) — **(open)**: currently refetches through `GameArtworkProvider` rather than
  reusing a texture handle already resolved for the shelf instance; functionally fine (same
  pipeline, same caches) but not literally "no refetch" yet, see the plan doc's §3
- Game metadata is legible and organized (name, genre, playtime, tags when available) — met, and
  grown well beyond the original scope (2026-08-12): front cover = name, rating, playtime, tags,
  Steam categories, and the user's own Steam collections; center = header art (as a disc), Play
  zone (reserved, not yet clickable), description, metacritic; second flap = raw debug JSON. See
  the plan doc's addenda for the full per-panel breakdown.
- Panel is usable in VR — appropriate sizing, controller-friendly interaction targets (met for
  sizing/attachment; dismiss-by-controller is still the "next pass" closing-gesture follow-up, see
  the plan doc)
- Panel is usable on desktop — keyboard accessible, mouse-friendly, appropriate z-layering —
  **(open)**: mouse selection works; a keyboard-only dismiss/close gesture does not yet exist (also
  a "next pass" item in the plan doc); z-layering is moot for this mechanism (scene geometry, not
  DOM), see Notes below
- Works identically in VR (hand-attached) and on desktop (camera-attached) — one implementation,
  not two (met)
- The old `BinderGameDetailPanel` flow stays available behind a const gate
  (`USE_FOLD_OPEN_GAME_BOX_INTERACTION`) until the new mechanism is functionally equivalent (met)
- Launch/action affordance is clear (what does "play"/clicking launch do in a WebXR context?) —
  met: clicking the store panel's Play button raycasts against the held box and navigates to
  `steam://run/<appid>` (`GameBoxFoldCoordinator.handleBoxClick()`); untested inside the Tauri
  desktop webview specifically (no shell plugin installed), see the plan doc's addendum

## Stories / Tasks

See [`docs/plans/game-box-open-interaction-plan.md`](../plans/game-box-open-interaction-plan.md)
for the full task breakdown. Summary:

- `GameBoxFoldModel` — hinged box geometry (center + two wing panels), animated via
  `THREE.AnimationMixer`
- `GameBoxFoldCoordinator` — selection handling, hand/camera anchoring, summon/open/close animation
- Const gate + bootstrap wiring to swap the old panel out
- **Face content design (2026-08-12, `feature/game-box-detail-content`)**: front cover = name +
  Steam rating (`RatingFormat.formatRating()`, shared with `BinderGameDetailPanel`); second flap =
  total/recent playtime + genre/community tags (`GameBoxFoldCoordinator.buildTags()`). Metacritic
  and the old panel's raw JSON/App ID/Spotlight-button sections were judged debug-only or not yet
  available and left out — see the plan doc's addendum for the full extraction rationale.
- **Data richness**: SteamSpy tags now wired in (`getTopSteamSpyTags`, same source `GroupResolver`
  uses for tag-mode grouping); Metacritic score now wired in too. Screenshots/videos/DLC/
  achievements gap researched in
  [`game-box-store-data-research.md`](../plans/game-box-store-data-research.md) — DLC and
  achievements are feasible from local Steam client files (this feature's established desktop-Rust
  pattern); screenshots/videos realistically require the Store API.
- **Interaction (2026-08-12)**: the held box's own faces are now raycast-hittable - clicking Play
  launches the game, scrolling over the debug panel scrolls the JSON. See the plan doc's addendum.

## Notes / Open Questions

- **Panel substrate: uikit, not canvas (decided 2026-09-02, supersedes the note below)**: the three
  faces are moving from hand-drawn canvas textures to `@pmndrs/uikit` panels parented to the
  existing hinge groups, so they still hinge open. Same reason the 2026-08-13 note rejected CSS3D —
  it has to render in an immersive session — but uikit does render there, which canvas-vs-CSS3D
  wasn't the real choice between. This also converges the box onto the one UI system the VR settings
  menu already uses. See [`in-scene-ui-substrate.md`](../architecture/in-scene-ui-substrate.md) for
  the decision, uikit's limits, and the narrow canvas escape hatch (the store panel's circular
  header-art disc is the one surviving canvas instance).
- **Canvas-drawn faces vs. real HTML/CSS projection (resolved 2026-08-13, superseded above)**: spiked projecting the
  app's real settings menu via `THREE.CSS3DRenderer` to see if it could give hover/mouseover
  feedback for free - see
  [`css3d-panel-projection-spike.md`](../plans/css3d-panel-projection-spike.md). Confirmed (by
  reading the renderer's own source, not assumed) that CSS3D content never reaches
  `XRWebGLLayer` and so is invisible in an actual WebXR session, same root cause as the original
  flat panel this feature replaced - staying with canvas-drawn faces + raycast-based hover
  simulation (not yet built) for this box. CSS3D remains a good fit for genuinely flatscreen-only
  UI (the settings menu itself), just not this one.
- The `GameSelected` event → detail-interaction flow already exists (`SceneClickGameBoxRaycast`
  emits it); the fold-open plan reuses this unchanged, only swapping what listens on the other end
- Steam review scores + Metacritic are noted as desired data (from Apr 6-7 session dossier) —
  still a candidate for face content
- z-index layering tech debt (old panel at 2000 above binder at 1500) is moot for the new mechanism
  (scene geometry, not DOM) — becomes irrelevant once the old panel is fully retired
- `GameLibraryBinderUI`'s in-binder browse-and-preview click path (clicking a slot while the 2D
  binder is open) is explicitly untouched by the fold-open plan — that's a separate desktop-only
  workflow, not shelf/VR selection
- Related plan: `docs/plans/feature-priority-spec.md` — Steam category priority system (co-op/VR/controller shown first; trading cards/cloud hidden); candidate consumer for face content once tag display exists
- Related feature: `docs/features/user-screenshot-wall.md` — early Act 2 screenshot lane could feed this interaction's media richness pass
- Related feature: [VR Support](vr-support.md) — this feature's VR half; see also
  [VR Spatial Settings Menu](../plans/vr-spatial-settings-menu-plan.md), parallel VR UX work from
  the same 2026-08-10 session
- Related feature: [uikit Component System](uikit-component-system.md) — the panels here are built
  fully imperatively (magic numbers scattered across `GameBoxFoldDimensions.ts`/
  `GameBoxPanelStyle.ts`/`GameBoxPanelParts.ts`, no real content/layout/style separation); tracked
  as its own feature rather than fixed in place here, now building opportunistically alongside the
  VR settings-menu migration rather than waiting for it to land first
- **Test coverage gap (2026-09-05)**: `GameBoxFoldCoordinator.test.ts`, `GameBoxFoldModel.test.ts`,
  `GameBoxPanelParts.test.ts`, `GameBoxDebugPanel.test.ts`, and `GameBoxStorePanel.test.ts` all
  exist, but `GameBoxIdentityPanel.ts` has no direct test yet (only indirect coverage via
  `GameBoxFoldCoordinator`'s own tests). Direct request: since this implementation is meant as the
  stable reference other in-scene UI work compares against, close this gap before it drifts further
  rather than after.
