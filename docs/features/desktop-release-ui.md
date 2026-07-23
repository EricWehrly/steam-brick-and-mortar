# Feature: Desktop Release UI

**Act**: 2 (Gate 1)
**Status**: Not Started
**Priority**: Critical — blocks the desktop-first Act 2 reorientation's "share it" moment

## Goal

The anonymous web demo store (already publicly reachable — see [Native Desktop App](desktop-app.md))
is where a stranger lands first. It needs a way to hand that stranger a downloadable Windows
desktop client, using the existing `#steam-ui` panel space (`client/index.html:50-85`,
`client/src/ui/SteamUIPanel.ts`) rather than a new UI surface.

In dev builds, the panel shows every available option (connect via Steam ID/URL, bookmarklet
export, file import, *and* the desktop download) so all paths stay exercisable during development.
In release builds it strips down to just a single "Download Desktop Client (Windows)" button —
the other options are dev/debugging conveniences, not something a first-time visitor to the
anonymous store needs to see.

## Context

`SteamUIPanel` already renders a fixed set of options unconditionally: Steam ID/URL entry +
"Load Games", the bookmarklet install link, and file import (`client/src/ui/SteamUIPanel.ts:52-67`,
`client/index.html:50-85`). None of that is currently gated on build mode — everything shows to
everyone, always.

The dev/release split can key off `import.meta.env.DEV` (Vite's own build-mode flag), which the
codebase already uses for this exact kind of gating — see `AppSettings.ts:450` and its dev-only
defaults (`enableStickers: !isDev`, `maxGames: isDev ? 20 : 9999`, etc.). No new toggle mechanism
needed.

**Blocking dependency**: there is nothing to link to yet. `scripts/release.sh`'s `build_desktop`
(`cargo tauri build`) and `pack_release` (pack `release.zip`) steps are still stubbed
(`scripts/release.sh` — see the `Later steps - not yet implemented` block). This feature can be
fully built (UI, dev/release gating, tests) against a placeholder/fixture URL, but the actual
download won't serve a real artifact until the release pipeline's Steps 3–5 land — see
[Native Desktop App](desktop-app.md) and [Release Pipeline](../plans/release-pipeline-plan.md).
Sequence: pipeline steps first (or at least a manually-built one-off `release.zip` to point at),
UI second.

Also unresolved: where the built zip is actually hosted/served from once it exists (S3 bucket?
GitHub Releases? something else?) — not yet decided, needed before the download link can point
anywhere real.

## Acceptance Criteria

- Dev build (`import.meta.env.DEV === true`): `#steam-ui` panel shows all existing options
  (Steam ID/URL connect, bookmarklet export, file import) *plus* a desktop download option —
  nothing is hidden
- Release build (`import.meta.env.DEV === false`): `#steam-ui` panel shows **only** the
  "Download Desktop Client (Windows)" button; the other options are hidden or stripped
  (whichever's cheaper to implement and maintain — no strong preference either way)
- The download button links to wherever the packaged `release.zip` (or installer) ends up hosted
- No regression to existing dev-mode flows (Steam ID connect, bookmarklet, file import) — they
  keep working exactly as today when `DEV` is true

## Stories / Tasks

- **Decide artifact hosting** — where does the built `release.zip`/installer live once
  `pack_release` produces it? (S3, GitHub Releases, something else) — needed before the download
  button has a real target
- **Finish the release pipeline** — `scripts/release.sh`'s `build_desktop`/`pack_release` steps;
  tracked as Act 2 Gate 1's own item, this feature is blocked on it (or at minimum a manual
  one-off build to point the button at during development)
- **Gate `SteamUIPanel`'s existing options on `import.meta.env.DEV`** — wrap the Steam ID/URL
  input, bookmarklet link, and file-import link so they only render in dev builds
- **Add the desktop download option** — new button/link in the panel template
  (`client/index.html`) and wiring in `SteamUIPanel.ts`, visible in both dev and release builds
- **Tests** — unit coverage asserting the panel's rendered option set differs correctly between
  `DEV`/non-`DEV`, and that the download link's `href` resolves to the configured artifact location

## Notes / Open Questions

- "Hide or strip, whichever's easiest" (from the original ask) — hiding (CSS/conditional render)
  is almost certainly less code than a separate release-mode template; lean that way unless it
  turns out release-mode markup needs to diverge more than expected
- Platform scope is Windows-only for now (`cargo tauri build` target) — no stated plan for
  macOS/Linux artifacts; revisit if that changes
- This doc intentionally does not resolve the artifact-hosting question — surfaced above as a
  blocking open item, not decided here

## Related

- [Native Desktop App](desktop-app.md) — the release vehicle this UI distributes
- [Release Pipeline](../plans/release-pipeline-plan.md) — the build/pack steps this depends on
- `client/src/ui/SteamUIPanel.ts`, `client/index.html` (`#steam-ui`)
- `client/src/core/AppSettings.ts` — existing `import.meta.env.DEV` gating precedent
