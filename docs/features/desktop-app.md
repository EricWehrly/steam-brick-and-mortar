# Feature: Native Desktop App (Exploratory Vector)

**Act**: TBD — under evaluation for **between Act 2 and Act 3** (no longer parked in Act 4)
**Status**: Exploratory — umbrella doc for "should we become a desktop program?" A **Tauri PoC now
builds and runs** (`bb4d1023 "working desktop build!"`): the WebView2 vehicle is proven for
flatscreen parity, but **no Pillar-2 native capability is wired in yet** (the shell is the default
Tauri builder — no filesystem, HID, or process-spawn commands). VR entry remains the open spike
question. Details: [`docs/plans/desktop-tauri-spike-plan.md`](../plans/desktop-tauri-spike-plan.md).
**Priority**: Raised as of 2026-07-14 — desktop-local extraction proved comparatively far cheaper
than the equivalent web path for at least one concrete feature (screenshots, see [Wall Art & Framed
Posters](wall-art-framed-posters.md)), prompting a general sequencing call: **prefer desktop-native
implementations for filling out store content going forward, and reserve new web/browser
infrastructure for features flagged critical**. Not a full priority rewrite of this doc — just the
standing default for new "fill out the store" feature work until revisited.

## Why this doc exists

Several features keep hitting the same wall: the browser sandbox can't reach the local filesystem,
enumerate hardware, run native conversion tools, or launch games. Rather than re-litigate "do we need
a desktop app?" inside each feature, this is the **single umbrella** for that vector and the home for
everything gated on it. We have **not** committed to building it — this doc captures what it would
unlock and what it would cost, so the call can be made once.

> act4's intro already gestures at this: *"What if we were a desktop program ourselves? Can we sample
> other desktop windows? Could we capture/replay with the help of a tray app…?"* This doc is that
> thread, made concrete.

## What a desktop app unlocks (the dependents)

| Capability | Feature it unblocks | Why the browser can't |
|---|---|---|
| Arbitrary local filesystem read | Local screenshots at scale; [Local File Investigation](local-file-investigation.md) (AC4.4) | Chromium blocks `Program Files` from `showDirectoryPicker()`; Steam installs there by default |
| Steam path discovery (`libraryfolders.vdf`, `appmanifest_*.acf`) | Knowing what's installed | No filesystem browse |
| **Steam identity from disk** (`config/loginusers.vdf` → `PersonaName` + `SteamID64`) | Name + steamid with no login/network; groundwork for [Friends](friend-stream-projection.md) later | Same `Program Files` sandbox block; `loginusers.vdf` sits in the Steam root |
| **Source→glTF extraction pipeline** | [Scene Clutter](scene-clutter-and-props.md) Tier C/D (Valve-IP props) | VPK parsing + Blender are native/offline |
| SteamCMD / workshop download | Workshop content | No process spawn |
| Keyboard/mouse detection in Firefox + full silent enumeration | [Fabricated Set Dressing](fabricated-set-dressing.md) controller cutouts | Controllers via Gamepad API work in both browsers; WebHID (keyboards/mice) is **Chromium-only** — Firefox parity for non-controller peripherals requires desktop; *all-devices, no-prompt* is desktop-only regardless |
| Launching installed games | Long-standing goal | No process spawn |
| Discovery queue / Play Next; window sampling; capture/replay tray | Coming-attractions content; act4 musings | Session/OS features not in any web API |

## Library capture without a bookmarklet (improves, not unlocks)

Distinct from the table above — this is a capability the desktop app *improves* rather than
unlocks, since the browser can already do it via the [manual export
bookmarklet](../archive/manual-library-export-feasibility.md). On desktop the user installs nothing:
Tauri opens a second WebView2 window pointed at `steamcommunity.com`; the user logs in (cookies
live in WebView2); we inject the same extraction JS the web bookmarklet uses
(`client/public/bookmarklets/export-library.js` — mines the React Query hydration blob on the
games page; the old `rgGames`/`?xml=1` routes are confirmed dead, see
[`manual-library-export-feasibility.md`](../archive/manual-library-export-feasibility.md)) and
return the result over Tauri IPC. No `javascript:` install friction, no file round-trip, and it
still works for **private** libraries. Net effect: the "bookmarklet" becomes an integrated
**"Connect Steam"** button on desktop. Enrichment then has a native route as well — Rust can fetch
`store.steampowered.com/api/appdetails` with no browser CORS, which is what lets the desktop build
reach near-zero Steam traffic (see [Traffic Safety Review](../plans/traffic-safety-review.md)).

## The extraction pipeline is automatable (key finding)

The "gmod dream" (clutter Tier C) is **scriptable headless**, which is what makes it
desktop-app-friendly rather than a manual GUI chore:
- **Source 2 games** (CS2, HL:Alyx, Deadlock): `ValveResourceFormat` ships a **CLI decompiler** —
  `Source2Viewer-CLI.exe -i model.vmdl_c -o out.glb --gltf_export_format glb`, multi-threaded batch,
  no GUI, clean glTF out.
- **Source 1 games** (HL2, Portal/Portal 2, TF2 — where the companion cube / headcrab / crowbar live):
  older `.mdl` format → **two genuine headless steps**:
  1. **VPKEdit** (`vpkeditcli`, craftablescience/VPKEdit) — real CLI, no GUI wrapper:
     `vpkeditcli extract <pak.vpk> --output ./extracted/ "models/props/..."`
  2. **Blender headless + SourceIO** (REDxEYE/SourceIO, MIT) — `blender --background --python convert.py`;
     ~15-line script: load SourceIO addon → import `.mdl` → export `.glb` → quit.
     Blender itself is GPL and can't be bundled; detect installed path + add install guidance.
     SourceIO is MIT and bundleable; desktop app can copy it into Blender's addon dir on first run.
  - Note: **Portal 2 is Source 1**, so it uses this route — *not* the VRF CLI.
    For a fast pipeline *proof*, a free **Source 2** game (**CS2**) + VRF is the one-liner;
    for the iconic Orange Box props specifically, Portal 2 / TF2 + SourceIO/Blender is required.
  - **TF2 is Source 1 and free-to-play** — Pyro, engineer props, etc. are extractable from a game
    essentially every Steam user owns. Best ownership story for nostalgia Source 1 content in personal mode.
- So a desktop app could convert assets from games the user owns, on the user's machine — **never
  bundling or redistributing** them.

## How Garry's Mod stays compliant (our template)

GMod is the proof that local extraction is legitimate **when done right**:
- It requires the user to **own, install, and have run** the source game; it **mounts** content from
  the user's *own* install and **never redistributes** it. Don't own the game → you get **ERROR**
  placeholder models, not someone else's assets.
- GMod is itself a Valve-licensed Source title; we are not — so we stay strictly to the "from your own
  install, never bundle, non-commercial, personal mode" reading of Valve's
  [Mod Content Usage](https://developer.valvesoftware.com/wiki/Mod_Content_Usage).
- Landscape note (corrected): the July 2025 change is **GMod bundling most CS:S + HL2 Episodic content
  "with gracious permission from Valve"** — a grant **specific to Facepunch**, not a public license
  (excludes maps/VO/music). It doesn't let *us* bundle those assets, but it proves Valve will grant
  scoped non-commercial permission when asked — so "**ask Valve**" is a real long-term path.

## Incremental model load — signal on completion

The current extraction flow is a manual offline batch (`vpkeditcli` → `convert_mdl.py`). When the
desktop app exists, it should stream models into the live scene incrementally rather than requiring a
restart:

1. **Desktop side** — watch a source-games folder; when a game is detected, enqueue its props for
   extraction; run the pipeline per-prop; emit a `PropConverted { path: string }` IPC message when
   each `.glb` lands in the output directory.
2. **Browser/renderer side** — listen for `PropConverted` via whatever IPC channel the desktop
   framework provides (Tauri: `listen('prop-converted', …)`; Electron: `ipcRenderer.on`); call
   `AssetLoader.loadModel(path)` with the received path; place the returned model.

This drives **incremental load** — the scene populates as conversions complete, rather than all-at-once
on startup. It also means the extraction pipeline doesn't block scene use.

**Key design points:**
- One signal per model (not a batch-complete event) — enables progressive rendering
- The path in the signal is the output GLB path; browser code doesn't need to know the source game
- Placement is a separate concern; initial placement can be a simple queue (next open anchor slot)

**Markers in current code:**
- `client/src/scene/PropRenderer.ts` — where received models get placed into the scene
- `docs/features/user-prop-folder.md` — the web-side equivalent (user chooses a folder; same loading
  code path, different signal source)

<!-- TODO: Act 3 / desktop app — implement IPC signal (PropConverted) and wire AssetLoader.loadModel() to it in a new DesktopPropBridge class -->

## Framework options — Tauri spike underway

Full vehicle comparison (Tauri vs. Electron vs. a Node-launcher vs. the Godot fallback),
the WebXR/WebView2 sourcing, and the decisive kill-switch experiment now live in
[`docs/plans/desktop-tauri-spike-plan.md`](../plans/desktop-tauri-spike-plan.md) — this
section is intentionally short so it doesn't drift out of sync with that doc.

Short version: **Tauri** (Rust shell + system webview) is the lead candidate — tiny
binary (WebView2 ships with Windows; nothing Chromium-sized to bundle), reuses our
Vite/Three client almost as-is, native side in Rust for filesystem/HID/process-spawn.
The one open question is whether WebView2 can actually enter `immersive-vr`; that's
what the spike is resolving. Scaffold lives in `desktop/tauri-app/` (alongside
`desktop/source-extract/`).

## Cost / risk

- New build/dist/update pipeline: code signing, per-OS packaging, auto-update.
- Trust: a program with filesystem + process-spawn access is a bigger ask than a web page.
- Product split: web + desktop parity, and which build is canonical.
- VR story changes (WebXR-in-browser vs a desktop build) — needs thought.

## Revisit: Connect Steam Priority, Ownership Signals (Not Yet Scheduled)

Roadmap note, not a plan — captured so it isn't lost, revisit once
[`desktop-local-data-pipeline-plan.md`](../plans/desktop-local-data-pipeline-plan.md) and
[`taxonomy-data-event-plan.md`](../plans/taxonomy-data-event-plan.md) have landed enough to make
these calls with real data instead of guessing.

**Related, found via first two real end-to-end tests**: local-scan's first real run against a
real library surfaced that `applyLibrary()`'s automatic background re-fetch ("Fork A") was firing
for the local-scan channel too, compounding a scene reset on top of an already-slow load — fixed
for that channel this session. A second test then corrected the diagnosis: the *primary* blocking
cause is actually `LocalSteamLibraryLoader` itself awaiting a full network gap-fill before its
first render, unrelated to Fork A — now the top-priority next fix. The broader "refresh should
upgrade, not replace" redesign (applicable to web too) and routing desktop's network calls through
Tauri's Rust HTTP client instead of the browser's `fetch()` remain scheduled after that — see
[`desktop-offline-first-plan.md`](../plans/desktop-offline-first-plan.md). That plan's "sixth
pass" found the actual second-load bug: two independent `GameEventTypes.Start` listeners
(persisted-library render and local-scan render) racing rather than a designed sequence — fixed
for the "nothing changed" case (Tier A), with the full intended startup priority cascade (demo
store → local scan → future remote reconciliation) laid out in
[`desktop-startup-load-ordering-plan.md`](../plans/desktop-startup-load-ordering-plan.md).

**Current reality, confirmed by investigation**: "Connect Steam" (the WebView2 cookie-injection
flow described earlier in this doc) is **fully unbuilt** — no second-window code, no cookie
injection, nothing in `desktop/tauri-app/src`. Desktop today gets library data through the exact
same manual `#steam-ui` panel as web (`client/src/ui/SteamUIPanel.ts`), including its existing
40-second idle "draw attention" pulse (`ATTENTION_IDLE_MS`, `panel-attention-pulse` in
`client/src/ui/components/ui-panel.css`).

**The revisit**: now that local file mining covers identity, playtime, user collections, and
tags entirely offline, that panel's urgency on desktop should soften — it's no longer the only
way to get a personalized experience, just the way to get full ownership completeness (see the
pipeline plan's "hands are tied" gap above). Two concrete ideas, neither designed yet:
- Soften or disable the idle attention-pulse on desktop specifically — ideally gated on "did the
  local scan already establish an identity," not a bare `isTauri()` check, matching the
  capability-based pattern used elsewhere.
- Reword the panel's copy on desktop to frame it as "connect for full library accuracy" rather
  than implying it's required to get anything at all.
- The eventual "Connect Steam" WebView2 flow itself is unchanged in scope by this note — this is
  about how hard the *current* fallback panel pushes, not about building the better flow sooner.

**Achievement data** — `appcache/librarycache/<appid>.json` (per-app achievement cache, see
`desktop-offline-data-mining-findings.md` §5) is a real, already-confirmed local data source not
yet drawn into anything. Proposed shape, following the pattern `user_collections` established
(see `SteamGameMetadata.user_collections` and `LocalSteamDataWriter`): a directly-referenceable
property on the game object (e.g. `achievements_unlocked`/`achievements_total`, or a completion
fraction) written the same way — folded into the same `AppDetailsCache` entry, not a second
writer. Candidate future uses: a completion-% sort/filter dimension (via the taxonomy-event plan
above) and a real achievements display feature.

Also apply the **same "have I seen this appid" expansion check** the collection-appid work
established this session: an appid with an achievement-cache entry but no local playtime/collection
membership is real evidence of ownership and should widen the local-scan candidate set the same
way collection membership now does — `AppDetailsCache.findMissing()` (generic, already built for
this) plus `SteamApiClient.fetchAndCacheAppDetails()` for the network gap-fill, same mechanism,
new source. Not scoped further here — this is a roadmap note, not a plan.

**Eager-but-bounded "owned" heuristic** — the pipeline plan's candidate appid set was originally
just "has a `localconfig.vdf` playtime entry," missing owned-but-never-launched games. **Partially
widened already**: collection membership now expands the candidate set too (this session — see
`LocalSteamLibraryLoader`/`LocalSteamDataWriter`), with unresolvable appids falling back to a
network fetch rather than being dropped. Still open: {installed (`appmanifest_*.acf`), registered
in a library folder (`libraryfolders.vdf`), has an achievement cache entry} — the remaining three
of the original four signals. **Bare presence in `appinfo.vdf` remains explicitly excluded**,
because that file covers every app the Steam client has ever loaded info for (browsing the store,
wishlisting), not ownership. Skipping that exclusion is exactly how free-to-play games the user
merely glanced at would pollute the library view — the concern that prompted this note in the
first place.

**Refund complication (flagged, not resolved)**: achievement-cache presence implying ownership
breaks down for a bought → played → refunded game — Steam doesn't purge the local achievement
cache on refund, so this signal would keep surfacing a game the user no longer owns. Deliberately
not addressed here (too much context to pull into this note); tracked instead as a review item
for the data-integrity audit already planned before showing this around in Act 3 — see the
"post-friends-testing data-integrity audit" note in
[`taxonomy-data-event-plan.md`](../plans/taxonomy-data-event-plan.md)'s genre/category
harvesting section.

## Open Questions

- What's the **trigger** — clutter (Tier C/D), launching games, local collections (AC4.4), or the
  sum? Probably the sum, but which single feature justifies *starting*?
- Tauri vs Electron, given we already ship a Vite/Three client and care about binary size.
- Does desktop replace the hosted web build, or run alongside it?

## Related

- [Scene Clutter & Props (harvested)](scene-clutter-and-props.md) — Tier C/D depend on this
- [Fabricated Set Dressing](fabricated-set-dressing.md) — peripheral enumeration, coming-attractions content
- [Local File Investigation](local-file-investigation.md) — AC4.4 re-entry; same FS-blocklist driver
- [Desktop Local Data Pipeline Plan](../plans/desktop-local-data-pipeline-plan.md) — concrete next step: wiring local Steam file mining into desktop startup, alongside the "Connect Steam" flow above
- [Taxonomy Data Event Plan](../plans/taxonomy-data-event-plan.md) — separates "what games are available" from "what sorts are available," triggered by this doc's local data pipeline work
- [Input System](input-system.md) — in-browser peripheral-detection ceiling
- [Manual Library Export](../archive/manual-library-export-feasibility.md) — the capture channel the desktop app integrates as "Connect Steam"
- [Source Game Discovery](../plans/source-game-discovery-plan.md) — Phase 1 (local script) built; Phase 2 (desktop app → Lambda → S3) deferred pending this doc's own decision
- [Release Pipeline](../plans/release-pipeline-plan.md) — web + desktop release + the S3 cache bake
- [Traffic Safety Review](../plans/traffic-safety-review.md) — reducing request volume to Steam (the real goal)
- Act linkage: [Act 4 — Encore](../acts/act4-encore-someday-maybe.md)

---
*— A1 / P1 / O2*
