# Feature: UI Standardization

**Act**: 2 (Intermission)
**Status**: Paused (2026-08-20) — Phase A complete, Phase B partially landed. The CSS-token/
component-class work (`tokens.css`, `UIComponent` hierarchy) is not abandoned and is actively reused
by [VR uikit Menu Migration](../plans/vr-uikit-menu-migration-plan.md)'s `SettingsSchemaDomRenderer`;
what's paused is hand-migrating each remaining DOM panel through this feature's own Phase C rollout,
in favor of panels getting normalized DOM styling *and* a VR tab together via that plan's
dual-renderer schema instead of as two separate passes. See `ui-normalization-plan.md`'s status note
for the full reasoning.
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
- **7.5.1.4** Component standardization — standardize all existing components using CSS tokens and shared utility classes (buttons, panels, inputs)
- **7.5.1.5** VR-ready architecture planning — document transition strategy from 2D overlay to 3D spatial UI

## Notes / Open Questions

- This overlaps with the intermission's third goal. Get the token system and component audit done in the intermission; deeper VR-ready architecture can extend into Act 2.
- The dongle switch panel (Feature 8.5.1) is blocked on this landing first.
- Active implementation order is tracked in `docs/plans/ui-normalization-plan.md` and should be treated as the execution source of truth for this feature.
- Related plan: `docs/plans/ui-design-tokens.md` — CSS custom property token spec (palette, spacing, typography).
- Related plan: `docs/plans/ui-normalization-audit.md` — inventory of hardcoded values and inconsistencies across all UI components.
- Related plan: `docs/plans/ui-normalization-plan.md` — phased migration plan (audit → base components → panel migration → tag components).
