# Feature: UI Standardization

**Act**: 2 (Intermission)
**Status**: Not Started
**Priority**: High

## Goal

Establish a consistent UI design language across all panels and components, with a VR-ready architecture ready for the eventual 3D spatial UI transition.

## Context

The UI has grown organically and lacks a unified design token system. Inconsistent sizing, color usage, and component structure will become a bigger problem when adapting for VR. The intermission is the right time to establish the baseline — before Act 2 adds more UI surface area. This includes both visual standardization and the groundwork for 3D spatial UI.

## Acceptance Criteria

- Consistent color scheme, typography, and spacing across all UI components
- Reusable component library (buttons, inputs, panels follow shared spec)
- Steam profile input refined — reduced default width, expand-on-focus behavior
- 2D signage converted to 3D cube elements (no more backface culling on signs)
- In-scene omnibar/search interface (appears when games are loaded)
- VR-ready architecture plan documented — how components adapt to 3D spatial layout
- All components follow consistent design language

## Stories / Tasks

- **7.5.1.1** In-scene omnibar — 3D box element with hourglass icon, game search by name/appid, spotlight highlighting of results
- **7.5.1.2** Steam profile input refinement — width, expand-on-interaction, consistent styling
- **7.5.1.3** Convert 2D signage planes to 3D box elements
- **7.5.1.4** Component standardization — establish color/typography/spacing tokens, standardize all existing components
- **7.5.1.5** VR-ready architecture planning — document transition strategy from 2D overlay to 3D spatial UI

## Notes / Open Questions

- This overlaps with the intermission's third goal. Get the token system and component audit done in the intermission; deeper VR-ready architecture can extend into Act 2.
- The dongle switch panel (Feature 8.5.1) is blocked on this landing first.
- Related plan: `docs/plans/ui-design-tokens.md` — CSS custom property token spec (palette, spacing, typography).
- Related plan: `docs/plans/ui-normalization-audit.md` — inventory of hardcoded values and inconsistencies across all UI components.
- Related plan: `docs/plans/ui-normalization-plan.md` — phased migration plan (audit → base components → panel migration → tag components).
