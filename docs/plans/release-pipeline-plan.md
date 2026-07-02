# Release Pipeline

**Parent features**: [Static Hosting](../features/static-hosting.md) · [Native Desktop App](../features/desktop-app.md)
**Act**: 2
**Status**: 🟡 Plan — nomenclature fixed, `release.sh` shape agreed, S3 cache grab confirmed against real infra. Not yet implemented.

## Why this exists (the actual goal)

Not architecture tidiness — **traffic safety toward Steam**. Once we start showing this around in
Act 2, we do not want to blast Valve's servers with requests. Small chance that earns a warning;
nonzero chance it gets us shut down, which ends the project. So the release artifact should carry as
much data as it can *pre-fetched*, so a running instance hits Steam (via our Lambda) as little as
possible. The end state of "self-contained" is **works entirely offline if need be**. See
[Traffic Safety Review](traffic-safety-review.md) for the full risk framing.

## Nomenclature (this is the part that was muddy before)

Three distinct things — keep them separate:

| Term | What it means | Boundary |
|---|---|---|
| **build** | `yarn build` (web → `client/dist/`), `cargo tauri build` (desktop → installer) | Local. **Already fine** — no changes needed. |
| **release** | Assemble a self-contained, shippable artifact: fetch pre-baked data, build web, build desktop, pack it | Local, but produces the thing we hand out |
| **deploy / publish** | Push a release across the machine boundary — into public view (hosting the web build, distributing the installer) | Leaves our machine; "in the public eye" |

The rest of this doc is about **release**. Deploy/publish lives in
[`static-hosting.md`](../features/static-hosting.md).

## `release.sh`

One script produces a self-contained release:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. "Gimme" — grab the whole app-details cache the Lambda has already built in S3.
#    Read-only. No infrastructure change. No Terraform. Just the AWS CLI.
#    Hydrated tier (appdetails + tags) is what the client prefers; base is the fallback.
aws s3 sync s3://steam-brick-and-mortar-dev-game-cache/ client/public/steam-cache/

# 2. Build the web client — dist/ now embeds the baked cache as a static asset.
( cd client && yarn build )

# 3. Wrap dist/ into the desktop installer.
( cd desktop/tauri-app && cargo tauri build )

# 4. Pack a self-contained release.
zip -r release.zip \
  client/dist \
  desktop/tauri-app/target/release/bundle
```

(Sketch — exact staging paths and zip contents are a detail to settle in implementation.)

### The S3 cache grab, concretely
- **Bucket**: `steam-brick-and-mortar-dev-game-cache` (region `us-east-1`), confirmed in
  `external-tool/infrastructure/modules/s3-cache`. Hardcoded in `release.sh` is fine — we run a
  single `dev` environment for now and friends get served from it. A dedicated `prod` environment
  (and the bucket-name parameterization that implies) is explicitly an Act 3 concern, not something
  to build ahead of need.
- **Layout**: one gzipped-JSON object per appid under two prefixes —
  `appDetailsWithTags/{appid}.json.gz` (hydrated: appdetails + SteamSpy tags, preferred) and
  `appdetails/{appid}.json.gz` (base, fallback). See `lambda-src/services/cache.js`.
- **We grab everything.** No appid list, no "top-N", no curation. `aws s3 sync` pulls the lot.
- **Cost/maintenance**: read-only CLI, no deployed-infra change, no meaningful code maintenance on
  the acquisition side. This is deliberately the dumbest possible mechanism.

### How damaging is this? (the one thing to measure)
The only open risk is **total cache size** shipped into the artifact. Anticipated: a handful of MB.
Before building any optimization (dedup, prune, tier-select, compression tuning), just **measure it**:

```bash
aws s3 ls s3://steam-brick-and-mortar-dev-game-cache/ --recursive --summarize --human-readable | tail -3
```

If it's the expected few MB, ship it whole and move on. Only if it's an undesirable size do we spend
time remediating — and there are obvious levers then (hydrated-tier-only, drop base, etc.). Don't
pre-optimize a problem we don't have yet.

## The one real code touch (be honest about it)

The `aws s3 sync` + pack is maintenance-free, but for the baked cache to actually *reduce runtime
traffic*, the client has to **read it**: `AppDetailsCache` / `GamesLoader` seed from
`/steam-cache/` before falling back to the Lambda batch client. That's a small, contained change —
but it's real, and it's what turns "a folder of JSON in the zip" into "we don't call Steam for games
we already know." Tracked as its own task, not part of the `release.sh` scripting.

## "Self-contained" — now vs. goal

- **Now**: a release still hits the Lambda/Steam at runtime for anything not in the baked cache
  (cache-miss appids, ownership if using the online path). It just does so *far less*.
- **Goal**: "self-contained" grows to mean fully offline-capable — the baked cache covers enrichment,
  a manually-imported/captured library covers ownership, CDN artwork is the remaining online pull
  (its own future thread, see Traffic Safety Review).

## Open questions
- Exact `release.zip` contents — desktop installer only, or installer + web `dist/` for publishing?
- Where the baked cache lands in the client tree (`public/steam-cache/`?) and its runtime load path.
- Whether release runs the sync every time or reuses a recent local pull (the sync is cheap; probably every time).
- **Not a question for now**: dev/prod environment split. One `dev` environment serves Act 2 friends-testing fine; revisit only when Act 3 scaling/isolation actually demands it.

## Related
- [Traffic Safety Review](traffic-safety-review.md) — why we're doing this at all
- [Static Hosting](../features/static-hosting.md) — the deploy/publish half
- [Desktop App](../features/desktop-app.md) / [Tauri spike](desktop-tauri-spike-plan.md) — the desktop build wrapped by release
- [Multi-layer Caching](../features/multi-layer-caching.md) — the runtime cache the bake pre-warms

---
*— A1 / P1*
