# Steam CDN Access Strategy Research

## Executive Summary

This document analyzes CDN sources for Steam game artwork, focusing on rate limits, performance, and resilience for handling traffic waves. Research identifies multiple viable sources with different trade-offs for accessing game artwork.

## Primary CDN Sources

### 1. Steam Official CDN (steamcdn-a.akamaihd.net)

**URL Pattern**: `https://steamcdn-a.akamaihd.net/steam/apps/<APP_ID>/[artwork_type]`

**Artwork Types Available**:
- `library_600x900_2x.jpg` - Box art (600x900 high-res)
- `header_292x136.jpg` - Header images  
- `capsule_231x87.jpg` - Small capsule images
- Various other formats and sizes

**Rate Limits**:
- **Steam Community**: ~20 requests per minute per IP (based on steamcommunity.com data)
- **CDN Direct**: No specific documented limits found, but likely more permissive than API endpoints

**Pros**:
- Official source with highest reliability
- Comprehensive artwork coverage
- High-quality images
- Direct CDN access (no API key required)

**Cons**:
- **CORS Issues**: Known CORS restrictions for browser access
- Rate limiting concerns for high-volume usage
- No official documentation on usage policies

**Traffic Wave Resilience**: ⚠️ **MODERATE** - Rate limits may be problematic for large user bases

### 2. SteamGridDB (www.steamgriddb.com)

**API Endpoint**: `https://www.steamgriddb.com/api/v2/`

**Artwork Types Available**:
- Grid artwork (600x900)
- Hero/banner artwork  
- Logos
- Icons
- Boxart
- Tenfoot (horizontal grid)

**Rate Limits**:
- **Standard Access**: Rate limited (specific limits not documented)
- **Pro Subscribers**: Priority API access with faster processing
- User reports suggest variable performance due to rate limiting

**Pros**:
- Comprehensive artwork database
- Community-curated high-quality content
- API access available
- Alternative artwork options beyond Steam official

**Cons**:
- Requires API authentication
- Rate limits for free tier
- Third-party dependency
- Less reliable than official Steam sources

**Traffic Wave Resilience**: ⚠️ **MODERATE** - Pro tier may provide better resilience

### 3. SteamDB (steamdb.info)

**Access Method**: Web scraping or indirect access (no public API)

**Artwork Types Available**:
- Direct links to Steam CDN assets
- Icon, header, and other artwork references
- Game metadata with artwork URLs

**Rate Limits**:
- Updates top 800 games every 5 minutes (internal optimization)
- No public API rate limits documented
- Hourly rate limiting reported for automated access

**Pros**:
- Comprehensive Steam database
- Direct links to official Steam artwork
- Well-maintained and optimized
- No API key required for basic access

**Cons**:
- No official API for artwork access
- Rate limiting for automated usage
- Web scraping required
- Not designed for high-volume artwork access

**Traffic Wave Resilience**: ❌ **LOW** - Not suitable for direct artwork serving

### 4. SteamSpy (steamspy.com)

**API Endpoint**: `https://steamspy.com/api.php`

**Rate Limits**:
- **1 request per second** maximum
- Data refreshed once per day
- Designed for statistical data, not artwork

**Artwork Access**: ❌ **NOT APPLICABLE** - Focuses on game statistics, not artwork hosting

**Traffic Wave Resilience**: ❌ **NOT SUITABLE** - Not an artwork source

## Recommended Strategy

### Primary Approach: Hybrid CDN Strategy

1. **Steam Official CDN (Primary)**
   - Use for initial artwork loading
   - Implement smart rate limiting (4 requests/second max)
   - Cache aggressively to minimize repeated requests

2. **SteamGridDB (Fallback)**
   - Use when Steam CDN is unavailable or rate-limited
   - Consider Pro subscription for high-traffic scenarios
   - Leverage for alternative/enhanced artwork options

3. **Local Caching (Critical)**
   - Browser localStorage/IndexedDB for frequently accessed images
   - CDN proxy layer for serving cached content
   - Aggressive caching to reduce origin requests

### Rate Limiting Strategy

**Conservative Limits for Traffic Wave Resilience**:
- **Steam CDN**: 2-4 requests/second per client
- **SteamGridDB**: 1 request/second (free tier)
- **Exponential backoff** on rate limit responses
- **Circuit breaker pattern** to fail gracefully

### CORS Mitigation

**For Steam CDN**:
- Use proxy server (our existing Lambda infrastructure)
- Implement caching layer to minimize CORS proxy requests
- Pre-fetch and cache artwork during low-traffic periods

### Implementation Priority

1. **Phase 1**: Implement Steam CDN access via proxy with aggressive caching
2. **Phase 2**: Add SteamGridDB as fallback source
3. **Phase 3**: Implement intelligent source selection based on availability/performance

## Traffic Wave Scenarios

### Scenario 1: Moderate Traffic (100-500 concurrent users)
- **Strategy**: Direct Steam CDN with rate limiting
- **Caching**: Essential for performance
- **Expected**: Manageable with current approach

### Scenario 2: High Traffic (500-2000 concurrent users)  
- **Strategy**: Hybrid approach with SteamGridDB fallback
- **Caching**: Critical infrastructure requirement
- **Expected**: Need CDN proxy layer

### Scenario 3: Traffic Spike (2000+ concurrent users)
- **Strategy**: Primarily cached content with minimal origin requests
- **Caching**: Pre-warmed cache essential
- **Expected**: Origin rate limits will be hit, cache must carry the load

## Recommendations

### Immediate Implementation
1. **Implement Steam CDN proxy** through existing Lambda infrastructure
2. **Add aggressive browser caching** for downloaded artwork
3. **Rate limit to 4 requests/second** per client maximum

### Future Scalability
1. **Add SteamGridDB as fallback** source with API key
2. **Implement CDN layer** (CloudFront) for cached artwork serving
3. **Consider SteamGridDB Pro subscription** for higher traffic scenarios

### Cache Strategy
- **Cache Duration**: 7+ days for artwork (rarely changes)
- **Cache Size**: Plan for 5-50MB per user depending on library size
- **Cache Priority**: Most-played games first, lazy-load others

## Conclusion

A hybrid approach using Steam's official CDN as primary source with SteamGridDB as fallback, combined with aggressive caching, provides the best resilience for traffic waves. The key is minimizing origin requests through intelligent caching rather than relying solely on increased rate limits.

**Priority**: Implement conservative rate limiting with robust caching over optimistic rate limits that fail under load.
