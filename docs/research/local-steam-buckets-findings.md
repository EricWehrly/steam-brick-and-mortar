# Local Steam Bucket Findings (Single-Machine Probe)

## Scope

This note captures what was found from the first local Steam filesystem probe, based on:

- `docs/research/local-steam-coverage-local-steam-spitemonger.log`
- `docs/research/local-steam-coverage-local-steam-spitemonger.json`
- `docs/research/local-steam-coverage-local-steam-spitemonger.md`

Machine-specific identifiers are intentionally redacted in this document.

## Buckets Discovered

1. `steamapps/appmanifest_*.acf`
- Presence: Found and readable
- Signal: 107 appids
- Baseline overlap: 79
- Confidence: High for installed/local-library footprint

2. `steamapps/libraryfolders.vdf` app sections
- Presence: Found and readable
- Signal: 106 appids
- Baseline overlap: 78
- Confidence: High for installed/library-folder metadata

3. `userdata/<redacted>/config/localconfig.vdf` and `userdata/<redacted>/*/remote/sharedconfig.vdf`
- Presence: Found and readable
- Signal: 1814 appids (raw quoted appid references)
- Baseline overlap: 575
- Confidence: Medium-low (high volume, likely mixed semantics)

4. `userdata/<redacted>/config/cloudstorage/cloud-storage-namespace-1.json`
- Presence: Found and readable
- Signal: 715 appids from `user-collections.*` payloads
- Baseline overlap: 648
- Confidence: High for collection-membership metadata

## Merged Coverage Snapshot

- Baseline appids: 836
- Merged local-signal appids: 2060
- Overlap with baseline: 773
- Baseline missing from local signals: 63
- Coverage of baseline by merged local signals: 92.46%

Interpretation:
- Local signals are broad but noisy when merged naively.
- `cloud-storage-namespace-1.json` appears to be the strongest high-volume source for useful user-curated metadata.
- `localconfig.vdf` / `sharedconfig.vdf` are high-volume but require normalization and confidence gating before product use.

## Product Implications

1. Collections path is validated
- The cloud storage JSON bucket is populated and useful.
- It should remain additive metadata, not authority data.

2. Install-footprint buckets are useful but narrow
- Manifest/libraryfolders buckets are accurate for installed data, not full ownership.

3. Config buckets need quality filtering
- Config appids include many IDs that are outside the baseline and may represent historical/system/misc references.
- Treat these as exploratory signals until parser and confidence rules mature.

## Not In Scope Yet

- Cross-machine variability and consistency analysis
- Final file-system API UX/path strategy across browsers and OSes
- Production-grade local VDF parsing fidelity

## Recommended Next Step (Current Priority)

Deep-inspect high-volume buckets (cloud + config) and assemble per-app local signal blocks for API comparison.
This is now supported by:

- `scripts/extract-local-steam-app-signal-samples.sh`
- Output JSON: `docs/research/local-steam-app-signal-samples-local-steam-spitemonger.json`
- Output Markdown: `docs/research/local-steam-app-signal-samples-local-steam-spitemonger.md`
