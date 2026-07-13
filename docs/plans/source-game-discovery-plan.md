# Source Game Discovery

**Act**: 4 / best-effort late Act 2 (same as [User Prop Folder](../features/user-prop-folder.md),
which this supports) · **Status**: 🟢 Phase 1 built (2026-07-12) — `discover_games.py` written and
verified against a real Portal 2 install. Phase 2 deferred, not started.

## Goal (one line)

Let an agent (human or LLM) on a machine with different Source games installed find and list
those games' models, and carry that information back to the primary dev machine — without either
machine needing the other's games installed.

## Why this exists

`desktop/source-extract/scripts/README.md`'s "Adding a new game" section already documents the
manual process for *one* game: find its VPK, verify it holds `models/`+`materials/` paths, search
it for candidate models. That process doesn't scale to "I'm now at a machine with a different
Steam library and want to know what's usable here" — it assumes you already know which game
you're looking for. Phase 1 automates the "what's here at all" question across every installed
game at once.

## Phase 1 (built): local discover script

`desktop/source-extract/scripts/discover_games.py`:

1. Finds every Steam install on the machine (default candidate roots, same convention as
   `games.json`'s `vpk_windows` list; `--steam-root` for anything nonstandard).
2. Follows `libraryfolders.vdf` from each install to every Steam library folder on the machine
   (not just the one Steam's installed into).
3. Walks each library's `steamapps/common/` for `*_dir.vpk` files, and for each one, checks
   whether it actually contains `models/*.mdl` paths — same verification step the README's
   "Adding a new game" guide has you do by hand for one candidate VPK, run automatically against
   every installed game.
4. Writes one deterministic JSON report (`desktop/source-extract/logs/discover-report.json`,
   gitignored — machine-specific) listing every detected Source 1 game and its full `.mdl` path
   list.

Deliberately stops there — it does not write `games.json` or a manifest. Picking which models
are worth converting is a judgment call (see the README's materials-dir gotcha), not something to
automate blindly.

Verified live: run against this machine's actual Portal 2 install, correctly found the VPK and
listed 2,041 model paths.

**Reused, not reimplemented**: `vpk_file_tree()` / `parse_vpk_tree()` from `vpk.py` — the VPK
tree-listing and parsing logic is unchanged; this script only adds the "which VPKs exist at all"
and "which of those are Source 1 games" layers on top.

## Phase 2 (deferred): desktop app → Lambda → S3

The fuller version of this idea — the desktop app runs `discover_games.py` (or an equivalent)
automatically, ships the result to a new Lambda endpoint, which drops it in S3 for eventual pull
into the primary dev box — is **not started**. Recorded here so the shape is known if/when it's
picked up, not because it's scheduled.

- **Deferral reason**: two separate real dependencies, neither of which this plan should force.
  The desktop app itself is still exploratory and uncommitted (see
  [Native Desktop App](../features/desktop-app.md) — "we have **not** committed to building it").
  A Lambda endpoint that accepts arbitrary uploads from a client needs its own design pass
  (auth/abuse considerations, a new Terraform module) that doesn't belong bundled into a docs/
  tooling task.
- **Dependencies**: the Tauri desktop app decision ([desktop-tauri-spike-plan.md](desktop-tauri-spike-plan.md));
  a new Lambda handler + S3 bucket (or a path within the existing
  `steam-brick-and-mortar-dev-game-cache` bucket) provisioned via Terraform, following this
  project's `terraform validate` → `plan` → `apply` sequence.
- **Context**: [desktop-app.md](../features/desktop-app.md)'s "Steam path discovery
  (`libraryfolders.vdf`, `appmanifest_*.acf`)" row already names this exact capability as one of
  the things a desktop app unlocks, and its "extraction pipeline is automatable" section already
  establishes that the whole VPK→Blender pipeline is scriptable/headless — Phase 2 is really
  "wire Phase 1's script into that existing automation story," not a new pipeline design.

When this is picked up, the natural incremental step is: desktop app watches for new Steam
library changes → runs the discovery scan → POSTs the report to the Lambda → Lambda writes to
S3 → a script on the primary dev machine (or a scheduled pull) fetches new reports and surfaces
them for review, same "no manual setup step to forget" philosophy the extraction pipeline already
follows (`desktop/source-extract/scripts/README.md`'s prerequisites section).

## Related

- [User Prop Folder](../features/user-prop-folder.md) — the feature this tooling supports
- [Native Desktop App](../features/desktop-app.md) — Phase 2's dependency and the umbrella doc for desktop-native capability
- `desktop/source-extract/scripts/README.md` — "Discovering games on a new machine" + "Adding a new game" + "Posing a character model" sections, the full cold-start trail this plan is part of
- `desktop/source-extract/scripts/discover_games.py` — Phase 1 implementation
- `desktop/source-extract/scripts/vpk.py` — VPK tree-listing/parsing logic this script reuses

---
*— A1 / P1*
