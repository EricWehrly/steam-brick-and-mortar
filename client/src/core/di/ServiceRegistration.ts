/**
 * ServiceRegistration - Centralized service configuration for dependency injection
 * 
 * Configures all services with proper dependency chains and lifecycle management.
 * Phase 1: Focus on SharedMaterialManager and GameBoxRenderer
 */

import { ServiceContainer } from './ServiceContainer'
import { ServiceKeys } from './ServiceKeys'
import { SceneManager } from '../../scene/SceneManager'
import { SharedMaterialManager } from '../../utils/SharedMaterialManager'
import { SceneCoordinator } from '../../scene/SceneCoordinator'
import { DataManager } from '../data/DataManager'
import { EventManager } from '../EventManager'
import { AppSettings } from '../AppSettings'

export interface AppConfig {
  // Scene configuration  
  scene?: any // Will be properly typed when we integrate with SceneManagerOptions
  
  // Performance configuration
  performance?: {
    maxGameBoxes?: number
    enableVROptimizations?: boolean
    gameBox?: {
      dimensions?: {
        width?: number
        height?: number
        depth?: number
      }
      shelf?: any
      performance?: any
    }
  }
  
  // WebXR configuration
  webxr?: {
    preferredMode?: 'vr' | 'ar'
    input?: {
      speed?: number
      mouseSensitivity?: number
    }
  }
  
  // Input configuration (for compatibility)
  input?: {
    speed?: number
    mouseSensitivity?: number
  }
  
  // UI configuration
  ui?: {
    theme?: 'dark' | 'light'
  }
  
  // Data configuration
  data?: {
    enablePersistence?: boolean
    defaultTTL?: number
    maxEntries?: number
  }

  tests?: Record<string, string>
}

export class ServiceRegistration {
  public static configureServices(
    container: ServiceContainer, 
    config: AppConfig = {},
    existingSceneManager?: SceneManager,
    existingAppSettings?: AppSettings
  ): ServiceContainer {
    
    // Configuration (always register config first)
    container.registerInstance(ServiceKeys.AppConfig, config)

    // Core singletons (no dependencies)
    container.registerSingleton(
      ServiceKeys.EventManager, 
      () => EventManager.getInstance()
    )

    container.registerSingleton(
      ServiceKeys.DataManager, 
      () => DataManager.getInstance(config.data)
    )

    // AppSettings (use existing instance if provided, otherwise get singleton)
    if (existingAppSettings) {
      container.registerInstance(ServiceKeys.AppSettings, existingAppSettings)
    } else {
      container.registerSingleton(
        ServiceKeys.AppSettings, 
        () => AppSettings.getInstance()
      )
    }

    // SharedMaterialManager (core material system)
    container.registerSingleton(
      ServiceKeys.SharedMaterialManager, 
      () => {
        const manager = SharedMaterialManager.getInstance()
        manager.initialize()
        return manager
      }
    )

    // Scene services (Three.js context required)
    if (existingSceneManager) {
      // Use existing SceneManager instance from the app
      container.registerInstance(ServiceKeys.SceneManager, existingSceneManager)
    } else {
      // Create new SceneManager (for testing scenarios)
      container.registerSingleton(
        ServiceKeys.SceneManager,
        () => new SceneManager(config.scene || {}),
        []
      )
    }

    // SceneCoordinator (depends on SceneManager, AppSettings, DataManager, and EventManager)
    // GameBoxRenderer removed - each props renderer creates its own instance (composition)
    // StorePropsRenderer removed - handled by event-driven system now
    container.registerSingleton(
      ServiceKeys.SceneCoordinator,
      async (container) => {
        const sceneManager = await container.resolve(ServiceKeys.SceneManager) as SceneManager
        const dataManager = await container.resolve(ServiceKeys.DataManager) as DataManager
        const eventManager = await container.resolve(ServiceKeys.EventManager) as EventManager
        
        console.debug('🎬 Creating SceneCoordinator with DI dependencies')
        
        return new SceneCoordinator(sceneManager, dataManager, eventManager)
      },
      [ServiceKeys.SceneManager, ServiceKeys.DataManager, ServiceKeys.EventManager]
    )

    return container
  }
}