# Open Subagent Threads

Tracks queued subagent work. Remove threads when complete — completed work lives in git history and roadmap docs.

---

## Active Threads

*(none currently running)*

---

## Queued / Ready to Start

### Thread: UI Normalization — Phase B components
**Status**: In progress (UIButton + UICheckbox done)
**Model**: gemini-3-flash
**Mode**: one-shot subagent, one component per run
**Work**: Design tokens live in `client/src/ui/tokens.css`. Base components done: UIButton, UICheckbox.
**Next**: UIPanel.ts + ui-panel.css (standard container with header + body)
**Ref**: `docs/plans/ui-normalization-plan.md` Phase B
**Notes**: One component per subagent run — not multi-file sweeps

---

### Thread: Popcorn Ceiling Texture Improvement
**Status**: Queued — start when visual design cycles open
**Model preference (design pass)**: gemini-pro → opus → sonnet
**Constraint**: Output = implementation-ready plan for gemini-flash execution. Minimal iteration — design power up front, cheap model for implementation.
**Goal**: Improve popcorn ceiling procedural texture to read convincingly in-scene at VR scale.
- Focus on denser/higher-res tiling pattern (drop ceiling tiles are ~1ft × 1ft — tight, repeating, obvious seams)
- Popcorn doesn't have clean seams so must rely on noise density and bump quality
- Leads into stucco wall variant later (parking stucco for now — wall shelves take priority)

**Deliverable**: `docs/plans/popcorn-ceiling-plan.md` — specific canvas/noise algorithm changes a flash subagent can implement without design ambiguity

---

### Thread: getInstance Singleton Refactor
**Status**: Queued — defer until fresh branch
**Work**: Apply `#current` getter singleton pattern to other classes beyond MeshPrewarmer.
**Notes**: DataManager changes are significant — own branch. Other singletons can be lighter touches.

---
