# Game Library Binder UI - Implementation Plan

## Vision
A nostalgic CD/DVD binder interface for browsing Steam library games, complete with black felt exterior, clear plastic sheets showing 4 games each, and a side-by-side view as you flip through pages.

## User Experience Flow

### Main View - The Binder
```
┌─────────────────────────────────────────────────────────────┐
│  🎮 Steam Library Binder                    🔍 [Search...]  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐   ┌──────────────────┐               │
│  │ Left Page (4)    │   │ Right Page (5)   │               │
│  │ ┌──┐  ┌──┐       │   │ ┌──┐  ┌──┐       │               │
│  │ │ 1│  │ 2│       │   │ │ 9│  │10│       │               │
│  │ └──┘  └──┘       │   │ └──┘  └──┘       │               │
│  │ ┌──┐  ┌──┐       │   │ ┌──┐  ┌──┐       │               │
│  │ │ 3│  │ 4│       │   │ │11│  │12│       │               │
│  │ └──┘  └──┘       │   │ └──┘  └──┘       │               │
│  └──────────────────┘   └──────────────────┘               │
│                                                               │
│        ◄ Prev          Page 2-3 / 25          Next ►         │
└─────────────────────────────────────────────────────────────┘
```

### Detail View - Game Details Panel
```
┌─────────────────────────────────────────────────────────────┐
│  🎮 Steam Library Binder        [X Close Details]           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐   ┌──────────────────────────────────┐   │
│  │ Left Page    │   │ Game: Cyberpunk 2077              │   │
│  │ ┌──┐  ┌──┐   │   │ ──────────────────────────────── │   │
│  │ │  │  │XX│◄──┼───│ [Info] [Cache] [Artwork] [Debug] │   │
│  │ └──┘  └──┘   │   │                                   │   │
│  │ ┌──┐  ┌──┐   │   │ Playtime: 142 hours               │   │
│  │ │  │  │  │   │   │ AppID: 1091500                    │   │
│  │ └──┘  └──┘   │   │ Type: Game                        │   │
│  └──────────────┘   │                                   │   │
│                     │ Cached Data:                       │   │
│                     │ ✅ App Details (2 hours ago)       │   │
│                     │ ✅ Header Image (cached)           │   │
│                     │ ✅ Library Image (cached)          │   │
│                     │ ⚠️  Icon (fallback used)           │   │
│                     └──────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. GameLibraryBinderUI (Main Component)
**Purpose**: Orchestrate the entire binder experience

**State**:
- `games: SteamGame[]` - All loaded games
- `currentPageIndex: number` - Current page pair (0 = pages 0-1, 1 = pages 2-3, etc.)
- `selectedGame: SteamGame | null` - Game selected for detail view
- `searchQuery: string` - Current search filter
- `showDetails: boolean` - Whether detail panel is open

**Methods**:
- `loadGames()` - Load games from Steam API with batch details
- `filterGames(query)` - Filter games by search
- `nextPage()` / `prevPage()` - Pagination
- `selectGame(game)` - Open detail view
- `closeDetails()` - Close detail view

**Rendering**:
- Black felt background texture
- Two-page spread (2 sheets side-by-side)
- Search bar at top
- Page navigation at bottom

### 2. BinderPage (Sheet Component)
**Purpose**: Render a single sheet with 4 game slots

**Props**:
- `games: SteamGame[]` - Array of 4 games (or less for last page)
- `pageNumber: number` - Page number for display
- `onSelectGame: (game) => void` - Callback when game clicked

**Layout**:
```
┌────────────────────┐
│  Clear Plastic     │
│  ┌────┐  ┌────┐    │
│  │ G1 │  │ G2 │    │ (2x2 grid)
│  └────┘  └────┘    │
│  ┌────┐  ┌────┐    │
│  │ G3 │  │ G4 │    │
│  └────┘  └────┘    │
└────────────────────┘
```

**Styling**:
- Subtle plastic sheen/reflection effect
- 2x2 grid layout with gaps
- Rounded corners on sheet
- Drop shadow for depth

### 3. GameCard (Individual Game Slot)
**Purpose**: Display single game in binder slot

**Props**:
- `game: SteamGame` - Game data
- `onClick: () => void` - Click handler

**Content**:
- Game artwork (header/library image)
- Game title overlay
- Playtime badge
- Hover effect (lift/highlight)

**States**:
- Loading (skeleton)
- Loaded (artwork visible)
- Error (fallback icon)

### 4. GameDetailPanel (Side Panel)
**Purpose**: Show comprehensive game information

**Props**:
- `game: SteamGame` - Selected game
- `onClose: () => void` - Close callback

**Tabs**:
1. **Info Tab** - Basic game info
   - Name, AppID, Type
   - Playtime (forever, 2 weeks)
   - Short description (if available from batch)
   
2. **Cache Tab** - Cache status details
   - App Details: Cached/Missing, timestamp
   - Images: Header, Library, Icon, Logo status
   - Batch data: Present/Missing
   - Actions: Clear cache, Refresh data
   
3. **Artwork Tab** - All artwork preview
   - Header image preview
   - Library image preview
   - Icon preview
   - Logo preview
   - Fallback chain used (if any)
   - CDN URLs shown
   
4. **Debug Tab** - Technical details
   - Full game object JSON
   - Cache keys
   - API response data
   - Batch details data

**Layout**:
- Slides in from right
- Overlays right page
- Tabs at top
- Scrollable content area
- Close button

## Data Flow

### On Component Mount
```
1. GameLibraryBinderUI.loadGames()
   ↓
2. SteamIntegration.loadGamesForUser()
   ↓
3. SteamApiClient.loadGamesProgressively()
   - Check AppDetailsCache for batch data
   - Fetch missing from batch endpoint
   - Cache results to IndexedDB
   ↓
4. Update component state with games
   ↓
5. Render first page pair (pages 0-1)
```

### On Page Navigation
```
1. User clicks Next/Prev
   ↓
2. Update currentPageIndex
   ↓
3. Calculate which games to show:
   - Page 0: games[0-3]
   - Page 1: games[4-7]
   - Page 2: games[8-11]
   etc.
   ↓
4. Re-render with new page pair
```

### On Game Click
```
1. User clicks game card
   ↓
2. selectGame(game)
   ↓
3. Fetch additional cache details:
   - Check AppDetailsCache
   - Check ImageManager cache
   - Get cache timestamps
   ↓
4. Show detail panel with data
```

### On Search
```
1. User types in search box
   ↓
2. filterGames(query)
   - Filter by name (case-insensitive)
   - Could expand to filter by categories/genres from batch data
   ↓
3. Reset to page 0
   ↓
4. Re-render with filtered games
```

## Implementation Phases

### Phase 1: Core Structure (Day 1)
- [x] Create plan document
- [ ] Create GameLibraryBinderUI component
- [ ] Implement basic two-page layout
- [ ] Add black felt background styling
- [ ] Integrate with existing SteamIntegration

### Phase 2: Game Cards & Pagination (Day 1-2)
- [ ] Create BinderPage component
- [ ] Create GameCard component
- [ ] Implement 2x2 grid layout
- [ ] Add pagination logic (prev/next)
- [ ] Style clear plastic sheet effect
- [ ] Add game artwork loading

### Phase 3: Search & Filtering (Day 2)
- [ ] Add search bar component
- [ ] Implement search filtering
- [ ] Add search result count
- [ ] Handle empty search results

### Phase 4: Detail Panel - Info Tab (Day 2-3)
- [ ] Create GameDetailPanel component
- [ ] Implement slide-in animation
- [ ] Add Info tab with basic game data
- [ ] Style panel layout

### Phase 5: Detail Panel - Cache Tab (Day 3)
- [ ] Query AppDetailsCache for game
- [ ] Query ImageManager cache for images
- [ ] Display cache status with timestamps
- [ ] Show batch data availability
- [ ] Add cache action buttons

### Phase 6: Detail Panel - Artwork & Debug Tabs (Day 3-4)
- [ ] Create Artwork tab with image previews
- [ ] Show fallback chain information
- [ ] Create Debug tab with JSON viewer
- [ ] Add copy-to-clipboard for debug data

### Phase 7: Polish & Interactions (Day 4)
- [ ] Add page flip animation
- [ ] Add hover effects on cards
- [ ] Improve loading states
- [ ] Add keyboard navigation (arrow keys)
- [ ] Mobile responsive considerations
- [ ] Performance optimization (virtualization if needed)

### Phase 8: Integration (Day 4)
- [ ] Add binder view toggle to existing UI
- [ ] Connect to existing cache management
- [ ] Test with real Steam library data
- [ ] Fix batch loading when loading from DataManager cache

## Technical Considerations

### Performance
- **Pagination**: Only render 8 games at a time (2 pages × 4 games)
- **Image Loading**: Lazy load images as pages come into view
- **Virtual Scrolling**: Not needed for paginated view
- **Batch Loading**: Ensure batch API is called even when loading from DataManager cache

### Styling Approach
- Use CSS Grid for 2x2 game layout
- CSS Flexbox for page spread
- CSS animations for page flips
- CSS backdrop-filter for plastic sheet effect
- CSS background texture for felt

### Accessibility
- Keyboard navigation (Tab, Arrow keys)
- ARIA labels for interactive elements
- Focus management when detail panel opens
- Screen reader announcements for page changes

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- CSS Grid support required
- IndexedDB support required (already used)
- backdrop-filter support (with fallback)

## File Structure
```
client/src/ui/binder/
├── GameLibraryBinderUI.tsx        # Main component
├── BinderPage.tsx                  # Single sheet component
├── GameCard.tsx                    # Individual game slot
├── GameDetailPanel.tsx             # Detail sidebar
├── SearchBar.tsx                   # Search component
├── PageNavigation.tsx              # Prev/Next controls
└── styles/
    ├── binder.css                  # Main binder styles
    ├── felt-texture.css            # Black felt background
    ├── plastic-sheet.css           # Clear sheet effect
    └── animations.css              # Page flip animations
```

## Asset Requirements
- **Felt Texture**: Black felt pattern (CSS background or SVG)
- **Plastic Effect**: CSS backdrop-filter + subtle reflection
- **Loading Skeleton**: Gray placeholder rectangles
- **Icons**: 
  - Search icon
  - Close icon
  - Arrow icons (prev/next)
  - Tab icons (optional)

## Key Questions to Resolve
1. ✅ Should we show games in playtime order? **Yes, already sorted by playtime**
2. Should empty slots be visible on last page? **Yes, show empty slots for visual consistency**
3. Max games per binder session? **Use maxGames setting (20 dev, 100 prod)**
4. Should search be client-side or trigger new API call? **Client-side for instant results**
5. Should detail panel overlay or push content? **Overlay for better UX**
6. **CRITICAL**: When loading from DataManager cache, we need to still fetch batch details for artwork

## Success Criteria
- ✅ Nostalgic binder aesthetic achieved
- ✅ Smooth page navigation experience
- ✅ Fast game selection and detail view
- ✅ Search works instantly
- ✅ All cache information visible
- ✅ Debug data easily accessible
- ✅ Batch artwork URLs used for library games
- ✅ Works with 20+ games without performance issues

## Future Enhancements (Post-MVP)
- Multiple binders (by genre, playtime, etc.)
- Custom sorting options
- Drag-and-drop to reorganize
- Print/export binder view
- Share binder with friends
- VR binder view (flip through in 3D space!)
- Spine labels on binder exterior
- Page bookmarks/favorites
