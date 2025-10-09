/**
 * ServiceKeys - Type-safe service identifiers for dependency injection
 * 
 * Uses symbols to provide compile-time type safety and prevent service key conflicts.
 * Each symbol represents a unique service that can be registered in the ServiceContainer.
 */

// Use symbols for type-safe service keys
export const ServiceKeys = {
  // Core Three.js services
  SceneManager: Symbol('SceneManager'),
  SharedMaterialManager: Symbol('SharedMaterialManager'),
  
  // Rendering services
  GameBoxRenderer: Symbol('GameBoxRenderer'),
  RoomManager: Symbol('RoomManager'),
  StoreLayout: Symbol('StoreLayout'),
  StorePropsRenderer: Symbol('StorePropsRenderer'),
  
  // WebXR services
  WebXRCoordinator: Symbol('WebXRCoordinator'),
  WebXRManager: Symbol('WebXRManager'),
  InputManager: Symbol('InputManager'),
  
  // UI services
  UIManager: Symbol('UIManager'),
  SteamUICoordinator: Symbol('SteamUICoordinator'),
  WebXRUICoordinator: Symbol('WebXRUICoordinator'), 
  SystemUICoordinator: Symbol('SystemUICoordinator'),
  
  // Data services
  DataManager: Symbol('DataManager'),
  EventManager: Symbol('EventManager'),
  AppSettings: Symbol('AppSettings'),
  
  // Steam services
  SteamIntegration: Symbol('SteamIntegration'),
  SteamGameManager: Symbol('SteamGameManager'),
  SteamWorkflowManager: Symbol('SteamWorkflowManager'),
  
  // Performance & Monitoring
  PerformanceMonitor: Symbol('PerformanceMonitor'),
  DebugStatsProvider: Symbol('DebugStatsProvider'),
  
  // Configuration
  AppConfig: Symbol('AppConfig'),
  PerformanceConfig: Symbol('PerformanceConfig'),
  
  // Scene coordination
  SceneCoordinator: Symbol('SceneCoordinator'),
  
} as const

export type ServiceKeyType<T> = symbol | (new (...args: any[]) => T)

// Type helper to ensure service keys are properly typed
export type ServiceKeyMap = typeof ServiceKeys