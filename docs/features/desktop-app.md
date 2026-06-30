# Feature: Native Desktop App (Exploratory Vector)

**Act**: TBD — under evaluation for **between Act 2 and Act 3** (no longer parked in Act 4)
**Status**: Exploratory — umbrella doc for "should we become a desktop program?" A **Tauri spike is
queued ("soon")** to de-risk the wrapper.
**Priority**: Low now, high *leverage* if pursued

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
| **Source→glTF extraction pipeline** | [Scene Clutter](scene-clutter-and-props.md) Tier C/D (Valve-IP props) | VPK parsing + Blender are native/offline |
| SteamCMD / workshop download | Workshop content | No process spawn |
| Keyboard/mouse detection in Firefox + full silent enumeration | [Fabricated Set Dressing](fabricated-set-dressing.md) controller cutouts | Controllers via Gamepad API work in both browsers; WebHID (keyboards/mice) is **Chromium-only** — Firefox parity for non-controller peripherals requires desktop; *all-devices, no-prompt* is desktop-only regardless |
| Launching installed games | Long-standing goal | No process spawn |
| Discovery queue / Play Next; window sampling; capture/replay tray | Coming-attractions content; act4 musings | Session/OS features not in any web API |

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

## Framework options (not a decision)

- **Tauri** (Rust shell + system webview) — tiny binary, reuses our Vite/Three client almost as-is,
  native side in Rust; best fit for "wrap the existing app + add native capabilities."
- **Electron** — heavier (bundles Chromium), maximal API surface and ecosystem, simplest porting.
- Either keeps the WebXR/Three.js client intact and adds a native capability bridge.

## Cost / risk

- New build/dist/update pipeline: code signing, per-OS packaging, auto-update.
- Trust: a program with filesystem + process-spawn access is a bigger ask than a web page.
- Product split: web + desktop parity, and which build is canonical.
- VR story changes (WebXR-in-browser vs a desktop build) — needs thought.

## Open Questions

- What's the **trigger** — clutter (Tier C/D), launching games, local collections (AC4.4), or the
  sum? Probably the sum, but which single feature justifies *starting*?
- Tauri vs Electron, given we already ship a Vite/Three client and care about binary size.
- Does desktop replace the hosted web build, or run alongside it?

## Related

- [Scene Clutter & Props (harvested)](scene-clutter-and-props.md) — Tier C/D depend on this
- [Fabricated Set Dressing](fabricated-set-dressing.md) — peripheral enumeration, coming-attractions content
- [Local File Investigation](local-file-investigation.md) — AC4.4 re-entry; same FS-blocklist driver
- [Input System](input-system.md) — in-browser peripheral-detection ceiling
- Act linkage: [Act 4 — Encore](../acts/act4-encore-someday-maybe.md)

---
*— A1 / P1 / O2*
