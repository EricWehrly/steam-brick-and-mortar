# Feature: Game Detail Screen

**Act**: 2 (Best Effort — design pass tied to VR implementation)
**Status**: Partially Implemented (functional but diagnostic; needs design pass)
**Priority**: Medium

## Goal

A proper design pass on the game detail panel — transforming it from a functional-but-diagnostic view into something worth showing to friends, with the VR UX as the design anchor.

## Context

The game detail panel (`BinderGameDetailPanel`) exists and works: clicking a game box opens a panel showing game info, artwork, and categories. It was built as a development tool — useful for verifying data was flowing correctly. It's not designed for end users.

The timing of this work is intentional: VR implementation will require touching all the UI anyway (spatial UI, controller-friendly interaction targets, panel sizing for in-headset readability). Rather than doing two design passes, one desktop pass now and a VR rework later, the plan is to do the design work once with VR in mind — then implement it in both contexts simultaneously.

This makes the game detail screen a branch off the VR work, not a standalone feature.

## Acceptance Criteria

- Game detail panel has a real visual design (not diagnostic/placeholder layout)
- Artwork is prominently featured (header or library image, not just a thumbnail)
- Game metadata is legible and organized (name, genre, playtime, tags when available)
- Panel is usable in VR — appropriate sizing, controller-friendly interaction targets
- Panel is usable on desktop — keyboard accessible, mouse-friendly, appropriate z-layering
- Launch/action affordance is clear (what does clicking "play" do in a WebXR context?)

## Stories / Tasks

- **Design pass**: what does a great game detail screen look like? Reference Steam's own detail page; consider what's available from the API; sketch the layout
- **Desktop implementation**: ship the designed layout on desktop first
- **VR adaptation**: adapt for spatial/in-headset context; coordinate with VR Support feature
- **Data richness**: wire in tags (from SteamSpy pipeline when available), review scores (Metacritic/Steam), screenshots if accessible
- **Action affordance**: define and implement what "launch" means in this context (deep link? URL scheme? Info only?)

## Notes / Open Questions

- Currently the panel shows categories — when SteamSpy tags land, those should appear here too
- Steam review scores + Metacritic are noted as desired data for this panel (from Apr 6-7 session dossier)
- The `GameSelected` event → `BinderGameDetailPanel` flow already exists; the implementation work is the design and data richness, not the wiring
- Directly tied to VR Support: do not fully commit to the desktop layout until the VR design is at least sketched, to avoid doing the work twice
- z-index layering tech debt (panel sits at 2000 above binder at 1500) should be resolved as part of this work
