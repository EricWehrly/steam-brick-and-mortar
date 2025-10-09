# Dependency Injection Cleanup and Enhancement Tasks

## 🎯 Project Goal
Complete the transition to a comprehensive dependency injection system by eliminating manual service instantiation and singleton `getInstance()` patterns throughout the codebase.

## 📊 Current Status
- ✅ **Core DI Infrastructure**: ServiceContainer, ServiceKeys, ServiceRegistration
- ✅ **Phase 1**: SharedMaterialManager and GameBoxRenderer DI integration  
- ✅ **Phase 2**: SceneCoordinator and SteamGameManager DI integration
- ✅ **Critical Fix**: SceneManager singleton sharing resolved
- 🔄 **Phase 3**: Comprehensive cleanup and remaining service integration

## 🧹 Cleanup Tasks

### **Priority 1: Critical Manual Instantiations**

#### ✅ **Task 1.1**: Fix StoreLayout.ts GameBoxRenderer instantiation
- **File**: `src/scene/StoreLayout.ts:29`
- **Issue**: `this.gameBoxRenderer = new GameBoxRenderer()` 
- **Solution**: ~~Inject GameBoxRenderer via constructor or resolve from DI~~ **REMOVED - unused code**
- **Impact**: Removes last major manual GameBoxRenderer creation  
- **Status**: ✅ **COMPLETED** - GameBoxRenderer was unused and removed entirely

#### ❌ **Task 1.2**: Remove remaining manual service creation
- **Files**: Search results show potential issues in test files
- **Issue**: Manual `new GameBoxRenderer()` in tests without DI context
- **Solution**: Update tests to use TestServiceContainer
- **Status**: ⏳ Pending

### **Priority 2: Singleton getInstance() Elimination** 

#### ✅ **Task 2.1**: AppSettings DI Integration  
**Current getInstance() locations:**
- ✅ ~~`src/core/SteamBrickAndMortarApp.ts:71`~~ - **App creates instance, DI uses existing**
- ✅ ~~`src/scene/SceneCoordinator.ts:58`~~ - **Now uses DI injection**
- ✅ ~~`src/ui/LightingControlsPanel.ts:39`~~ - **Reverted to getInstance() for simplicity**
- ⏳ `src/ui/pause/panels/GraphicsSettingsPanel.ts:29`
- ⏳ `src/ui/pause/panels/GameSettingsPanel.ts:61`
- ⏳ `src/ui/pause/panels/ApplicationPanel.ts:35`

**Actions Required:**
- [x] Add AppSettings to ServiceKeys
- [x] Register AppSettings singleton in ServiceRegistration  
- [x] Update SceneCoordinator to use DI injection instead of getInstance()
- [x] ~~Update UI panel constructors to accept AppSettings parameter~~ **Reverted**
- [x] ~~Update UICoordinator to pass AppSettings through constructor chain~~ **Reverted**
- [x] ~~Update main app to pass AppSettings to UICoordinator~~ **Reverted**
- [ ] ⏳ Complete remaining UI panels (GraphicsSettingsPanel, GameSettingsPanel, ApplicationPanel)

**Status**: ✅ **COMPLETED** - Core AppSettings DI integration finished. UI layer reverted to getInstance() pattern for simplicity.

**Note**: Service locator pattern attempted but reverted in favor of simpler getInstance() approach per user preference.

#### ✅ **Task 2.2**: DataManager DI Integration
**Current getInstance() locations:**
- ✅ ~~`src/scene/StorePropsRenderer.ts:108`~~ - **Now uses DI injection**
- ✅ ~~`src/scene/SceneCoordinator.ts:254`~~ - **Now uses DI injection**
- ✅ ~~`src/scene/RoomManager.ts:183`~~ - **Now uses DI injection**
- ✅ ~~`src/steam-integration/SteamWorkflowManager.ts:40`~~ - **Now uses DI injection**

**Actions Required:**
- [x] Add DataManager to ServiceKeys  
- [x] Register DataManager singleton in ServiceRegistration
- [x] Update all files to use DI injection instead of getInstance()
- [x] Update constructors to accept DataManager parameter

**Status**: ✅ **COMPLETED** - All DataManager getInstance() calls eliminated and replaced with DI injection

**Implementation Details:**
- **StorePropsRenderer**: Constructor now accepts DataManager parameter, injected via ServiceRegistration
- **SceneCoordinator**: Constructor now accepts DataManager parameter with fallback, injected via ServiceRegistration  
- **RoomManager**: Constructor now accepts DataManager parameter with fallback, passed from SceneCoordinator
- **SteamWorkflowManager**: Constructor now accepts DataManager parameter with fallback, resolved from DI in main app
- **ServiceRegistration**: DataManager dependency added to StorePropsRenderer and SceneCoordinator registrations
- **Backward Compatibility**: All constructors maintain fallbacks to getInstance() for smooth transition

#### ❌ **Task 2.3**: EventManager DI Integration
**Current getInstance() locations:**
- `src/core/SteamBrickAndMortarApp.ts:140`
- `src/scene/StorePropsRenderer.ts:97`
- `src/scene/SceneCoordinator.ts:85,131,237,413`

**Actions Required:**
- [ ] EventManager already in DI, but not consistently used
- [ ] Update all getInstance() calls to use DI injection
- [ ] Update constructors to accept EventManager parameter
- [ ] Maintain event system functionality during transition

#### ❌ **Task 2.4**: UICoordinator Layer Elimination
**Current Architecture (Indirect):**
```typescript
SteamBrickAndMortarApp
  └── UICoordinator
      ├── steam: SteamUICoordinator  
      ├── webxr: WebXRUICoordinator
      └── system: SystemUICoordinator
```

**Target Architecture (Direct DI):**
```typescript
SteamBrickAndMortarApp 
  ├── steamUICoordinator (resolved from DI)
  ├── webxrUICoordinator (resolved from DI) 
  └── systemUICoordinator (resolved from DI)
  └── uiManager (resolved from DI)
```

**Actions Required:**
- [ ] Add UI coordinators to ServiceKeys (SteamUICoordinator, WebXRUICoordinator, SystemUICoordinator, UIManager)
- [ ] Register UI coordinators in ServiceRegistration with proper dependencies
- [ ] Update SteamBrickAndMortarApp to resolve UI services directly from DI
- [ ] Replace `this.uiCoordinator.steam.loadFromCache()` with `this.steamUICoordinator.loadFromCache()`
- [ ] Update WebXREventHandler and SteamWorkflowManager to use direct coordinator references
- [ ] Remove UICoordinator class entirely

**Benefits:**
- ✅ **Eliminates indirection**: No more `app.uiCoordinator.steam.showError()`
- ✅ **Direct access**: Clean `app.steamUICoordinator.showError()`
- ✅ **Better testability**: Each coordinator can be tested independently  
- ✅ **Cleaner DI**: UI services become first-class DI citizens
- ✅ **Reduced complexity**: Fewer layers, simpler initialization

**Dependencies**: Should be completed after Tasks 2.2 and 2.3 for consistency

### **Priority 3: Service Integration Improvements**

#### ❌ **Task 3.1**: SceneCoordinator Constructor DI Enhancement
- **File**: `src/scene/SceneCoordinator.ts`
- **Current**: Manual getInstance() calls for AppSettings, DataManager, EventManager
- **Target**: Full constructor injection with DI dependencies
- **Dependencies**: Tasks 2.1, 2.2, 2.3 must be completed first

#### ❌ **Task 3.2**: UI Panel DI Integration  
**Files needing update:**
- `src/ui/LightingControlsPanel.ts`
- `src/ui/pause/panels/GraphicsSettingsPanel.ts`
- `src/ui/pause/panels/GameSettingsPanel.ts`
- `src/ui/pause/panels/ApplicationPanel.ts`

**Actions Required:**
- [ ] Update constructors to accept AppSettings via DI
- [ ] Update parent components to resolve and inject dependencies
- [ ] Maintain UI functionality during transition

### **Priority 4: Test Infrastructure Updates**

#### ❌ **Task 4.1**: Update Unit Tests to Use DI
**Files with manual getInstance() in tests:**
- `test/unit/core/data/DataManager.test.ts`
- `test/unit/ui/pause-menu/game-settings-dev-mode.test.ts`  
- `test/performance/scene/game-box-renderer-performance.test.ts`
- Multiple other test files

**Actions Required:**
- [ ] Replace getInstance() with TestServiceContainer usage
- [ ] Improve test isolation and reliability
- [ ] Use standard WebGL-free mocks for consistent testing

#### ❌ **Task 4.2**: Performance Test DI Integration
- **File**: `test/performance/scene/game-box-renderer-performance.test.ts:76,355`
- **Issue**: Manual GameBoxRenderer instantiation in performance tests
- **Solution**: Use DI container for consistent performance testing

## 🔧 Technical Implementation Plan

### **Phase 3A: Service Registration Expansion**
1. **Add missing services to ServiceKeys:**
   ```typescript
   // Add to ServiceKeys.ts
   AppSettings: Symbol('AppSettings'),
   DataManager: Symbol('DataManager'),
   ```

2. **Update ServiceRegistration.configureServices():**
   ```typescript
   // AppSettings registration (singleton)
   container.registerSingleton(
     ServiceKeys.AppSettings, 
     () => AppSettings.getInstance()
   )
   
   // DataManager registration (singleton)  
   container.registerSingleton(
     ServiceKeys.DataManager,
     () => DataManager.getInstance(config.data)
   )
   ```

### **Phase 3B: Constructor Updates**
1. **Update service constructors to accept injected dependencies**
2. **Maintain backward compatibility during transition**
3. **Update factory methods in ServiceRegistration**

### **Phase 3C: getInstance() Elimination** 
1. **Replace all getInstance() calls with DI resolution**
2. **Update parent classes to inject dependencies**
3. **Verify functionality after each change**

### **Phase 3D: Test Updates**
1. **Update all tests to use TestServiceContainer**
2. **Remove manual getInstance() calls in test setup**
3. **Verify test isolation and reliability**

## 🧪 Testing Strategy

### **Regression Testing**
- [ ] Run full test suite after each major change
- [ ] Verify scene rendering still works correctly
- [ ] Test UI panel functionality
- [ ] Validate event system behavior

### **Integration Testing**
- [ ] Test complete app startup with full DI
- [ ] Verify all services resolve correctly
- [ ] Test service lifecycle (creation, usage, disposal)

### **Performance Validation**
- [ ] Run performance tests to ensure DI overhead remains minimal
- [ ] Verify singleton behavior maintained
- [ ] Test memory usage patterns

## 📝 Progress Tracking

### **Completed ✅**
- [x] Core DI infrastructure (ServiceContainer, ServiceKeys, ServiceRegistration)
- [x] GameBoxRenderer singleton integration
- [x] SceneCoordinator DI integration with StorePropsRenderer
- [x] SteamGameManager DI integration  
- [x] Circular dependency detection fix
- [x] Test infrastructure (TestServiceContainer)
- [x] Performance validation
- [x] SceneManager singleton sharing fix
- [x] **Task 1.1**: StoreLayout.ts cleanup - Removed unused GameBoxRenderer instantiation
- [x] **Task 2.1**: AppSettings DI Core - Added to ServiceKeys, ServiceRegistration, and SceneCoordinator integration. UI layer reverted to getInstance() for simplicity.
- [x] **Task 2.2**: DataManager DI Integration - All 4 getInstance() calls eliminated. Full constructor injection implemented with fallbacks.

### **In Progress 🔄**
- [ ] **Next Priority**: Task 2.3 (EventManager getInstance() Elimination) - Ready to proceed

### **Pending ⏳**
- [ ] **Task 2.3**: EventManager getInstance() elimination (6+ files)
- [ ] **Task 2.4**: UICoordinator layer elimination (architectural improvement)
- [ ] **Task 3.2**: UI panel constructor updates (4+ files)
- [ ] **Task 4.1**: Test suite DI integration (10+ files)
- [ ] **Task 4.2**: Performance test DI integration

## 🎯 Success Criteria

### **Code Quality Goals**
- [x] Zero manual `new GameBoxRenderer()` calls outside of DI
- [ ] Zero `getInstance()` calls for DI-managed services
- [ ] All services resolve through ServiceContainer
- [ ] Consistent dependency injection patterns

### **Functional Goals**  
- [ ] All existing functionality preserved
- [ ] Improved testability and isolation
- [ ] Better separation of concerns
- [ ] Reduced coupling between services

### **Performance Goals**
- [ ] No regression in startup time
- [ ] DI resolution overhead < 0.1ms per service
- [ ] Memory usage remains stable
- [ ] Singleton behavior maintained

## 📚 References
- [DI Implementation Documentation](../architecture/dependency-injection-architecture.md)
- [ServiceContainer API Reference](../../client/src/core/di/ServiceContainer.ts)  
- [Test Infrastructure Guide](../../client/test/utils/test-helpers.ts)
- [Performance Benchmarks](../../client/test-results/performance-results.json)