# Plan: Desktop Tauri Spike

**Parent feature**: [Native Desktop App](../features/desktop-app.md)
**Status**: In Progress — scaffold builds and runs; flatscreen parity next; VR entry gated on an experiment

## Goal

De-risk the "should we become a desktop program?" question from the parent feature doc
by building the thinnest possible Tauri v2 shell around the existing client, self-contained
in `desktop/tauri-app/` (alongside `desktop/source-extract/`, the unrelated asset pipeline).

This plan owns the **vehicle decision** (Tauri vs. alternatives) and the **VR-entry
feasibility question**. It does not own the native-capability build-out (filesystem/HID/
process-spawn) — that's parent-feature scope, sequenced after this spike proves the vehicle.

## The Two Requirement Pillars

Any candidate vehicle has to satisfy **both**, or it's out:

**Pillar 1 — WebXR `immersive-vr`.** The store is a VR experience first. The vehicle
must be able to enter a real headset session. *(Note: WebXR isn't wired into the
current Three.js scene yet either — see "Spike Sequencing" below. This pillar is about
the vehicle's *capability* to support it when we do wire it in, not present functionality.)*

**Pillar 2 — Native host capabilities.** The reason a desktop app is worth building
at all — see the parent feature doc's "What a desktop app unlocks" table (filesystem/
Steam discovery, hardware device enumeration, process spawning for companion tools and
the extraction pipeline).

These pillars are in tension: Pillar 1 wants a real Chromium engine; Pillar 2 wants a
native (Rust/Node/.NET) backend. The whole question is which vehicle gives both without
an unacceptable cost.

---

## ⚠️ Correction to an Earlier Version of This Doc

An earlier draft flatly **rejected Tauri** ("no WebXR, period"). That was **overstated
and under-sourced** — worth recording so the next reader doesn't inherit it:

- The original claim generalized from a [Tauri Oculus Quest discussion](https://github.com/tauri-apps/tauri/discussions/4395),
  which is about the **Android standalone webview** — a genuinely different and
  hopeless case — and wrongly applied it to **Windows WebView2** (an official, signed,
  Microsoft-built Edge/Chromium engine, a different beast).
- The "WebView2 has WebXR disabled" assertion was an LLM summary, **not a primary source.**

The accurate status of WebXR-in-WebView2 is narrower: **default-off, evidence leans
against, but the flag-enabled path is untested** — and that untested path is the entire
remaining spike question.

---

## Pillar 1 Reality: WebXR Across Engines

WebXR `immersive-vr` on the desktop requires an *official* Chromium engine wired to a
working OpenXR runtime (SteamVR set as the active OpenXR runtime). Honest, re-sourced state:

| Engine | WebXR `immersive-vr`? | Evidence |
|---|---|---|
| **System Chrome / Edge** (installed browser) | ✅ Works in 2026 | Proven; a Babylon author ran full VR on a Valve Index in Edge on Windows 11. ([Chrome WebXR 2026](https://techradar.info/how-to-activate-vr-on-chrome-the-complete-2026-webxr-guide/)) |
| **Tauri on Windows = WebView2** | ⚠️ **Unconfirmed / leans NO out-of-box** | A dev built a Tauri `.msi`, installed on Windows, got **"WebXR not available."** ([three.js forum](https://discourse.threejs.org/t/three-js-webxr-tauri/39436)). A Babylon poster says Tauri "just works" but **never confirms an `immersive-vr` session** ([Babylon forum](https://forum.babylonjs.com/t/babylon-js-web-xr-with-electron/49424/4)). Untested lever: WebView2 `additionalBrowserArgs` to enable the Chromium WebXR/OpenXR feature flag. |
| **Tauri on Linux/macOS** (WebKitGTK / WKWebView) | ❌ | No usable WebXR. (Irrelevant if we target Windows.) |
| **Standard Electron** | ❌ | Ships with WebXR compiled out (`checkout_webxr` off); must **recompile Electron linking OpenXR** to get it. ([electron#35011](https://github.com/electron/electron/issues/35011), confirmed by the Babylon poster.) |
| **Custom-rebuilt Electron / CEF** | ⚠️ Maybe | Multi-hour Chromium build, and custom builds historically still failed the sandbox→OpenXR bridge. High maintenance. |

The decisive unknown is the **one cell that says "Unconfirmed":** can WebView2, with the
right browser args, expose `immersive-vr` to SteamVR on Windows? Nobody in the sources
tried the flag path. We resolve it ourselves — cheaply — before committing further (see
"Decisive Experiment").

Direct answer to "can Electron borrow the installed Chrome instead of bundling one?":
**No** — Electron *is* its bundled Chromium, architecturally; there's no supported way
to point it at the system browser. The *goal* behind that question (use the working
installed browser) is real and is what the Node-launcher fallback (below) does.

---

## Options, Scored Against Both Pillars

| Option | Pillar 1 (VR) | Pillar 2 (native) | Verdict |
|---|---|---|---|
| **Tauri (Windows/WebView2)** | ⚠️ gated on experiment | ✅✅ Rust backend: fs, HID, process spawn | **Lead candidate, spike underway** |
| **Node launcher → system browser** | ✅ real browser | 🟡 fs + CLI via Node; device enumeration weak | Fallback if Tauri fails VR |
| **PWA / "Install as app"** | ✅ real browser | ❌ no native access | Out (fails Pillar 2) |
| **Custom Electron/CEF** | ⚠️ rebuild | ✅ Node/native backend | Off the table (cost/risk) |
| **Godot (export to web + desktop)** | ✅ native XR (not WebXR) | ✅ native engine | "Opposite direction" fallback; see below |

Why Tauri leads *if* VR works: it's the only vehicle that natively nails all three
Pillar-2 needs (Rust gives filesystem scanning, HID device enumeration via crates, and
`std::process` / the shell plugin for companion executables — including driving the
existing `source-extract/` pipeline) **and** keeps the existing Three.js/WebXR frontend
intact, **and** produces a small binary (a few MB installer; WebView2 ships with Windows,
nothing Chromium-sized to bundle).

### Pillar 2 detail: what Tauri's Rust side buys us
- **Steam discovery / filesystem**: `std::fs` + Steam library-folder parsing
  (`libraryfolders.vdf`) — trivial natively, impossible in the browser.
- **Device enumeration**: HID/USB crates (`hidapi`, etc.) for real device identity.
- **Companion executables**: spawn processes from Rust (including `source-extract/`'s
  `vpkeditcli` / Blender headless steps); expose to the frontend via Tauri commands
  (typed IPC), which fits this project's event-driven boundary rules.

## The "Opposite Direction" Fallback: Godot

If WebXR-in-webview is a dead end *and* we won't accept a Node-launcher, the inversion
is to use a real engine that exports to **both** web and desktop and has **native XR**
(OpenXR) rather than WebXR. Godot is the preferred candidate.

- **Pro**: native OpenXR (no webview/WebXR fragility), one project → web + Windows +
  more, native filesystem/device/process access.
- **Con**: this is an **engine swap** — Three.js comes out, which is a large migration.
  GDScript is less transferable than our TypeScript; the **.NET/C# Godot path** is the
  more palatable option if we go here (closer to our current TS skills than GDScript).
- **Status**: captured, **not pursued now.** Only revisit if the Tauri spike fails and
  the launcher fallback is also rejected.

---

## Spike Sequencing

We are not gating scaffold work on the headset experiment. Sequence:

1. ✅ **Research** — vehicle decision (this doc)
2. ✅ **Scaffold** — `desktop/tauri-app/` with Tauri v2 structure; builds and runs against
   the Vite dev server (`http://localhost:5173`), already in `allowed_origins`. No CORS
   friction in dev mode.
3. 🔄 **Flatscreen parity** (current step) — confirm the existing scene (mouse/keyboard,
   full UI) runs inside the Tauri window with no regressions vs. the browser build.
   No VR involvement yet.
4. **Headset experiment** — once flatscreen parity holds, attempt `immersive-vr` from
   inside WebView2 against a real headset (see Decisive Experiment below).
5. **Pillar 2 work** (filesystem, HID, companion exe) — after VR is confirmed or a
   decision is made about the launcher fallback. Tracked in the parent feature doc,
   not here.

Note: WebXR hasn't been wired into the current Three.js scene at all yet (no `VRButton`,
no XR session handling) — that's separate, pre-existing work independent of which desktop
vehicle we pick. Headset testing in step 4 will need that wired in regardless.

## Decisive Experiment (Kill-Switch — before Pillar 2 work starts)

One cheap test resolves the vehicle question. Estimated 30–60 min on the Windows + SteamVR
machine, once flatscreen parity (step 3) is done and XR is minimally wired into the scene:

1. Point the Tauri webview at the real `dist/` build (not a bare sample — exercises our
   actual startup/asset/CORS path). If ambiguous, fall back to a trivial three.js
   `VRButton` page to isolate the WebView2-vs-WebXR question from app complexity.
2. With SteamVR set as the **active OpenXR runtime**, check in the webview:
   - `navigator.xr` present?
   - `await navigator.xr.isSessionSupported('immersive-vr')` → `true`?
   - Does a user-gesture `requestSession('immersive-vr')` actually enter the headset?
3. If it fails, retry with WebView2 **`additionalBrowserArgs`** enabling the relevant
   Chromium WebXR/OpenXR feature flag(s) (exact flags TBD during the experiment — do
   not assume; discover them).

**Pass** → Tauri is the vehicle; proceed to Pillar 2 work in the parent feature doc.
**Fail (even with flags)** → Tauri is dead for VR; fall back to the Node launcher, or
escalate the Godot question.

---

## Cross-Cutting: The Hardwired Backend URL

`https://steam-api-dev.wehrly.com` is hardcoded as the default in several client modules
(`main.ts`, `SteamBrickAndMortarApp.ts`, `SteamIntegration.ts`, `SteamApiClient.ts`,
`BatchAppDetailsClient.ts`). CORS allow-list lives in Terraform
(`external-tool/infrastructure/variables.tf` → `allowed_origins`); the Lambda only
reflects an origin that's on the list.

- **Dev mode** (current): webview origin is `http://localhost:5173`, already allow-listed.
  No action needed.
- **Production build** (future): webview origin becomes `http://tauri.localhost`
  — **not** in the allow-list. Two clean fixes when we get there: add that origin to
  `allowed_origins`, **or** route Steam API calls through Rust (Tauri HTTP), which has
  no browser CORS at all and aligns with Pillar 2. The latter is the better long-term move.
- De-hardwiring the URL into a `VITE_API_BASE_URL` build env is a deferred nice-to-have —
  only urgent if the desktop build must target a different backend than web, which it
  currently doesn't.

## Open Questions

1. **CORS approach for production builds** — add `tauri.localhost` origin vs. route
   Steam calls through Rust. Recommend Rust-routed (also exercises Pillar 2).
2. **Companion-executable scope** — driving `source-extract/`'s pipeline from Tauri is
   an obvious fit; not yet scoped as a task.
3. **Device-enumeration scope** — how rich does HID identity need to be for v1?
4. **Godot trigger** — agree explicitly that Godot is only revisited if *both* Tauri and
   the launcher are rejected, so it doesn't derail the spike.

## Related

- [Native Desktop App](../features/desktop-app.md) — parent feature, full capability list
- [`desktop/README.md`](../../desktop/README.md) — top-level desktop/ layout
- [`desktop/tauri-app/README.md`](../../desktop/tauri-app/README.md) — build/run instructions

---
*A1 · P1 · O2*
