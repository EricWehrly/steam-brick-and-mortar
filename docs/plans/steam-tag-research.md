# Steam Tag Research

**Last updated:** April 2026  
**Purpose:** Determine how to retrieve community ("popular user-defined") tags for games in a user's Steam library, for use in shelf categorization within Steam Brick and Mortar.

---

## 1. The Question

The Steam Store shows "Popular user-defined tags for this product" on each game page (e.g., Dyson Sphere Program shows: `Automation`, `Base Building`, `Space`, `Open World`). We want to retrieve these tags via API to drive shelf organization.

---

## 2. Does the Steam Store API Return Community Tags?

**Short answer: No.**

The Steam Store `appdetails` endpoint (`https://store.steampowered.com/api/appdetails?appids={appid}`) does **not** return community/user-defined tags.

**Confirmed empirically** (April 2026, appid 1366540 — Dyson Sphere Program):

```
Response keys: type, name, steam_appid, required_age, is_free, dlc,
detailed_description, about_the_game, short_description,
supported_languages, header_image, capsule_image, capsule_imagev5,
website, pc_requirements, mac_requirements, linux_requirements,
developers, publishers, price_overview, packages, package_groups,
platforms, categories, genres, screenshots, movies, recommendations,
achievements, release_date, support_info, background, background_raw,
content_descriptors, ratings
```

No `tags` field. The endpoint does return:
- `genres[]` — official Steam genres (e.g., `{id: "28", description: "Simulation"}`)
- `categories[]` — feature flags (e.g., Single-player, Steam Achievements, Controller Support)

These are developer-assigned at submission time and are more stable but less descriptive than community tags.

**Note on previous research:** The `steam-categorization-research.md` doc (Aug 2025) listed "Steam Community Tags" under "Steam Store API (GetAppDetails endpoint)" — this was aspirational/incorrect. The field is not present in actual API responses.

---

## 3. SteamSpy API

**SteamSpy** (steamspy.com) is a third-party stats service that scrapes and aggregates Steam data. Its public API **does** return community tags with vote counts.

### Endpoint

```
GET https://steamspy.com/api.php?request=appdetails&appid={appid}
```

### Tag data returned

Tags are returned as a JSON object with tag name → vote count:

```json
{
  "name": "Dyson Sphere Program",
  "tags": {
    "Automation": 494,
    "Space": 487,
    "Base-Building": 479,
    "Building": 379,
    "Open World": 363,
    "Resource Management": 355,
    "Simulation": 337,
    "Sci-fi": 316,
    "Management": 303,
    "Sandbox": 298,
    "City Builder": 232,
    "Strategy": 220,
    "Singleplayer": 192,
    "Space Sim": 179,
    "3D": 159,
    "Third Person": 143,
    "Early Access": 106,
    "Indie": 89,
    "RTS": 46,
    "Casual": 35
  }
}
```

This matches the "Popular user-defined tags" shown on the Steam store page.

### Additional fields returned by `appdetails`

- `appid`, `name`, `developer`, `publisher`
- `owners` (range estimate), `score_rank`
- `average_forever`, `average_2weeks`, `median_forever`, `median_2weeks` — playtime in minutes
- `ccu` — peak CCU yesterday
- `price`, `initialprice`, `discount`
- `languages`, `genre`

### Other useful endpoints

| Endpoint | Description |
|---|---|
| `?request=tag&tag=Automation` | All games with a given tag |
| `?request=genre&genre=Simulation` | All games in a genre |
| `?request=top100in2weeks` | Top 100 by active players |
| `?request=all&page=0` | All games, paginated (1000/page) |

### Rate limits

- **Standard requests** (appdetails, tag, genre, top100*): **1 request per second**
- **`all` request**: **1 request per 60 seconds**
- Data is refreshed once per day — no value in polling more than daily

### Usage / ToS Policy

SteamSpy has **no formal published Terms of Service** for its API. The about page describes it as a free service "designed to be helpful for indie developers, journalists, students and all parties interested in PC gaming." The API page itself lists no restrictions beyond the rate limits above.

**Assessment:** The API is free, undocumented ToS-wise, and has been publicly accessible for years. It is widely used in the developer community. There is no authentication requirement and no API key. The main risk is that it's an unofficial third-party service — it could go down or change without notice.

**Usage recommendation for this project:** SteamSpy is appropriate for personal-use tools and development projects. For a VR library browser running locally against a user's own library, this is a reasonable choice. Cache aggressively (data is stale within 24h anyway).

---

## 4. SteamDB and SteamPeek

### SteamDB (steamdb.info)

SteamDB scrapes and displays detailed Steam data including tags, but **does not offer a public API**. The site explicitly blocks scraping. Not viable.

### SteamPeek (steampeak.com)

SteamPeek is a discovery/recommendation tool. It does not expose a documented public API for per-game tag data. Not viable for programmatic access.

---

## 5. Recommended Approach

For retrieving community tags per game:

**Use SteamSpy `appdetails`.**

```
https://steamspy.com/api.php?request=appdetails&appid={appid}
```

Implementation notes:
- Respect the 1 req/sec rate limit — serialize requests, don't batch/burst
- Cache results with a 24-hour TTL (data only updates daily)
- Tags come pre-sorted by vote count (highest = most agreed-upon)
- Use the top 3–5 tags per game for shelf categorization; the list typically has ~20 entries
- For a user's library of 50–200 games, this is ~50–200 requests spread over time — manageable

For developer-assigned genre/feature data, the Steam Store API (`appdetails`) remains viable for `genres[]` and `categories[]` fields. These can complement community tags.

---

## 6. CSS Styling Reference (Steam Tag Pills)

When rendering tags in the VR UI, the Steam web styling provides a useful baseline:

### Steam's `.app_tag` styles

| Property | Value | Notes |
|---|---|---|
| Element | `<a>` | Tags link to browse pages on Steam |
| Background | `rgba(103, 193, 245, 0.1)` | Faint semi-transparent blue/grey |
| Text color | `#67c1f5` | Steam blue |
| Font size | `11–12px` | Compact |
| Border radius | `2px` | Near-square, industrial feel |
| Padding | `0 7px` | Horizontal only |
| Line height | `19–22px` | Fixed height |
| Hover background | `rgba(103, 193, 245, 0.2)` | Slightly more opaque |
| Hover text | `#ffffff` | White |

### VR adaptations

- **Scale up:** 11px is illegible in VR — target 14–16px equivalent minimum
- **Hover:** In VR (pointer/gaze), make the state change more pronounced (higher opacity jump, possible glow)
- **Interaction:** Instead of linking to Steam browse, use tags for in-app shelf filtering
- **Boldness:** Consider `font-weight: 500` for readability against complex 3D backgrounds
- **Semi-transparency:** Retain the low-alpha background to let the shelf environment show through — maintains the Steam aesthetic
