# Artwork Resolution Flow

Traces how a game box picks its artwork URL, and why the desktop local-scan flow (not web) was
regressing artwork. See `docs/bugs.md` for the two fixes this reflects (2026-07-14): preserving
existing artwork on a local-scan rewrite, and making the baked-cache seed a guaranteed
predecessor rather than a race.

```mermaid
flowchart TD
    subgraph WRITE["Writing AppDetailsCache (desktop only - web never runs LocalSteamDataWriter)"]
        SEED["BakedCacheLoader.seedIfNeeded()\n(SteamApiClient constructor, app bootstrap)\nreal header/capsule/capsule_v5 URLs from the release bundle"]
        LS["LocalSteamDataWriter.writeLocalAppMetadata()\n(every local-scan load, gated on GameEventTypes.Start)"]
        SEED -->|"awaited via SteamApiClient.waitForAppDetailsCacheSeed()\n(fixed 2026-07-14 - was a race, seed could lose)"| LS
        LS -->|"artwork: existing.artwork ?? NO_LOCAL_ARTWORK\n(fixed 2026-07-14 - previously always NO_LOCAL_ARTWORK,\nsilently wiping the seed on every relaunch)"| CACHE[(AppDetailsCache)]
        SEED --> CACHE
        GAP["Network gap-fill\n(only for appids fully MISSING from cache)"] -->|"artwork: real header/capsule/capsule_v5 URLs\nfrom Store API — Store API has no 'library' field at all,\nsee external-tool/infrastructure/lambda-src/services/steam-api.js"| CACHE
    end

    subgraph BUILD["Building the renderable game (every channel)"]
        CACHE --> ENRICH["GamesLoader.buildEnhancedGame()"]
        GUESS["deriveArtworkFromAppId(appid)\nALWAYS computed, every game, every channel\n(Steam's CDN convention path, not an API field)"] --> ENRICH
        ENRICH -->|"artwork.library = ALWAYS the constructed URL\n(library_600x900.jpg by convention — nothing upstream to source a real one from)"| GAME["SteamGame.artwork"]
        ENRICH -->|"artwork.header = cache.header \|\| cache.capsule_v5 \|\| cache.capsule \|\| constructed header.jpg"| GAME
    end

    subgraph FETCH["Resolving pixels for one game box"]
        GAME --> STRAT["GameArtworkProvider.buildUrlStrategy()\nformat='library': try hints[library, header]\nthen CDN guesses[library, capsule, header]\n(deduped)"]
        STRAT --> U1["cdn.akamai.steamstatic.com/.../library_600x900.jpg"]
        U1 -->|fails| U2["cdn.akamai.steamstatic.com/.../header.jpg\n(real filename now if cache.header survived)"]
        U2 -->|fails| U3["cdn.akamai.steamstatic.com/.../capsule_616x353.jpg"]
        U3 -->|"all candidates exhausted"| FAIL["reason=NETWORK\n(browser reports a real CORS block and a 404\nidentically — see GameArtworkRequest.categorizeError)"]
    end

    subgraph OUTCOME["Placement outcome"]
        FAIL --> LABEL{"Label slot\navailable?"}
        LABEL -->|yes| RENDERLABEL["Renders as a text label box"]
        LABEL -->|no, cap reached| BARE["No label slots remaining —\nbox renders as NOTHING"]
    end

    style U1 fill:#5b2222,color:#fff
    style U3 fill:#5b2222,color:#fff
    style FAIL fill:#5b2222,color:#fff
    style BARE fill:#5b2222,color:#fff
    style RENDERLABEL fill:#2a4d2a,color:#fff
    style CACHE fill:#22395b,color:#fff
```

## Key facts this settles

- **`artwork.library` is never sourced from Steam's Store API** — `AppDetailsData['artwork']`
  (the type both the Lambda and local-scan write into) only has `header`/`capsule`/`capsule_v5`/
  `background`/`background_raw`. `library_600x900.jpg` is a CDN path *convention*, constructed by
  `deriveArtworkFromAppId()` for every game on every channel — real data was never available to
  put there, on desktop or web.
- **The desktop-only symptom was the write side, not the fetch side.** `LocalSteamDataWriter` is
  the only thing that unconditionally overwrites `AppDetailsCache` entries with a placeholder
  artwork object, and it only runs on desktop (`isTauri()` no-ops it on web). Two bugs compounded:
  it always wrote `NO_LOCAL_ARTWORK` even over a real existing entry, and it had no guaranteed
  ordering against the baked-cache seed, so it could win a race and write first. Both fixed
  2026-07-14 - see `docs/bugs.md`.
- **Still open, structural, affects both platforms once triggered**: the CDN fetch itself
  (`cdn.akamai.steamstatic.com`) doesn't reliably send CORS headers to a browser `fetch()`,
  regardless of whether the URL came from a real Store API field or a guess. That's
  `cors-blocked-local-scan-artwork` / Round 3 (Tauri Rust HTTP client) territory, not resolved by
  either fix above.
