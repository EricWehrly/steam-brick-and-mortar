# Feature: Scene Clutter & Props — Harvested / Sourced Assets ("Good Clutter")

**Act**: 2 (Best Effort) for Tiers A–B; Act 4 / desktop-gated for Tiers C–D
**Status**: Research — options doc (this pass). Next pass converts to a spike + plan.
**Priority**: Medium

> **This is the _harvest_ half of clutter** — recognizable/ambient assets we *source* from elsewhere
> (Steam art, CC0 libraries, extracted/fan models, AI-generated meshes). Its sibling,
> [Fabricated Set Dressing](fabricated-set-dressing.md), covers props we *build* procedurally
> (concessions, counter, boards). Anything desktop-gated (Tier C/D extraction, peripheral
> enumeration) is detailed in [Native Desktop App](desktop-app.md).

## Goal

Make the store feel **lived-in** by placing non-gamebox objects in the scene. The bar the
user set is specific: not generic crates and barrels, but **objects that evoke the actual games
in the user's library** — recognizable icons, characters, and props — with **Valve IP as the
"at worst" recognizable set**. Generic CC0 ambiance is acceptable as a floor, not the target.

## The Core Tension (read this first)

The single most important research finding is that **no one source gives us all of: recognizable +
legally shippable + true 3D + scalable to any library + buildable in the current browser arch.**
These axes actively trade against each other:

| Axis | Pulls toward… | …away from |
|------|---------------|-----------|
| **Recognizable** | game IP (headcrab, companion cube, a specific game's hero art) | CC0 (which is generic *by definition* — recognizable = someone owns it) |
| **Legally shippable (Act 2 = hosted/shared)** | CC0 + official Steam store art (display use) | bundling extracted game assets or fan IP models |
| **True 3D models** | extraction pipelines, hand-modeling, fan models | 2D/2.5D art (standees, posters) |
| **Scalable to any library** | Steam's per-game art (works for all 800 games) | per-game hand-curation (doesn't scale) |
| **Ships in current arch (no desktop app)** | bundled glTF + Steam CDN art | local-file extraction, SteamCMD, VPK pipelines |

Because of this, the recommendation is **not "pick a source"** — it's **a tiered strategy** where
each tier accepts a different corner of the tradeoff. Tiers A/B ship now; Tiers C/D are the
"recognizable true-3D" dream and are gated on the desktop app + a personal-mode posture.

## Recognizability Tiers (the synthesized recommendation)

| Tier | What | Recognizable? | 3D? | Legal to ship? | Scales? | Needs desktop app? |
|------|------|---------------|-----|----------------|---------|--------------------|
| **A — Steam art as set pieces** | Standees / cardboard cutouts / posters / endcaps / a "now playing" marquee, built from each game's `library_hero` / `library_logo` / capsule art | ✅ (it's the real games) | ❌ 2.5D | ✅ official store art, display use | ✅ every game | ❌ ships now |
| **B — CC0 ambiance props** | A CRT TV, checkout counter, rental rack, potted plant, beanbag, arcade cabinet — generic "video store" dressing | ❌ generic | ✅ | ✅ CC0, no attribution | ✅ fixed set | ❌ ships now |
| **C — Valve-IP props from the user's own install** | Companion cube, headcrab, crowbar, gravity gun — extracted at runtime from a Source game the user owns | ✅ iconic | ✅ | ⚠️ **personal-mode only**, never bundled | n/a (Valve set) | ✅ extraction is offline/native |
| **D — Per-game hand-picked models** | A beloved item for a specific game (Undertale heart, Valheim longboat, Lethal Company cruiser), sourced case-by-case | ✅ | ✅ | ⚠️ per-item license + IP review; mostly personal-mode | ❌ manual | usually local/personal |
| **✗ — General extraction from any installed game** | Auto-pull models from arbitrary Unity/Unreal titles | ✅ | ✅ | ❌ EULA + DRM | ❌ | — **ruled out** (see below) |

**The honest headline:** the only source that is recognizable **and** legal **and** scalable **and**
shippable-now is **Tier A (Steam's own per-game art presented as physical set pieces)**. It is 2.5D,
not true models — but for a video-rental aesthetic, **cardboard standees and posters are
period-accurate**, not a compromise. True recognizable 3D (Tiers C/D) is real and reachable, but it
lives behind the desktop app and a personal-mode (don't-redistribute) posture.

## The Four Sources, Evaluated

### Source 1 — Build our own (the user's "low confidence" option)
- Confirmed low-yield for *characters/props as art*. Our procedural strengths are parametric
  geometry (boxes, shelves, signage), not sculpted recognizable forms.
- **But** it is the right tool for **Tier A composition** (die-cut standee planes, poster frames,
  marquee) and for **simple original props** (a register, a counter, a rope-and-stanchion) where
  "recognizable" isn't the point. Keep it for set-piece *framing*, not for making a headcrab.

### Source 2 — The user's local machine ("can we just use stuff that's installed?")
This is the option the user most wants to believe in, so here is the unvarnished version.

- **Source-engine games (HL2, Portal, TF2, GMod, L4D, CS): VIABLE, with caveats.** The tooling is
  mature: extract the VPK ([VPKEdit]/GCFScape), then **Source 2 Viewer / ValveResourceFormat exports
  Source 2 assets *directly to glTF***; Source 1 `.mdl` goes through **SourceIO** or **Crowbar +
  Blender Source Tools** → Blender → glTF. End state loads through our existing `AssetLoader`
  unchanged. This is the realistic "gmod dream."
  - ⚠️ **The user currently has NO Source-engine game installed** (Teardown is voxel; nothing else is
    Source). The dream isn't applicable to this library *today* — it requires the user to install one.
  - ⚠️ Extraction is an **offline/native step** (VPK parse + Blender), so it **needs the desktop app**
    (or a one-time author-side conversion we never ship — but that would be redistribution; see Legal).
  - ✅ **Automatable, with a proven legal template**: the pipeline is scriptable headless
    (`ValveResourceFormat` CLI for Source 2; Blender-headless + SourceIO for Source 1), and **Garry's
    Mod is the proof the pattern is compliant** — it mounts content from the user's *own* install and
    never redistributes (no game owned → ERROR placeholder). Both detailed in
    [Native Desktop App](desktop-app.md).
- **Non-Source games (Unity, Unreal, everything else): NOT VIABLE as a general path.** Unity packs
  assets in `.assets`/AssetBundles (AssetStudio) and Unreal in `.pak`/`.uasset` (UModel/FModel) —
  extraction is per-engine, fragile, frequently **DRM-blocked**, and **EULA-violating** for most
  titles. There is no automatable, legal, general "read models from any installed game" pipeline.
  **Rule this out** and stop revisiting it.
- **Steam Workshop content** (e.g., `steamcommunity.com/app/250820/workshop/`): downloadable via
  SteamCMD (`+workshop_download_item`), **but** content is in **game-specific formats**, not glTF
  (verified locally: the installed Teardown workshop items are Lua/voxel/XML/PNG, not models), and
  per-item licensing is undefined ("for use in the game"). Low value as a generic prop source.

> **Net:** "use stuff on the machine" = **only Source games**, **only via the desktop app**, **only
> in personal mode**. Everything else on the machine is a dead end for 3D props.

### Source 3 — Steam Web API / Steam CDN
- **No 3D models.** The Steam Web API exposes zero geometry. Do not expect models here.
- **Screenshots:** no clean list endpoint. The remote path (HTML-scrape the community screenshots
  page → `publishedfileid` → `ISteamRemoteStorage/GetPublishedFileDetails`) is already scoped in
  [User Screenshot Wall](user-screenshot-wall.md) — parser-fragile, lambda-side. Local screenshots
  exist on disk (`userdata/<id>/760/remote/<appid>/screenshots/*.jpg`, confirmed present) but see the
  Program Files blocklist caveat under Architecture. **The user has explicitly said screenshots alone
  aren't enough value** — so screenshots are at most a Tier-A *content type* (framed photos on a
  wall), not the headline.
- **★ Steam per-game store art (the sleeper hit, powers Tier A):** the CDN serves, per appid,
  `library_hero`, `library_logo`, vertical capsule (`library_600x900`), `header`, and even animated
  hero `.webm`/`.mp4`. This is **recognizable, official, scalable to every game, and already partly
  resolved by our gamebox pipeline.** It is the backbone of Tier A. Test URLs (verify against the host
  the box pipeline already uses):
  ```
  https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/library_hero.jpg
  https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/logo.png
  https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/library_600x900.jpg
  https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/header.jpg
  # screenshots array: store.steampowered.com/api/appdetails?appids=<appid>
  ```
  (Reference impl for resolving these by appid: `AFCMS/SteamFetch`, `boppreh/steamgrid`.)

### Source 4 — CC0 online
- **Legally cleanest, but generic.** Best libraries: **Poly Pizza** (ex-Google Poly, glTF, no login),
  **Kenney**, **Quaternius**, **Poly Haven** (CC0 models + HDRIs + PBR textures), **Sketchfab CC0
  filter**, **itch.io CC0**, **Smithsonian Open Access**. All deliver glTF/FBX/OBJ; CC0 = no
  attribution.
- **By definition these are not recognizable game IP.** They serve **Tier B ambiance** (the room
  feels like a store) — not the user's stated "recognizable icons" goal. Use them as the floor while
  the recognizable tiers are figured out.
- **Sketchfab fan models** of game characters/items (companion cube, headcrab, crowbar all exist and
  are downloadable) are **recognizable but carry a two-layer license problem** — see Source 5 + Legal.

### Source 5 — Fan-made models (Sketchfab, CGTrader free, DeviantArt)
The user's instinct is right: for iconic/high-profile games, **fan-made models already exist in
quantity.** Sketchfab alone has many downloadable Companion Cubes, headcrabs, crowbars, gravity guns,
and characters from popular games.
- **Discovery is per-game, not generic** — search by game/character, filter to **Downloadable + a
  readable license**, hand-pick. There is no automated "a model for any game in the library" feed.
- **Two-layer license trap** (important): a model's stated CC license covers *the uploader's mesh*,
  **not the underlying game IP**. A "CC0" fan headcrab does **not** grant Valve's rights. So even
  permissively-licensed fan models of recognizable IP are **personal-mode only** for us, never
  bundled/hosted — most useful as **reference** for props we build ourselves.
- **Tier D** fit: a hand-curated, per-game labor of love; doesn't scale; great for a few beloved titles.

### Source 6 — Generative & scanned 3D (image-to-3D AI) — *Act 4*
**Timing: deferred to Act 4** (neat, not near-term). Modern **image/text-to-3D** tools turn a single
reference photo into a textured, game-ready mesh (glTF/glb, PBR):
- **Tripo**, **Rodin Gen-2**, **Meshy**, **TRELLIS**, and **Hunyuan3D** (Tencent — **open-source /
  self-hostable**). 2026 comparisons rate Rodin/Tripo highest for shape, TRELLIS for fidelity; output
  drops into our `AssetLoader` pipeline with little cleanup.
- **Use 1 — recognizable props**: "photo of a Pyro plush → 3D plush." Good enough for background
  clutter. **IP caveat unchanged**: generating recognizable IP still produces IP → personal-mode only.
- **Use 2 — a fabrication accelerator**: generate *original* props (our candy, popcorn machine) from
  concept art — which **is** legally clean and bundleable. This bridges into
  [Fabricated Set Dressing](fabricated-set-dressing.md).
- Real-world photogrammetry **scans** (Sketchfab, Smithsonian Open Access) exist but rarely cover game
  merch, and scanning IP merch still doesn't clear the IP.

### The "vaporware" / abandonware question (e.g., THUG)
Worth correcting directly, because it changes what we can *ship*:
- **Abandonware is not legally free.** Tony Hawk's Underground is all over abandonware sites, but it's
  *unsupported*, not *licensed* — Activision still holds copyright. We **cannot legally package or
  distribute** its models. "Nobody's enforcing it" ≠ "we have a license."
- **The legitimately-shippable set is FOSS / CC-licensed games**, whose assets carry real
  redistribution rights: **FreeDoom** (CC-BY), **SuperTuxKart**, **0 A.D.**, **Xonotic**,
  **Battle for Wesnoth**. The catch: rarely "high-profile/recognizable" outside FOSS circles.
- **Landscape note (corrected)**: the July 2025 change is **Garry's Mod bundling most CS:S + HL2
  Episodic content "with gracious permission from Valve"** — but that permission was granted
  **specifically to Facepunch**, not as a public/general license (and it excludes maps, voice-over,
  music). So it does **not** let *us* bundle those assets. What it *does* prove: Valve will grant
  scoped, non-commercial permission when asked — making "**ask Valve**" a real (if slow) long-term
  path, which is exactly how GMod got there.
- **Net**: recognizable **and** freely-redistributable is an almost-empty set. Recognizable assets stay
  **personal-mode** (from the user's own machine); shippable assets stay **CC0 / FOSS or fabricated**.

## Legal Analysis

| Asset class | Rule | Posture for us |
|-------------|------|----------------|
| **Steam official store art** (hero/logo/capsule/screenshots) | Steam [Graphical Asset Rules]; displaying a game's official art in context is the intended use — we already do it for boxes | ✅ Shippable (Tier A). Lowest risk. |
| **CC0 assets** | No rights reserved, no attribution | ✅ Shippable/bundleable (Tier B). |
| **Valve game assets via extraction** | Valve [Mod Content Usage]: porting assets to other engines is OK for **non-commercial** use, but **distributing assets separately is not** | ⚠️ **Personal-mode only** — extract from the user's own install at runtime; **never bundle or host** the extracted glTF. (Tier C) |
| **Sketchfab fan models of game IP** | Two layers: (1) the uploader's CC license on *their mesh* varies per model; (2) the uploader **cannot** grant the underlying game IP | ⚠️ Personal-mode only; safest as *reference* for our own builds. (Tier D) |
| **Non-Source game extraction** | Per-engine reverse engineering; commonly DRM + EULA violation | ❌ Don't. |
| **Workshop content** | Per-item, usually "for use in the game," undefined for reuse | ❌ Avoid as a prop source. |

**Decided posture (from this pass):** **CC0-only for anything bundled/hosted; IP-bound recognizable
assets live exclusively in an opt-in personal mode** the user populates from their own machine.
Because Act 2 is literally "Ready for **Friends**" (hosted + shared), this split is not optional — a
shared build cannot carry Valve or fan IP.

## Current Architecture vs. Desktop App (the delineation requested)

**What the current browser app can do today — no desktop presence required:**
- **Tier A** standees/posters/marquee from Steam CDN art. `AssetLoader` (glTF) already exists; the box
  pipeline already resolves per-game art. This is almost entirely a **composition + placement**
  problem, not new infrastructure.
- **Tier B** CC0 props: drop bundled/served glTF into the scene via `AssetLoader`. Works now.
- A **"load your own props" personal folder** via the File System Access API (`showDirectoryPicker`) —
  *with a major caveat below*.

**The Program Files blocklist caveat (load-bearing):** Chromium **blocks `Program Files` (and the OS
root / Windows dir) from `showDirectoryPicker()`**. Default Steam installs to
`C:\Program Files (x86)\Steam`, so a browser **cannot** point a directory picker at the default
screenshots or game-asset folders. This also quietly threatens the existing
[Local File Investigation](local-file-investigation.md) plan (same file tree). Workarounds: per-file
`showOpenFilePicker` (softer blocklist, one-file UX), ask the user to copy/relocate a folder outside
Program Files, or — cleanly — **the desktop app.**

**"Decorate from a designated folder" — verdict: web-viable in Chromium today (nice-to-have).** Let the
user point us at *any* folder of glTF/GLB models (e.g. `Documents/store-props`); we load them via
`AssetLoader`. The path question — *interaction every page load, or one-time?* — resolves cleanly:
- **One-time grant, silent thereafter.** Persistent permissions (Chrome 122+) let us store the
  `FileSystemDirectoryHandle` in **IndexedDB** and re-acquire access on startup via
  `requestPermission()` — no per-load picker after the first "allow on every visit."
- Choosing a folder **outside Program Files** sidesteps the directory blocklist entirely, so the
  default-Steam-install problem doesn't apply here.
- **Chromium-only**: Firefox/Safari don't support directory pickers at all (OPFS only) — so the desktop
  app is needed only for Firefox parity / zero-friction, **not** for the core capability.
- Personal-mode (the user supplies the models, so IP is on them). Filed as a **nice-to-have**.

**What only the desktop app (Electron/Tauri) unlocks:**
- **Tier C/D true recognizable 3D**: frictionless full-filesystem read, reliable Steam path discovery
  (`libraryfolders.vdf` / `appmanifest_*.acf`), running the VPK→glTF extraction pipeline, SteamCMD,
  and a persistent local asset cache.
- Launching games (already a standing goal), and local screenshots at scale without the blocklist.

> The desktop-app vector now has its own doc: [Native Desktop App](desktop-app.md) (where the
> extraction pipeline + GMod compliance template live). This feature ships Tiers A/B in the browser;
> Tiers C/D are explicitly written against that desktop app.

## Existing Precedents in Our Codebase
- `client/src/scene/AssetLoader.ts` — already loads glTF with caching, cloning, shadow setup, and
  preloading. **The runtime for props already exists.** Tiers B/C/D are "get a glTF + place it," not
  "build a loader."
- [User Screenshot Wall](user-screenshot-wall.md) — the remote-screenshot path; a Tier-A content type.
- [Local File Investigation](local-file-investigation.md) — already chose File System Access API for
  local Steam files; shares the Program Files blocklist risk and the desktop-app escape hatch.
- [Room Variants](room-variants.md) / [Layout Variations](layout-variations.md) / [Liminal Mode](liminal-mode.md)
  — clutter placement must compose with room geometry, layout, and the liminal near/projected band
  (props in projected rows must go cheap-shaded / shadow-off too).

## Proposed Spikes (cheap, concrete, testable)

1. **Tier A — Library-art standee (current arch, ~hours).** Take one game's `library_hero` +
   `library_logo` (already resolved by the box pipeline; `curl` the CDN URLs above first to confirm
   the host), composite onto a die-cut standee plane with an alpha cutout + a small floor base, and
   place a few at aisle ends / by the entrance. **Validates recognizable identity clutter with zero
   new infra.** Fastest path to "it looks alive."
2. **Tier B — CC0 ambiance prop (current arch, ~hours).** Load 2–3 CC0 glTF props (CRT TV, checkout
   counter, potted plant) from Poly Pizza/Poly Haven via `AssetLoader` into fixed anchors. Validates
   the placement path and visual fit against our lighting.
3. **Tier C — Source→glTF pipeline (desktop/offline, ~an afternoon + one game).** **Yes, I suspect
   this works.** Install **Portal** (the Companion Cube is the single most iconic, simplest, most
   beloved prop; headcrab/crowbar/gravity gun come via HL2). Use **Source 2 Viewer** (or SourceIO)
   to export to glTF; load via `AssetLoader`. Validates the whole extraction→render path and tells us
   how good recognizable 3D can actually look. **Keep output strictly local — never commit/bundle it.**
4. **Placement system (the real engineering, shared by all tiers).** Sourcing is curation; the
   *engineering* is **where clutter goes**: named anchor zones, density, no-overlap with shelves,
   per-room/per-layout rules, and liminal-band awareness. This is the piece worth designing well.

## Recommended Sequencing (for discussion, not locked)

The user wanted to *discuss* this rather than have it dictated. The recommendation:

1. **Tier A first** — it's the only recognizable, legal, scalable, ships-now option, and it directly
   answers "evoke the user's actual library." Standees/posters/marquee from Steam art.
2. **Tier B in parallel** — cheap CC0 ambiance so the room reads as a *store*, not a void with boxes.
3. **Tier C spike when ready to commit to the desktop app** — install Portal, prove the
   Companion-Cube pipeline, decide how far to invest. This is where the "at worst Valve IP" set
   actually becomes the *best* recognizable-3D set (the user can own the source; Valve's policy is
   unusually permissive for local non-commercial porting).
4. **Tier D opportunistically** — a labor-of-love garnish per beloved game; never a dependency.

## Open Questions / Decisions for Next Pass
- **How far to invest in the desktop app for clutter alone?** Tier C/D's entire value is gated on it.
  If the desktop app is happening anyway (the user implied it likely is), Tier C becomes a strong
  recognizable-3D bet; if not, clutter stays Tier A/B.
- **Is Tier A "enough"?** The user said screenshots-alone lacks value; standees-from-art is adjacent
  (2.5D imagery). Worth a gut-check on whether recognizable *2.5D* set pieces satisfy the itch or
  whether only true 3D (Tier C) will.
- **Placement model**: hand-authored anchors vs. procedural scatter vs. per-room curation — design
  before building beyond the spikes.
- **Personal-mode UX**: how the user opts in and points the app at their own assets (and how that
  survives the Program Files blocklist pre-desktop-app).

## Related Docs
- **Siblings**: [Fabricated Set Dressing](fabricated-set-dressing.md) (the *build-it* half) ·
  [Native Desktop App](desktop-app.md) (Tiers C/D + extraction pipeline)
- [User Screenshot Wall](user-screenshot-wall.md) · [Local File Investigation](local-file-investigation.md)
- [Room Variants](room-variants.md) · [Layout Variations](layout-variations.md) · [Liminal Mode](liminal-mode.md)
- [Lighting and Atmosphere](lighting-and-atmosphere.md)
- [Steam API Compliance](steam-api-compliance.md) · [Legal / Privacy Compliance](legal-privacy-compliance.md)
- Act linkage: [Act 2 — Ready for Friends](../acts/act2-ready-for-friends.md) (Tiers A/B);
  [Act 4 — Encore](../acts/act4-encore-someday-maybe.md) (Tiers C/D, via the desktop app)

### External references
- Valve [Mod Content Usage](https://developer.valvesoftware.com/wiki/Mod_Content_Usage) ·
  Steam [Graphical Asset Rules](https://partner.steamgames.com/doc/store/assets/rules)
- Source extraction: [Source 2 Viewer / ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat) ·
  [SourceIO](https://github.com/REDxEYE/SourceIO)
- CC0: [Poly Pizza](https://poly.pizza/) · [Kenney](https://kenney.nl/) ·
  [Quaternius](https://quaternius.com/) · [Poly Haven](https://polyhaven.com/) ·
  [awesome-cc0](https://github.com/madjin/awesome-cc0)
- Fan models: [Sketchfab](https://sketchfab.com/) (filter Downloadable + license) ·
  [Smithsonian Open Access](https://www.si.edu/openaccess) (real-world scans)
- Image-to-3D AI: [Tripo](https://www.tripo3d.ai/) · [Rodin](https://hyper3d.ai/) ·
  [Meshy](https://www.meshy.ai/) · [Hunyuan3D (open-source)](https://github.com/Tencent/Hunyuan3D-2)
- Source CLI: [ValveResourceFormat command-line](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/master/docs/guides/command-line.md)
- Steam art tooling: [SteamFetch](https://github.com/AFCMS/SteamFetch) ·
  [steamgrid](https://github.com/boppreh/steamgrid)

---
*— A1 / P1 / O2*
