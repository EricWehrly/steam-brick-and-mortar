# Feature: Friend Stream Projection ("Watch Your Friends Play")

**Act**: 2 (Tier 1 — `getDisplayMedia` proof) / 4 (Tiers 2–4 — presence data, broadcasting, native capture)
**Status**: Feasibility captured — not started
**Priority**: Low now / high-value if hacked

## Goal

Show friends who are *currently playing* as live screens inside the store — a wall of monitors or
"now playing" kiosks projecting friends' gameplay onto in-scene render textures. High-cost,
high-payoff atmosphere: the store feels populated by your actual Steam social graph.

## Feasibility — in tiers (cheap proof → real thing → native hack)

### Tier 1 — Concept proof, browser, ~an afternoon
`navigator.mediaDevices.getDisplayMedia()` lets the **user** pick a window/screen; the resulting
`MediaStream` maps to a `<video>` element and then a Three.js `VideoTexture` on an in-scene monitor.
- **Proves the whole "gameplay video → scene texture" pipeline today** — no native code, no Steam auth.
- Caveats: user re-picks each session (no persistent screen-share); captures only *visible* windows
  (not minimized); it's whatever the user shares, not automatically "the friend."
- **This is the quick hack to try first** — it de-risks the rendering half completely.

### Tier 2 — Friend presence data, browser + lambda
Steam Web API tells us who's playing what: `ISteamUser/GetPlayerSummaries` returns `gameid` /
`gameextrainfo` for friends in-game (friends-list + public profile required); `GetFriendList` for the
graph. Drives *which* in-scene screens light up and how they're labeled — independent of whether we
can show actual video.

### Tier 3 — Real auto-watch via Steam Broadcasting, browser + lambda (fragile)
If a friend is **actively broadcasting** (Steam's built-in "broadcast my game" — off by default; many
never enable it), their stream is web-watchable. Steam Broadcast serves a DASH manifest via
undocumented endpoints (`broadcast/getbroadcastmpd`-style; some now require a `sessionId`), proxied
through our lambda (CORS/auth), played with dash.js → `VideoTexture`.
- Real but fragile: undocumented/changing endpoints, and only works when the friend is broadcasting.
- Prior art: third-party Steam broadcast viewers; `OpenSourceLAN/steam-discover`.

### Tier 4 — Native window capture, desktop app (the "window handle" hack)
Capture the local Steam **"Watch"** window directly via **Windows.Graphics.Capture (WGC)** → texture.
- **Occluded** windows: ✅ WGC captures them even behind other windows (BitBlt can't; WGC + hardware
  accel can).
- **Minimized** windows: ❌ unreliable — a minimized window doesn't render, so you get a stale last
  frame at best. The "even when minimized" wish does not hold.
- **Protected video**: ⚠️ DRM/anti-cheat-protected content returns **black frames**; game video may or
  may not trip this.
- Desktop-only; highest effort and risk. See [Native Desktop App](desktop-app.md).

## Recommended posture

- If we touch this soon at all, do **Tier 1** as a standalone toy (getDisplayMedia → VideoTexture) to
  prove the visual, plus **Tier 2** for presence. Tiers 3–4 are real projects deferred to Act 4 / the
  desktop vector.
- Treat the whole thing as **opt-in and privacy-sensitive** — projecting a friend's gameplay (even a
  public broadcast) needs a consent/visibility model; route through
  [Legal / Privacy Compliance](legal-privacy-compliance.md).

## YouTube / Twitch direct integration — non-viable

Twitch and YouTube streams are protected HLS/DASH — the player tokens are generated server-side per
session and expire; there's no stable URL we can pipe to a `<video>` element. OAuth "on behalf of" the
user gets us an embed, not a raw stream URL usable as a `VideoTexture`. The practical answer is already
in Tier 1: user opens Twitch/YouTube in a browser tab, shares it via `getDisplayMedia`, we capture it.
No API integration needed, and it's more flexible. Deeper integration is not worth pursuing.

## Open Questions

Q. Is Tier 1's per-session re-pick acceptable for a "toy," or does the friction kill it?
A. Tier 1 sounds excellent and may ultimately wind up being our entire solution.

Being able to give the user a list of friend steam streams they could start watching would be great.
if there's anything similar to our game launching 'steam' shortcut that could be used to have the user initiate a watch stream effectively using steam itself, that'd be pretty fantastic and probably a "home run" for this workflow.

Q. How many simultaneous video textures can we afford before it's a slideshow (perf)?
Comment: This is a good question 

Q. Privacy model: only show friends who are broadcasting/opted-in? Labels vs live video by default?
A. If we are able to run things through steam, we're effectively "hoisting" (or hijacking. hoijacking?) their privacy model. That's fine.

## Related

- [Interactable Scene Objects](interactable-objects.md) — prerequisite; the TV button that opens `getDisplayMedia` needs the generic prop interaction system
- [Native Desktop App](desktop-app.md) — Tier 4 native capture
- [Scene Clutter & Props (harvested)](scene-clutter-and-props.md) · [Fabricated Set Dressing](fabricated-set-dressing.md) — the monitors/kiosks the streams project onto
- [Steam API Compliance](steam-api-compliance.md) · [Legal / Privacy Compliance](legal-privacy-compliance.md)

---
*— A1 / P1 / O2*
