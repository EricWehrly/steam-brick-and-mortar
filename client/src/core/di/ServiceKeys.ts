/**
 * ServiceKeys - Type-safe service identifiers for dependency injection
 *
 * Only keys for services that are currently registered in ServiceRegistration
 * and resolved from the container should live here. Aspirational/unused keys
 * belong in a comment or TD, not in this object.
 */
export const ServiceKeys = {
  // Core
  AppConfig: Symbol('AppConfig'),
  EventManager: Symbol('EventManager'),
  DataManager: Symbol('DataManager'),
  AppSettings: Symbol('AppSettings'),
  SharedMaterialManager: Symbol('SharedMaterialManager'),

  // Scene
  SceneManager: Symbol('SceneManager'),
  SceneCoordinator: Symbol('SceneCoordinator'),
} as const

export type ServiceKeyType<T> = symbol | (new (...args: any[]) => T)
export type ServiceKeyMap = typeof ServiceKeys