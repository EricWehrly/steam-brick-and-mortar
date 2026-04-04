# Centralized Data Management System - Implementation Plan

## Overview
Design and implement a single, centralized data management layer that replaces scattered data access patterns (like the global window access in RoomManager) with a clean, typed, and extensible system.

## Core Requirements

### Phase 1: Foundation (Basic Map + Typing)
- [x] **Basic string->object mapping** - Simple key-value storage
- [x] **Type safety** - Generic typing for data retrieval
- [x] **Singleton pattern** - Global access without global pollution
- [x] **Unit tests** - Comprehensive test coverage for all features

### Phase 2: Advanced Features (Meta-keying + Dynamic Lookups)
- [ ] **Meta-keying system** - Group keys by domain (RoomManager, SteamIntegration, etc.)
- [ ] **Dynamic lookups** - Register functions for computed data
- [ ] **Enum-based keys** - Replace magic strings with typed enums

### Phase 3: Integration (Caching + Persistence)
- [ ] **Cache integration** - Roll existing ImageManager cache into this system
- [ ] **Browser persistence** - IndexedDB, localStorage, cookies support
- [ ] **Data lifecycle** - TTL, invalidation, refresh strategies

## Architecture Design

### Core Classes

```typescript
// Core data manager
class DataManager {
  private store: Map<string, DataEntry>
  private metaStore: Map<DataDomain, Set<string>>
  private dynamicProviders: Map<string, DataProvider>
}

// Type-safe data entry
interface DataEntry<T = any> {
  value: T
  metadata: DataMetadata
  timestamp: number
}

// Dynamic data provider for computed values
interface DataProvider<T = any> {
  key: string
  domain: DataDomain
  compute: () => T | Promise<T>
  cacheDuration?: number
}

// Data domains for meta-keying
enum DataDomain {
  RoomManager = 'room-manager',
  SteamIntegration = 'steam-integration',
  UserPreferences = 'user-preferences',
  SystemConfig = 'system-config'
}
```

### Key Features

#### 1. Type-Safe Access
```typescript
// Generic typing ensures compile-time safety
const gameCount = dataManager.get<number>('room.current-game-count')
const dimensions = dataManager.get<RoomDimensions>('room.current-dimensions')
```

#### 2. Meta-Keying System
```typescript
// Get all room-related keys
const roomKeys = dataManager.getKeysByDomain(DataDomain.RoomManager)
// ['room.current-dimensions', 'room.game-count', 'room.last-resize-time']

// Clear all steam integration data
dataManager.clearDomain(DataDomain.SteamIntegration)
```

#### 3. Dynamic Data Providers
```typescript
// Register computed data
dataManager.registerProvider({
  key: 'room.current-dimensions',
  domain: DataDomain.RoomManager,
  compute: () => roomManager.getCurrentDimensions(),
  cacheDuration: 5000 // Cache for 5 seconds
})

// Access computed data seamlessly
const dimensions = await dataManager.get<RoomDimensions>('room.current-dimensions')
```

#### 4. Event Integration
```typescript
// Automatically update data based on events
dataManager.bindToEvent('room:resized', (event) => {
  dataManager.set('room.current-dimensions', event.detail.dimensions)
  dataManager.set('room.last-resize-time', Date.now())
})
```

## Implementation Strategy

### Phase 1: Basic Implementation
1. **Create DataManager class** with basic get/set operations
2. **Implement type safety** using TypeScript generics
3. **Add comprehensive unit tests** covering all basic operations
4. **Integration example** - Replace RoomManager global access

### Phase 2: Advanced Features
1. **Meta-keying system** with domain-based organization
2. **Dynamic providers** for computed/live data
3. **Enum-based keys** to replace magic strings
4. **Event binding** for automatic data updates

### Phase 3: Integration & Persistence
1. **Cache layer integration** - Merge ImageManager cache functionality
2. **Browser persistence** - IndexedDB wrapper for large data, localStorage for config
3. **Data lifecycle management** - TTL, invalidation, refresh strategies

## Migration Strategy

### Target Replacements

#### 1. RoomManager Global Access (Immediate)
**Current:**
```typescript
const globalApp = (window as any).steamBrickAndMortarApp
if (globalApp?.steamIntegration) {
  const gameLibrary = globalApp.steamIntegration.getGameLibrary()
  gameCount = gameLibrary.getGameCount()
}
```

**Proposed:**
```typescript
const gameCount = await dataManager.get<number>('steam.game-count')
```

#### 2. Cache Management (Phase 3)
**Current:** Multiple scattered caches (ImageManager, etc.)
**Proposed:** Centralized cache with automatic cleanup and persistence

#### 3. User Preferences (Phase 3)
**Current:** AppSettings scattered access
**Proposed:** Centralized user preference management with browser persistence

## Benefits

1. **Single Source of Truth** - No more scattered data access patterns
2. **Type Safety** - Compile-time guarantees for data types
3. **Dependency Reduction** - Classes don't need to import each other for data access
4. **Testability** - Easy to mock and test data access
5. **Performance** - Intelligent caching and computed data management
6. **Maintainability** - Clear data ownership and lifecycle management

## File Structure

```
src/core/data/
├── DataManager.ts           # Core data management class
├── DataTypes.ts            # Type definitions and enums
├── DataProviders.ts        # Dynamic data provider interfaces
├── PersistenceLayer.ts     # Browser storage integration
└── index.ts               # Public API exports

test/unit/core/data/
├── DataManager.test.ts     # Core functionality tests
├── MetaKeying.test.ts     # Domain-based organization tests
├── DynamicProviders.test.ts # Computed data tests
└── Integration.test.ts     # Integration with existing systems
```

## Success Criteria

- [ ] All global data access patterns replaced with DataManager calls
- [ ] 100% test coverage for core functionality
- [ ] Type-safe data access throughout the application
- [ ] Performance equal or better than current scattered approach
- [ ] Easy integration path for existing systems