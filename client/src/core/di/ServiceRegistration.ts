/**
 * ServiceRegistration - Centralized service configuration for dependency injection
 * 
 * Configures all services with proper dependency chains and lifecycle management.
 * Phase 1: Focus on SharedMaterialManager and GameBoxRenderer
 */

import { ServiceContainer, ServiceLifetime } from './ServiceContainer'
import { ServiceKeys } from './ServiceKeys'
import { SceneManager } from '../../scene/SceneManager'
import { GameBoxRenderer } from '../../scene/GameBoxRenderer'
import { SharedMaterialManager } from '../../utils/SharedMaterialManager'
import { StorePropsRenderer } from '../../scene/StorePropsRenderer'
import { DataManager } from '../data/DataManager'
import { EventManager } from '../EventManager'

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
}

export class ServiceRegistration {
  public static configureServices(
    container: ServiceContainer, 
    config: AppConfig = {}
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
    container.registerSingleton(
      ServiceKeys.SceneManager,
      () => new SceneManager(config.scene || {}),
      []
    )

    // GameBoxRenderer (depends on SharedMaterialManager and SceneManager) 
    // This is the critical singleton we need to ensure single instance
    container.registerSingleton(
      ServiceKeys.GameBoxRenderer,
      async (container) => {
        const materialManager = await container.resolve(ServiceKeys.SharedMaterialManager)
        const sceneManager = await container.resolve(ServiceKeys.SceneManager)
        
        console.debug('🎮 Creating singleton GameBoxRenderer with DI')
        
        return new GameBoxRenderer(
          config.performance?.gameBox?.dimensions,
          config.performance?.gameBox?.shelf,
          config.performance?.gameBox?.performance,
          sceneManager // Pass SceneManager for consistent scene interaction
        )
      },
      [ServiceKeys.SharedMaterialManager, ServiceKeys.SceneManager]
    )

    // StorePropsRenderer (depends on SceneManager and GameBoxRenderer)
    container.registerSingleton(
      ServiceKeys.StorePropsRenderer,
      async (container) => {
        const sceneManager = await container.resolve(ServiceKeys.SceneManager) as SceneManager
        const gameBoxRenderer = await container.resolve(ServiceKeys.GameBoxRenderer) as GameBoxRenderer
        
        console.debug('🏪 Creating StorePropsRenderer with DI dependencies')
        
        const storePropsRenderer = new StorePropsRenderer(sceneManager.getScene())
        storePropsRenderer.setGameBoxRenderer(gameBoxRenderer) // Inject GameBoxRenderer
        
        return storePropsRenderer
      },
      [ServiceKeys.SceneManager, ServiceKeys.GameBoxRenderer]
    )

    return container
  }
}