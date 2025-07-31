# Steam Web API Research - Library Retrieval & Authentication

## Research Objective
Determine the best approach for retrieving a user's Steam game library from a browser-based WebXR application, including authentication strategies and technical implementation options.

## Steam Web API Overview

### API Base URL
- **Production**: `https://api.steampowered.com/`
- **Documentation**: https://steamcommunity.com/dev
- **Developer Portal**: https://steamcommunity.com/dev/apikey

## Game Library Retrieval

### Primary API Endpoint: GetOwnedGames
**Endpoint**: `IPlayerService/GetOwnedGames/v0001/`
**Purpose**: Retrieve list of games owned by a Steam user

**Request Parameters**:
- `key` (string, required): Steam Web API key
- `steamid` (uint64, required): 64-bit Steam ID of user
- `format` (string, optional): Response format (json, xml, vdf) - default: json
- `include_appinfo` (bool, optional): Include game name and logo info - **CRITICAL FOR US**
- `include_played_free_games` (bool, optional): Include free games user has played
- `appids_filter` (string, optional): Comma-separated list of specific app IDs

**Example Request**:
```
https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=XXXXXXXXXXXXXXXXX&steamid=76561197960434622&format=json&include_appinfo=true&include_played_free_games=true
```

**Response Structure**:
```json
{
  "response": {
    "game_count": 123,
    "games": [
      {
        "appid": 440,
        "name": "Team Fortress 2",
        "playtime_forever": 8643,
        "img_icon_url": "e3f595a92552da3d664ad00277fad2107345f743",
        "img_logo_url": "07385eb55b5ba974aebbe74d3c99626bda7920b8",
        "playtime_windows_forever": 8643,
        "playtime_mac_forever": 0,
        "playtime_linux_forever": 0,
        "has_community_visible_stats": true
      }
    ]
  }
}
```

### Key Data Points Available:
- ✅ **App ID**: Unique game identifier
- ✅ **Game Name**: Display name for our 3D boxes
- ✅ **Icon URL**: Small game icon (32x32)
- ✅ **Logo URL**: Game logo image
- ✅ **Playtime**: Total hours played
- ❌ **Box Art**: NOT included - need separate approach

## Game Artwork & Assets

### Steam Store Assets
Game artwork is available via Steam's CDN with predictable URLs:

**Header Images (460x215)**:
```
https://cdn.akamai.steamstatic.com/steam/apps/{APPID}/header.jpg
```

**Capsule Images (231x87)**:
```
https://cdn.akamai.steamstatic.com/steam/apps/{APPID}/capsule_231x231.jpg
```

**Library Assets (600x900) - PERFECT FOR GAME BOXES**:
```
https://cdn.akamai.steamstatic.com/steam/apps/{APPID}/library_600x900.jpg
```

**Icons (32x32)**:
```
https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/{APPID}/{ICON_HASH}.jpg
```

### 🎯 **Optimal Strategy for Game Boxes**:
Use `library_600x900.jpg` images - these are the tall, narrow images perfect for game case spines!

## Authentication Challenges

### Steam Web API Key Requirements
- **Acquisition**: Must register at https://steamcommunity.com/dev/apikey
- **Domain Restriction**: API keys can be restricted to specific domains
- **Rate Limiting**: 100,000 requests per day per key
- **Public Exposure Risk**: Cannot safely expose API key in client-side code

### Steam ID Discovery
**Problem**: How does a user provide their Steam ID?

**Options**:
1. **Manual Entry**: User enters their 64-bit Steam ID
2. **Steam Profile URL**: Parse from profile URLs like `steamcommunity.com/profiles/76561197960434622`
3. **Custom URL**: Handle vanity URLs like `steamcommunity.com/id/gabelogannewell`
4. **Steam OpenID**: Full OAuth-like authentication flow

### Vanity URL Resolution
**Endpoint**: `ISteamUser/ResolveVanityURL/v0001/`
**Purpose**: Convert custom URLs to Steam IDs

```
https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=XXXXXXXXXXXXXXXXX&vanityurl=gabelogannewell
```

## Browser Implementation Challenges

### CORS (Cross-Origin Resource Sharing)
**Problem**: Steam Web API does not include CORS headers
**Result**: Direct browser requests to Steam API will be blocked

**Error Example**:
```
Access to fetch at 'https://api.steampowered.com/...' from origin 'http://localhost:3000' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

### Security Considerations
- **API Key Exposure**: Cannot include Steam API key in client-side JavaScript
- **Rate Limiting**: All requests appear to come from single IP if proxied
- **User Privacy**: Steam IDs can be sensitive information

## Implementation Strategies

### Strategy 1: CORS Proxy Server ⚠️ **BLOCKED BY DOMAIN REQUIREMENT**
**Architecture**: Node.js proxy between client and Steam API

**CRITICAL BARRIER**: Steam API key registration requires a domain name, which adds significant deployment complexity.

**Pros**:
- ✅ Hides API key from client
- ✅ Handles CORS headers
- ✅ Can implement caching

**Cons**:
- ❌ **REQUIRES DOMAIN**: Steam API key registration needs domain verification
- ❌ Requires server infrastructure and hosting
- ❌ Additional complexity for users
- ❌ Potential single point of failure

### Strategy 2: Steam Profile Web Scraping 🤔 **POSSIBLE ALTERNATIVE**
**Architecture**: Parse public Steam profile pages directly

**How it works**:
- Steam profiles have public game lists: `https://steamcommunity.com/profiles/{STEAMID}/games/?tab=all`
- Or: `https://steamcommunity.com/id/{CUSTOMURL}/games/?tab=all`
- Parse HTML/JSON data from public profile pages
- Extract game names and IDs without API

**Pros**:
- ✅ No API key required
- ✅ Works for public profiles
- ✅ Can be done client-side with CORS proxy or server-side
- ✅ Steam artwork URLs still work with app IDs

**Cons**:
- ❌ Only works for public profiles
- ❌ Fragile - breaks if Steam changes page structure
- ❌ Rate limiting concerns
- ❌ Still has CORS issues for direct browser access

**Example URL**:
```
https://steamcommunity.com/profiles/76561197960287930/games/?tab=all&xml=1
```

### Strategy 3: Local Steam Client Integration 🎯 **MOST PROMISING**
**Architecture**: Read Steam data directly from local Steam installation

**How it works**:
- Steam stores library data locally in `config/loginusers.vdf` and `userdata/` folders
- Parse VDF (Valve Data Format) files directly
- Use Electron or desktop app to access local file system
- No network requests needed!

**Local Steam Paths**:
- **Windows**: `C:\Program Files (x86)\Steam\userdata\{USERID}\config\localconfig.vdf`
- **macOS**: `~/Library/Application Support/Steam/userdata/`
- **Linux**: `~/.local/share/Steam/userdata/`

**Pros**:
- ✅ **NO API KEY NEEDED**
- ✅ **NO DOMAIN REQUIRED**
- ✅ Instant access to full library
- ✅ Works offline
- ✅ No rate limiting
- ✅ Can get playtime and other detailed stats

**Cons**:
- ❌ Requires desktop app (Electron)
- ❌ Not pure web solution
- ❌ Needs file system access permissions
- ❌ Requires Steam to be installed locally

### Strategy 4: Manual Library Input 📝 **SIMPLE FALLBACK**
**Architecture**: User manually inputs their Steam games

**How it works**:
- Simple UI for users to add games manually
- Autocomplete using Steam store search
- Save library data locally
- Still use Steam artwork URLs with app IDs

**Pros**:
- ✅ **NO API BARRIERS**
- ✅ Works in any browser
- ✅ No authentication needed
- ✅ User has full control

**Cons**:
- ❌ Manual effort required
- ❌ Not automated
- ❌ Doesn't scale for large libraries
- ❌ User has to maintain their own list

### Strategy 5: Steam Profile URL Parsing 🔍 **HYBRID APPROACH**
**Architecture**: Combine profile scraping with manual fallbacks

**How it works**:
1. User provides Steam profile URL
2. Attempt to parse public game list from profile
3. Fall back to manual entry for private profiles
4. Cache successful results

**Pros**:
- ✅ **NO API KEY NEEDED**
- ✅ Works for many users with public profiles
- ✅ Graceful degradation to manual entry
- ✅ Still gets Steam artwork

**Cons**:
- ❌ Limited to public profiles
- ❌ Still has web scraping fragility

## Recommended Implementation Plan - REVISED

### Phase 1A: Local Steam Integration (Electron) ⭐ **NEW RECOMMENDATION**
1. **Convert to Electron app** with file system access
2. **Parse local Steam files** (loginusers.vdf, localconfig.vdf)
3. **Read game library directly** from Steam installation
4. **No API keys or domains needed**
5. **Instant offline access** to full library

### Phase 1B: Steam Profile Parsing (Web Fallback) 🔄 **ALTERNATIVE**
1. **Parse public Steam profiles** via web scraping
2. **Handle CORS with simple proxy** (no API key needed)
3. **Graceful fallback** to manual entry for private profiles
4. **Maintain web-first architecture**

### Phase 1C: Manual Library Input (Immediate Solution) 📝 **QUICK START**
1. **Simple game addition UI** in current WebXR app
2. **Steam Store search integration** for autocomplete
3. **Local storage** for game library persistence
4. **No external dependencies**

### Phase 2: Enhanced Features (All Approaches)
1. **Game artwork** from Steam CDN (works with any app ID source)
2. **3D scene population** with real game data
3. **Cache management** and offline support
4. **Steam protocol integration** for game launching

## Updated Next Steps

1. ✅ **Research Complete** - Document findings (this file)
2. 🤔 **DECISION POINT**: Choose implementation strategy
   - **Option A**: Convert to Electron for local Steam access
   - **Option B**: Implement Steam profile parsing
   - **Option C**: Start with manual library input
3. 🔧 **Implement chosen approach**
4. 🎮 **Replace placeholder boxes** with real games

## Strategic Recommendation

**For immediate progress**: Start with **Manual Library Input (Option C)**
- Gets us moving quickly without external barriers
- Validates the 3D game display pipeline
- Can be enhanced later with automated approaches

**For long-term solution**: **Local Steam Integration (Option A)**
- Best user experience - no manual work needed
- Most reliable - no API changes or rate limiting
- Aligns with desktop Steam game launching

## Questions for Decision

1. **Architecture Priority**: Stay web-first vs embrace desktop integration?
2. **User Experience**: Manual setup vs automated but complex?
3. **Development Speed**: Quick progress vs long-term optimal solution?
4. **Distribution**: Web app vs desktop app vs both?

## Questions for Further Research

1. **API Key Management**: How should we handle Steam API key distribution?
2. **Rate Limiting**: What's the optimal caching strategy?
3. **Error Handling**: How to handle private profiles or API failures?
4. **Game Artwork Fallbacks**: What if library_600x900.jpg doesn't exist?
5. **User Experience**: How should users provide their Steam ID?

---

**Research Status**: ✅ Complete  
**Next Action**: Implement CORS proxy server  
**Priority**: High - Required for Milestone 4 completion
