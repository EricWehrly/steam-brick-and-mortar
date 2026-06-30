# Feature: Fabricated Set Dressing (Concessions, Counter & Fixtures)

**Act**: 2 (Best Effort) — targeted for **late Act 2**; original geometry, no external assets
**Status**: Not Started — concept inventory
**Priority**: Medium

## Goal

Hand-built, procedural set dressing — made the same way we build shelves and game boxes — so the
store reads as a real ('90s video-rental) place: a concessions zone, an employee/checkout counter, a
"coming attractions" board, and other in-world fixtures. Everything here is **fabricated by us**, so
it carries **no IP/licensing risk** and ships in the current browser arch.

This is the **fabricate** half of the clutter effort. Its sibling is
[Scene Clutter & Props (harvested)](scene-clutter-and-props.md) — recognizable assets we *source*
(Steam art, CC0, extracted/fan/AI models). Where that doc fights a recognizable-vs-legal tension,
this one has none: we make it, we own it.

## Where this lives in the code

We already have a props system to extend rather than invent:
- `client/src/scene/PropRenderer.ts` — "Atmospheric Props" today (ceiling fixtures, wire racks,
  dividers, floor patterns, entrance mat). The natural home/sibling for new fabricated props.
- `client/src/scene/props/StorePropsCoordinator.ts` — owns the GPU-instanced props lifecycle
  (shelves, boxes, entrance mat); new fixtures slot into the same lifecycle model (singleton
  coordinators + disposable GPU owners).
- `client/src/scene/signs/CanvasSignRenderer.ts` — reuse for board/sign faces.
- Build style mirrors shelves/boxes: parametric geometry + our material generators (wood/MDF/canvas),
  `BlockbusterColors`, no external meshes.

## Prop Inventory (the things to build)

### Concessions zone
- **Candy** — needs several render strategies, cheap → rich: (a) instanced billboard/sprite candy on
  a rack; (b) simple extruded/boxed wrappers (mini game-box treatment) for shelf candy; (c) a few
  hero parametric pieces for close-up. Dispensers: gravity-feed bins, spinner rack, pegboard hooks.
- **Soft drinks** — a **glass-door cooler/fridge** (emissive interior, instanced can/bottle rows),
  plus loose cans as small props.
- **Popcorn** — microwaveable bags (boxed prop), a **popcorn machine** (cart-style glass box with
  kernels), and **buckets** (striped, classic). *(Distinct from `popcorn-ceiling-plan.md`, which is a
  ceiling texture — don't confuse the two.)*

### Employee / checkout counter
- **Central service counter** — waist-height point-of-sale anchor near front-of-store.
  *(Graduates the act4 "Waist-height counter area" one-liner into a real feature.)*
- **90s boxy PCs** — beige CRT monitor + tower + keyboard, parametric; one or two behind the counter.
- Supporting props: register, rental-return slot, phone, **working analog wall clock**
  *(also graduated from act4)*.

### "Coming Attractions" board
A wall/standee board listing what's *next* for the player. **The board is fabricated; its content is
data.** Content feasibility:
- **Wishlist** — feasible now: `IWishlistService/GetWishlist/v1` (public API) or the non-API
  `store.steampowered.com/wishlist/profiles/{steamid}/wishlistdata/` (requires public profile).
  Lambda-side, like our other Steam reads.
- **Discovery queue** / **Play Next** — *not* exposed by the public API; session/library features.
  Likely **desktop-app-only** or omitted. See [Native Desktop App](desktop-app.md).
- Render reuses our sign/canvas renderers for the board face and per-game capsule/hero art for
  entries — overlaps with the harvested doc's Tier-A standee craft; build the face once and share.

### Game peripherals (controller cutouts)
Cardboard-cutout standees of the player's *actual* peripherals (e.g., a Corsair K70, a Glorious
Model O) as personalized clutter. **This is set dressing, deliberately *not* coupled to the
[Input System](input-system.md) work** — "what's plugged in?" is a presentation question, separate
from input handling. Don't conflate the two.

**Detection — what each path gives us** (verified):
- **Game controllers (Gamepad API)**: `navigator.getGamepads()` → an `id` string with a human name +
  vendor/product. Works in **Chrome *and* Firefox**; appears after a button press; no permission prompt.
- **Keyboards / mice / other HID (WebHID)**: `navigator.hid.getDevices()` → `productName` + `vendorId`
  / `productId`. **Chromium-only** (Chrome/Edge/Opera; **Firefox does not support WebHID**), gated
  behind a **one-time user-gesture permission chooser** per device, then silent on later loads. VID/PID
  → make/model via USB-ID lookup — enough to identify a K70 / Model O (not literally a UPC, but close).
- **Full silent enumeration of every device** (no chooser, all peripherals): **desktop-app only** —
  see [Native Desktop App](desktop-app.md).

So a recognizable name for the user's gear is **web-viable in Chromium today** (gamepad free; HID with
one click); only zero-friction all-device enumeration needs desktop. A few lines of `console.log`
settle it — worth a 10-minute spike before designing anything.

**Representation**: once the device is known, the cutout is either a die-cut billboard from an image
search (harvested) or a simple parametric stand-in (fabricated). The cutout *craft* lives here.

## The shared dependency: a placement system

Same note as the harvested doc — sourcing/modeling is the easy part; the real engineering is **where
fixtures go**: named anchor zones (entrance, counter, concessions wall, aisle ends), density,
no-overlap with shelves, per-room/per-layout rules, and liminal-band awareness (fixtures in projected
rows must go cheap-shaded/shadow-off). Design this once; both clutter docs consume it.

## Acceptance Criteria

- A concessions zone (candy rack + drink cooler + popcorn) renders as fabricated geometry, no
  external assets.
- An employee counter with at least one 90s PC anchors the front-of-store.
- A "coming attractions" board renders, populated by wishlist when available, with graceful fallback.
- All fixtures respect the placement-zone rules and the liminal projected/near shading split.
- Nothing here introduces an IP/licensing dependency.

## Stories / Tasks

- **Placement zones** — define fixture anchor zones + no-overlap rules (shared with harvested doc).
- **Concessions** — candy strategies (billboard/boxed/hero), drink cooler (instanced cans), popcorn
  machine + buckets.
- **Counter** — parametric counter + 90s PC; register/clock supporting props.
- **Coming-attractions board** — board geometry + canvas face; wire wishlist content (lambda) + fallback.
- **Peripheral cutouts** — Gamepad/WebHID detection spike; cutout craft; desktop enumeration deferred.
- Tests: fixtures place within zones; projected-row shading flips correctly; wishlist fallback path.

## Notes / Open Questions

- Candy/soda branding: keep **generic** (no real-brand trade dress) to stay IP-clean, or invent
  in-world fictional brands for flavor.
- Instanced vs hero geometry per fixture — perf budget.
- Image-to-3D AI (see harvested doc, Source 6) could **accelerate fabrication** here — generate
  original props from concept art; legally clean because they're our originals.

## Related

- [Scene Clutter & Props (harvested)](scene-clutter-and-props.md) — sibling; the source/harvest half
- [Native Desktop App](desktop-app.md) — gates discovery-queue/play-next content + full peripheral enumeration
- [Input System](input-system.md) — controller/peripheral detection
- [Room Variants](room-variants.md) · [Layout Variations](layout-variations.md) · [Liminal Mode](liminal-mode.md) — placement composition
- [Lighting and Atmosphere](lighting-and-atmosphere.md)
- Code: `PropRenderer.ts`, `props/StorePropsCoordinator.ts`, `signs/CanvasSignRenderer.ts`

---
*— A1 / P1 / O2*
