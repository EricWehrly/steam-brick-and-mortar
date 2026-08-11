# Feature: Game Detail Screen

**Act**: 2 (Best Effort — design pass tied to VR implementation)
**Status**: In Progress — direction decided 2026-08-10, plan doc written, not yet implemented
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

- Selecting a game box (any input device, VR or flatscreen) summons a 3D box near the player's
  hand/view and opens it into a multi-face spread — no flat DOM overlay involved
- Artwork is prominently featured on at least one face (reuses the shelf instance's already-loaded
  texture, no refetch)
- Distinct content per face is legible and organized (exact content design TBD, see the plan doc's
  open questions)
- Works identically in VR (hand-attached) and on desktop (camera-attached) — one implementation,
  not two
- The old `BinderGameDetailPanel` flow stays available behind a const gate
  (`USE_FOLD_OPEN_GAME_BOX_INTERACTION`) until the new mechanism is functionally equivalent
- Launch/action affordance is clear (what does "play" do in this context?) — deferred, see plan doc

## Stories / Tasks

See [`docs/plans/game-box-open-interaction-plan.md`](../plans/game-box-open-interaction-plan.md)
for the full task breakdown. Summary:

- `GameBoxFoldModel` — hinged box geometry (center + two wing panels), `setOpenAmount()`
- `GameBoxFoldCoordinator` — selection handling, hand/camera anchoring, summon/open/close animation
- Const gate + bootstrap wiring to swap the old panel out
- **Face content design**: what actually goes on each of the 3 faces — explicit follow-up once the
  technical mechanism is built and validated
- **Data richness**: tags (SteamSpy pipeline when available), review scores (Metacritic/Steam) —
  still relevant, now as candidate face content rather than panel sections

## Notes / Open Questions

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
