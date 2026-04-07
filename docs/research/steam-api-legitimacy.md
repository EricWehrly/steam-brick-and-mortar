# Steam API Legitimacy & Rate Limits Research

> Research conducted April 2026 for Steam Brick and Mortar (WebXR personal game launcher).
> Focus: ToS compliance, rate limits, and practical caching strategy for personal non-commercial use.

---

## Store API (`store.steampowered.com/api/appdetails`)

- **Unofficial / undocumented** — no API key required, IP-based throttling
- **Rate limit**: ~200 requests per 5 minutes (˜1.5s per request). Some reports of 10 req/10s burst cap.
- **Multi-appid**: Largely disabled since November 2014 — treat as one app per request.
- **Implication**: Cannot bulk-fetch a 500+ game library on first run without significant delay. **Local caching is mandatory**, not optional.

## SteamSpy (`steamspy.com/api.php`)

- **Data**: Owners, playtime, CCU, and crucially — **tags** (more granular than Store API genres).
- **Rate limit**: 1 req/sec for most endpoints; 1 req/min for the `all` endpoint.
- **Terms**: Free, as-is, no SLA. Data refreshed every 24h. Subject to change without notice.
- **Recommendation**: Good for genre/tag enrichment in a background pass. Don't depend on it for first-run UX.

## Steam Web API (`api.steampowered.com`)

- **Key endpoints**:
  - `IPlayerService/GetOwnedGames` — game list (AppID, name, playtime). Requires API key.
  - `ISteamUser/GetPlayerSummaries` — user profile data.
- **Rate limit**: 100,000 calls/day per key (generous). Opaque per-minute burst limits exist — rapid parallel requests can trigger 429s.
- **ToS**: Library data only retrievable for the key owner or public profiles. Cannot store other users' data without consent.

## Legitimacy / Legal Assessment

**Personal non-commercial use**: Steam Subscriber Agreement and Web API ToS permit this. No material risk.

**Caching**: Storing `appdetails` in IndexedDB/LocalStorage is standard practice and practically required. ToS technically says delete copies if you cease using the API — for a personal app this is a non-concern.

**Artwork display**: Using capsule art and game names in a private launcher is low-risk. Do not imply official Steam/Valve endorsement.

**Conclusion**: What we're doing — fetching own library, caching app details, displaying in a personal app — is well within the spirit and letter of the ToS. No legal concern.

---

## Best Practices

1. **Staggered fetching**: Fetch `GetOwnedGames` immediately; queue `appdetails` with 1.5–2s delays between requests.
2. **Aggressive caching**: Cache `appdetails` results for 30 days minimum. Game genres/descriptions rarely change.
3. **Exponential backoff**: On 429 — stop all requests, wait 60s minimum before retry, double each subsequent wait.
4. **Direct capsule CDN**: Artwork can be fetched directly without the `appdetails` API:
   ```
   https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/[APPID]/header.jpg
   ```
   This is what we should be doing for visual population. Avoids rate-limiting the metadata API for artwork.

---

## Alternatives

| Source | Pros | Cons |
|---|---|---|
| **IGDB (Twitch/Amazon)** | Robust API, good uptime, high rate limits, quality art | Requires free Twitch dev account; cross-referencing Steam AppIDs needed |
| **RAWG.io** | Good discovery data | Free tier increasingly restrictive |
| **Direct Steam CDN** | Fast, no auth, no rate limit concerns for personal use | Art only — no metadata |

---

## Recommended Architecture for This Project

1. `GetOwnedGames` ? immediate library list (already implemented)
2. **Direct CDN** ? immediate capsule art population (currently using `appdetails` for URLs — should switch)
3. Background worker: `appdetails` one game every ~2s ? cache genres/descriptions
4. SteamSpy tags ? optional enrichment pass after core load (1 req/sec, background only)
5. IGDB ? future fallback for missing/bad metadata (requires Twitch key)

---

*Sources: Steam Web API docs, community rate-limit observations (r/steam, SteamWorks forums), SteamSpy API docs, Steam ToS §5.*