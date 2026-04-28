# Steam User-Defined Categories — Feasibility Plan
**Milestone**: 6.5.1.1  
**Status**: 🔴 Local VDF approach confirmed non-viable (modern Steam)  
**Last investigated**: 2026-04-10 — real files inspected on local machine

---

## Summary of findings (2026-04-10)

Steam is installed. User data files exist. **The documented VDF schema is outdated and does not match what modern Steam actually stores.**

User collections (including "Favorites" and "To Play") are **not present in any local file** on this machine. Modern Steam stores collection membership in Steam Cloud, not locally.

Current interpretation update:
- This result closes the VDF path for collections
- It does **not** close local-file investigation overall
- New priority is two-track:
    1. collections via cloud sync JSON
    2. local appid/game-list signal discovery and quality assessment

---

## What we investigated

Steam lets users create custom collections/categories in their library. This data is not available via the public Steam Web API.

The hypothesis was that collection data lives in local VDF files and could be read via File System Access API. **This hypothesis is confirmed false for modern Steam.**

---

## Actual file locations confirmed

Steam install: ✅ `C:\Program Files (x86)\Steam\`  
Steam user ID found: ✅ `24323802`

### `sharedconfig.vdf`
**Path**: `C:\Program Files (x86)\Steam\userdata\24323802\7\remote\sharedconfig.vdf`  
**Status**: ✅ Exists — but **only 49 lines / 1.8 KB**. Contains basic settings only.

**Actual root key**: `UserRoamingConfigStore` *(not `UserLocalConfigStore` as previously documented)*

Actual content sample:
```
"UserRoamingConfigStore"
{
    "Software"
    {
        "valve"
        {
            "Steam"
            {
                "StartMenuShortcutCheck"    "0"
                "DesktopShortcutCheck"      "0"
                "SurveyDate"    "2025-12-29"
                "apps"
                {
                    "3175750"
                    {
                        "cloudenabled"  "1"
                    }
                }
```

**No `tags` key. No collections. No per-game category data.** The old schema (with `tags { "0" "Action" "1" "My Favorites" }`) does not exist in this file.

### `localconfig.vdf`
**Path**: `C:\Program Files (x86)\Steam\userdata\24323802\config\localconfig.vdf`  
**Status**: ✅ Exists — 334 KB, ~8800+ lines

This file contains:
- Per-game play stats (LastPlayed, Playtime) under `Software > Valve > Steam > apps`
- UI state (which collections are collapsed/expanded) under `UIStoreLocalSteamUIState`
- A `"user-collections"` key — **value is `"{}"`** (empty JSON string)

**Dyson Sphere Program (appId 1366540)** appears in localconfig.vdf with:
```
"1366540"
{
    "LastPlayed"    "1744334103"
    "Playtime"      "2643"
    "cloud"
    {
        "last_sync_state"   "synchronized"
    }
    "BadgeData"     "020000000830"
}
```

**No collection membership data.** Despite being tagged as "Favorite" and "To Play" by the user, this is not present in the file.

The `UIStoreLocalSteamUIState` JSON blob references collection IDs:
```json
"mapCollapsedState": [
  ["from-tag-2P", true],
  ["uc-XCeJBl0ffkxD", true],
  ["uc-nup4lUn4cYZA", true],
  ["uc-XWMyFv+VTqD+", true],
  ...
  ["favorite", (implied)]
]
"currentSelection": {"strCollectionId": "favorite", "nAppId": 1366540}
```

These `uc-*` IDs are opaque identifiers. Their names and game memberships are **not stored locally**.

---

## What the old schema looked like (no longer present)

The schema originally documented:
```
"UserLocalConfigStore"
{
    "Software" > "Valve" > "Steam" > "Apps"
    {
        "<appid>" { "tags" { "0" "Action" "1" "My Favorites" } }
    }
}
```

This structure **does not exist** in the VDF files on this machine. Steam's new library UI (introduced ~2019-2021) migrated collection data to Steam Cloud backend. The local `user-collections` key is present but empty.

---

## Web access question (updated)

### Option A — File System Access API
**Now: ❌ Not viable for modern Steam users.** The data isn't in local files.  
Might still work for users on very old Steam installations or if Valve re-populates the field (unlikely).

### Option B — File upload input
**Now: ❌ Same problem.** No local file to upload.

### Option C — Electron / local server
**Now: ❌ Same problem.** Even native file access won't help — the data isn't local.

### Option D — Steam Web API (hypothetical)
Steam's Web API has no endpoint for user collections. This is a known gap.

### Option E — Steam IPC / local Steam client API (new hypothesis)
Steam's client exposes a local WebSocket/IPC interface (used by the overlay and web-based library UI). Collection data is almost certainly fetched through this channel. **Unexplored — potentially viable if documented.**

---

## Investigation tasks (updated status)

### Task 1: VDF parser
**Status**: 🔴 Deprioritized  
A VDF parser would still parse the files correctly, but the collection data isn't there to parse. Not worth building until there's a data source that actually contains it.

### Task 2: Prototype file picker
**Status**: 🔴 Blocked — no data in the file  
Can't prototype extraction of data that doesn't exist in the target file.

### Task 3: Schema validation
**Status**: ✅ Completed (negative result)  
- Collections are NOT stored as tags on each game in modern Steam
- `user-collections` key exists in localconfig.vdf but is always `"{}"`
- Collection IDs appear as opaque strings in UI state only
- The old `tags`-based schema in sharedconfig.vdf is gone

### Task 4: Integration plan
**Status**: 🔄 Needs rethinking — original file-based approach is dead

New direction to investigate:
- Steam's local client API (WebSocket on localhost, used by the web-based library UI)
- Whether Steamworks SDK exposes collection data to overlay/game processes
- Whether Steam's `ISteamClient` or `IClientLibrary` interfaces expose collection data

### Task 5: Local appid discovery
**Status**: 🔄 In progress (new priority)

Questions:
- What appid signals are available from local files (outside collections)?
- Are those signals complete, partial, or highly inconsistent across users?
- Can we expose confidence/coverage in UI if data is partial?

Minimum useful outcome:
- Produce a merged appid set from local sources with source-level provenance and confidence.

---

## What "done" looks like — revised

The original Phase 1 goal (VDF file parsing) is unachievable. New Phase 1 goal:

- [ ] Confirm whether Steam exposes a local IPC/WebSocket API for collection data
- [ ] If yes: document the endpoint/protocol and build a proof of concept
- [ ] If no: accept that user collections are inaccessible and document the decision
- [ ] Update milestone planning accordingly

---

## Notes

- Steam user ID on this machine: `24323802`
- Steam install confirmed at: `C:\Program Files (x86)\Steam\`
- `sharedconfig.vdf` exists but is minimal (settings only, not collections)
- `localconfig.vdf` has rich app data (play stats, cloud state) but not collection membership
- The `user-collections` field in localconfig.vdf being `"{}"` is the smoking gun — Valve knows this used to be here, but it's been evacuated to cloud storage
- "Nice to have" — this doesn't block 6.5. Run in parallel, but lower confidence it's achievable without a fundamentally different approach.
