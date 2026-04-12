# Phase 1 — Remaining Work

> **This is the slim "what's actually left" reference.**
> Full implementation history lives in `docs/roadmaps/phase1-ready-for-me.md`.

---

## Must-Have for Demo

### Feature 6.1 — Shelf Visual Polish *(visible, but skippable)*
- MDF veneer / improved shelf materials
- Brand-consistent blue accent applied to shelf components
- **Status:** Not started. Current gray shelf is functional; this is a polish gap.

---

## Nice-to-Have (demo works without these)

### Feature 5.5 — Load from Cache UI
- "Load from Cache" button in Steam Account panel
- Lightweight game-list cache for instant availability checks
- **Status:** Infrastructure is solid (IndexedDB, `SimpleCacheManager`). UI trigger not wired.

### Feature 6.3 — Lighting Settings *(stretch goal)*
- Tiered lighting quality selector (basic/standard/high)
- **Status:** Basic lighting functional for personal demo. Full settings deferred.

---

## Not Blocking Phase 1

The following are tracked but not required before the personal demo:

- End-cap sign layout polish (tracked in `docs/roadmaps/bugs.md`)
- Disconnected settings checkboxes (tracked in tech-debt)
- Advanced categorization / user Steam categories (Phase 2)
