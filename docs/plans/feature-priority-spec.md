# Steam Feature Priority Spec

**Status**: Design intent captured — implementation can follow independently of Phase 1 category work.

---

## The Split: Genres vs. Features

Steam's data has two distinct categorization axes:

| Field | Source | Purpose here |
|---|---|---|
| `genres[]` | `SteamGenre` | **Primary shelf grouping** — drives which section a game lives in |
| `categories[]` | `SteamCategory` | **Secondary filter/display** — shown as tags, used for filtering |

Genres drive layout. Categories are enrichment.

---

## Feature (Category) Priority System

Steam `categories` include things like:
- "Single-player", "Multi-player", "Co-op"
- "Steam Achievements", "Steam Trading Cards", "Steam Workshop"
- "VR Supported", "Full controller support"
- "In-App Purchases", "Online Co-op", etc.

Not all of these are equally interesting to surface. We want a priority system so:
1. High-value features (co-op, VR, controller support) show first
2. Low-value / noise features (trading cards, steam cloud) show later or are hidden
3. Hidden features are excluded from display entirely

### Priority model

```typescript
interface FeaturePriorityEntry {
    /** Steam category id (from SteamCategory.id) */
    categoryId: number
    /** Display priority. Lower = shown first. */
    priority: number
    /**
     * Special value: HIDDEN_PRIORITY means this feature is not shown in UI.
     * Chosen as a high number so sorting naturally buries it,
     * and callers can filter with `priority < HIDDEN_PRIORITY`.
     */
}

const HIDDEN_PRIORITY = 9999
```

### Default priority table (initial implementation)

| Feature | Category ID | Priority |
|---|---|---|
| Multi-player | 1 | 10 |
| Co-op | 9 | 11 |
| Online Co-op | 38 | 12 |
| Full controller support | 28 | 20 |
| Partial controller support | 18 | 21 |
| VR Supported | 401 | 30 |
| Steam Achievements | 22 | 40 |
| Steam Workshop | 30 | 50 |
| In-App Purchases | 35 | 60 |
| Steam Trading Cards | 29 | HIDDEN |
| Steam Cloud | 23 | HIDDEN |
| Stats | 15 | HIDDEN |

These are guesses — the table should be easy to tune once we see real data.

---

## User-facing customization intent

This priority table should eventually be configurable by the user. The initial implementation
**does not** need a UI — a hardcoded default table is sufficient for Phase 1/early Phase 2.

When the UI is built (deferred to mid-Phase 2):
- Settings panel or dedicated "Library preferences" section
- Show/hide individual feature tags
- Reorder feature display priority by drag or number input
- "Reset to defaults" option

---

## Implementation notes

- `CategoryAssigner` (Phase 1 work) handles genre-based grouping — this spec is orthogonal to that
- Feature priority is purely a **display/filter** concern, not a layout concern
- First consumer: `BinderGameDetailPanel` tag display (already shows genres + categories)
- Second consumer: future in-store filter panel

---

## Files to touch when implementing

- New file: `client/src/ui/FeaturePriorityConfig.ts` — the priority table + `HIDDEN_PRIORITY`
- `BinderGameDetailPanel.ts` — sort/filter categories by priority before rendering tags
- Future: Settings UI panel for user customization
