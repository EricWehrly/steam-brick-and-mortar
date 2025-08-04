# Steam Categorization Research

## Executive Summary

Steam provides multiple categorization systems that can be leveraged for dynamic game organization, moving beyond hardcoded categories to user-driven and Steam-native classification systems. This research identifies available category systems and recommends implementation strategies for dynamic categorization.

## Available Category Systems

### 1. **Steam Store Categories** 
**Source**: Steam Store API (GetAppDetails endpoint)  
**Access Level**: Public API  
**Rate Limits**: 200 requests per 5 minutes  

Steam Store categories represent official categorization assigned by developers/publishers when submitting games to Steam. These are broader, stable categories focused on game types and target audiences.

**Example Categories**:
- Single-player
- Multi-player  
- Co-op
- Steam Achievements
- Steam Trading Cards
- VR Supported
- Controller Support

**API Access**: 
```
GET https://store.steampowered.com/api/appdetails?appids={appid}
Response includes: data.{appid}.categories[]
```

### 2. **Steam Store Genres**
**Source**: Steam Store API (GetAppDetails endpoint)  
**Access Level**: Public API  
**Rate Limits**: 200 requests per 5 minutes  

Steam genres represent the official genre classification system used in the Steam Store. These are more specific than categories and focus on gameplay mechanics and themes.

**Hierarchical Structure**:
- **Top-Level Genres**: Action, Adventure, Casual, Experimental, Puzzle, Racing, RPG, Simulation, Sports, Strategy, Tabletop
- **Sub-Genres**: Action RPG, Precision Platformer, Battle Royale, MMORPG, etc.
- **Specialized Genres**: Roguelike, Metroidvania, Souls-like, CRPG, etc.

**API Access**: 
```
GET https://store.steampowered.com/api/appdetails?appids={appid}
Response includes: data.{appid}.genres[]
```

### 3. **Steam Community Tags** 
**Source**: Steam Store API (GetAppDetails endpoint) + Community data  
**Access Level**: Public API  
**Rate Limits**: Varies by endpoint

Community tags are user-generated labels that provide the most nuanced and current categorization. These reflect how players actually perceive and categorize games, often more accurately than official genres.

**Tag Categories**:
- **Visual & Viewpoint**: 2D, 3D, First-Person, Third-Person, Pixel Graphics, Anime, etc.
- **Themes & Moods**: Sci-fi, Fantasy, Horror, Relaxing, Atmospheric, etc.  
- **Features**: Physics, Procedural Generation, Character Customization, etc.
- **Players**: Singleplayer, Multiplayer, Co-op, MMO, etc.
- **Assessment**: Addictive, Beautiful, Difficult, Funny, etc.

**Key Insights**: Community tags often provide better search and categorization than official genres because they reflect actual player experience.

### 4. **User-Recommended Tags**
**Source**: IStoreService/GetRecommendedTagsForUser endpoint  
**Access Level**: Requires Steam Web API key  
**Rate Limits**: 100,000 requests per day

Steam can generate personalized tag recommendations based on user's play history and preferences. This enables dynamic, personalized categorization.

**API Access**:
```
GET https://api.steampowered.com/IStoreService/GetRecommendedTagsForUser/v1
Parameters: language, country_code, favor_rarer_tags
```

### 5. **User Profile Categories** ❌ **LIMITED ACCESS**
**Access Level**: Private profile data, limited API access  
**Current Status**: Not accessible through public Steam Web API

Steam users can create custom categories in their library, but this data is not accessible through public APIs unless it's the user's own profile with proper authentication.

## Current API Limitations

### Steam Web API Constraints
- **Official Web API**: Very limited, only basic user and game data
- **Store API**: Unofficial but functional, contains categories/genres/tags  
- **Rate Limits**: 200 requests per 5 minutes for Store API
- **No Bulk Endpoints**: Must request individual games for detailed categorization

### Authentication Requirements  
- **Public Data**: Store categories, genres, community tags  
- **User-Specific Data**: Requires Steam Web API key and proper authentication
- **Private Profile Data**: Not accessible through public APIs

## Recommended Implementation Strategy

### Phase 1: Basic Dynamic Categories (Immediate Implementation)
**Approach**: Use Steam Store Genres + Categories for foundational organization

**Implementation**:
1. **Enhance existing game loading**: Add genre/category fetching to Steam API calls
2. **Cache category data**: Store genres/categories with game metadata
3. **Dynamic shelf assignment**: Group games by primary genre instead of hardcoded categories
4. **Fallback system**: Use hardcoded categories when API data unavailable

**Advantages**:
- Leverages existing API infrastructure
- Stable, officially-maintained categories
- Clear hierarchy and organization

**API Integration**:
```typescript
// Extend existing Steam API response handling
interface SteamGameData {
  appid: number;
  name: string;
  genres?: Array<{id: number, description: string}>;
  categories?: Array<{id: number, description: string}>;
  // ... existing fields
}
```

### Phase 2: Community-Driven Categories (Future Enhancement)
**Approach**: Integrate community tags for nuanced categorization

**Implementation**:
1. **Tag analysis**: Identify most common/relevant tags across user's library
2. **Smart grouping**: Use tag frequency to create dynamic categories
3. **User preferences**: Allow users to select preferred tag-based categories
4. **Hybrid approach**: Combine genres + popular community tags

**Example Categories Generated**:
- "Indie Gems" (Indie + High Community Rating tags)
- "Cozy Games" (Relaxing + Atmospheric + Beautiful tags)  
- "Competitive" (Multiplayer + Competitive + Esports tags)

### Phase 3: Personalized Categories (Advanced Feature)
**Approach**: Use Steam's user-recommended tags and play patterns

**Implementation**:
1. **Personalized recommendations**: Leverage GetRecommendedTagsForUser
2. **Play-pattern analysis**: Group by playtime, recent activity, achievement completion
3. **Dynamic adjustment**: Categories adapt based on user behavior
4. **Learning system**: Categories improve over time based on user interactions

## Technical Implementation Details

### Data Structure Design
```typescript
interface GameCategory {
  id: string;
  name: string;
  source: 'steam_genre' | 'steam_category' | 'community_tag' | 'user_custom';
  priority: number; // For conflict resolution
  games: Set<number>; // App IDs belonging to this category
}

interface CategoryManager {
  generateCategories(games: SteamGameData[]): GameCategory[];
  assignGameToCategories(game: SteamGameData): string[];
  updateCategories(userFeedback: CategoryFeedback): void;
}
```

### Caching Strategy
- **Category metadata**: Cache genre/category data with 7-day expiration
- **Category assignments**: Cache with game data, refresh when Steam data updates
- **User preferences**: Store category preferences in localStorage
- **Fallback data**: Maintain minimal hardcoded categories for offline mode

### Rate Limit Management
- **Batch processing**: Group category fetching with existing game data calls
- **Progressive enhancement**: Display games first, add categories as data loads
- **Priority queuing**: Fetch category data for visible/prioritized games first
- **Intelligent caching**: Avoid duplicate API calls for category data

## Fallback Strategies

### When API Data Unavailable
1. **Genre inference**: Use game name patterns and existing metadata
2. **Hardcoded mapping**: Maintain minimal category mappings for popular games
3. **User-defined**: Allow users to manually assign categories
4. **Playtime-based**: Group by play patterns (most played, recently played, etc.)

### For Large Libraries
1. **Sampling approach**: Categorize based on subset of most-played games
2. **Progressive categorization**: Build categories as user browses library
3. **Priority-based**: Focus on games user is most likely to want quickly
4. **Smart defaults**: Use established gaming categories as foundation

## Testing & Validation Plan

### Phase 1 Testing
- Test with 10-game limit during development
- Validate genre/category data retrieval for diverse game types
- Ensure graceful fallback when category data missing
- Performance testing with category-based shelf generation

### Phase 2 Validation  
- User testing with community tag-based categories
- A/B testing: genre-based vs. tag-based categorization
- Feedback collection on category usefulness and accuracy

### Success Metrics
- **User satisfaction**: Categories feel intuitive and useful
- **Performance**: No significant impact on loading times
- **Coverage**: >80% of games properly categorized
- **Discoverability**: Users can find games faster than browsing full library

## Conclusion

Steam provides robust categorization data through its Store API that can replace hardcoded categories with dynamic, data-driven organization. The recommended phased approach starts with stable genre/category data and progressively enhances with community tags and personalization.

**Immediate Action**: Implement Phase 1 (Steam Store Genres + Categories) as it requires minimal changes to existing API integration while providing significant improvement over hardcoded categories.

**Key Benefits**:
- Reduces maintenance overhead of hardcoded categories
- Provides more accurate and current categorization
- Scales automatically with user's library size and diversity
- Foundation for future personalization features

---

**Research Date**: August 3, 2025  
**API Versions**: Steam Web API v2, Steam Store API (unofficial)  
**Rate Limit Status**: 200 requests per 5 minutes (Store API)
