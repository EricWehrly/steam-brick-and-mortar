# Local Files Metadata Overlay - Design Intent

## Why This Exists

We need local-file integration without corrupting remote authority data.

Collections are the only clear high-value feature target right now.
All other local-file work is justified only if it improves confidence in local game-list/appid availability.

## Product Intent

1. Collections are additive metadata labels for games.
2. Remote Steam/Lambda payloads remain canonical for game identity/details.
3. Local data can enrich sorting/filtering and UX, but must carry provenance/confidence.

## Data Model Intent

Use a sidecar overlay model, not in-place mutation of remote game objects.

- Base (authority): remote game data from existing Steam/Lambda pipeline
- Overlay (local): local-only metadata keyed by appid
- Composed view: runtime merge used by sorter/UI

Overlay fields (initial):
- collections: string[]
- localSignals: {
  seenInLocalConfig?: boolean,
  seenInManifests?: boolean,
  seenInCloudCollections?: boolean
}
- provenance: {
  sources: string[],
  importedAt: string,
  parserVersion: string,
  confidence: 'low' | 'medium' | 'high'
}

## Technical Intent

1. Ingestion layer
- Parse local files into normalized overlay records.
- Keep extractors source-specific and isolated.

2. Overlay store
- Persist local overlay separately from authority cache.
- IndexedDB preferred for scale; localStorage only for small fallback payloads.

3. Composition layer
- Merge base + overlay at read-time for sort/filter/render decisions.
- Never overwrite canonical remote fields in storage.

4. UI behavior
- Show what was found and confidence level.
- Avoid implying completeness when data is partial.

## Discovery Intent (AppID Focus)

Question to answer: can local files provide a useful appid set?

Candidate sources:
1. cloud-storage-namespace-1.json (collections; partial by nature)
2. localconfig.vdf (activity/play-state keyed app entries)
3. app manifests/library metadata (installed appids)
4. sharedconfig.vdf (low expected value; still probe)

Per-source output:
- appid count
- parse success/failure
- confidence estimate
- likely completeness class (complete/partial/low)

## Decision Gates

Ship:
- collections import is reliable, and
- appid discovery provides useful coverage with explainable confidence.

Gate behind advanced setting:
- collections are reliable but appid discovery quality varies significantly by environment.

Cut for now:
- user friction plus inconsistent discovery quality outweighs value.

## Immediate Next Actions

1. Keep collections import path, but treat output as overlay metadata.
2. Build extractor registry with probe/parse/normalize workflow.
3. Produce first local appid coverage report from candidate files.
4. Decide ship/gate/cut based on measured quality, not assumptions.
