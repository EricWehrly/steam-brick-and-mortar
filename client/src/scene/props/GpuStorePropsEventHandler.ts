/**
 * GPU Store Props Event Handler - High-Performance Event Handler
 * 
 * Registers as an override handler for store props events IF the system
 * has the required capabilities (WebGL2 + instanced arrays).
 * 
 * Wraps the GpuStorePropsRenderer for high-performance GPU-based rendering.
 * Falls back to default handler if initialization or rendering fails.
 */

import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { GpuStorePropsRenderer } from '../GpuStorePropsRenderer'
import { Logger } from '../../utils/Logger'
import { StorePropsEventTypes, type StorePropsSetupRequestEvent, type StorePropsSetupStartedEvent, type StorePropsSetupCompletedEvent, type StorePropsClearRequestEvent, type StorePropsAtmosphericRequestEvent } from './PropsEvents'
import { EventSource } from '../../core/EventManager'
import { hasWebGL2, hasInstancedArrays, hasHardwareRenderer, supportsLargeTextures } from '../../utils/SystemCapabilities'
import { RoomEventTypes, type RoomResizedEvent } from '../../types/InteractionEvents'
import { PropRenderer } from '../PropRenderer'

// TODO: I think this can just be merged down into the gpu renderer class.
// This is an added layer, separating out the event handling, but could be slim enough to sit inside the class proper
export class GpuStorePropsEventHandler {
    private static readonly logger = Logger.createLogFunctions(GpuStorePropsEventHandler.name)
    private eventManager: EventManager
    private renderer: GpuStorePropsRenderer | null = null
    private isCapable: boolean
    private entranceMat: THREE.Group | null = null
    private scene: THREE.Scene | null = null
    
    static {
        new GpuStorePropsEventHandler();
    }
        
    // TODO: enforce only one exists
    private constructor() {
        this.eventManager = EventManager.getInstance()
        this.isCapable = this.checkCapabilities()
        
        if (this.isCapable) {
            this.registerAsReplacement()
            GpuStorePropsEventHandler.logger.info('GpuStorePropsEventHandler initialized and registered as replacement (system is capable)')
        } else {
            GpuStorePropsEventHandler.logger.info('GpuStorePropsEventHandler not registered - system lacks required capabilities')
        }
        
        // Listen for room resize events to reposition entrance mat
        this.eventManager.registerEventHandler(RoomEventTypes.Resized, this.handleRoomResized.bind(this))
    }
    
    private checkCapabilities(): boolean {
        const hasRequiredFeatures = hasWebGL2() && hasInstancedArrays() && hasHardwareRenderer()
        const hasLargeTextures = supportsLargeTextures()
        
        GpuStorePropsEventHandler.logger.debug('Capability check:', {
            hasWebGL2: hasWebGL2(),
            hasInstancedArrays: hasInstancedArrays(), 
            hasHardwareRenderer: hasHardwareRenderer(),
            supportsLargeTextures: hasLargeTextures,
            overall: hasRequiredFeatures
        })
        
        // Warn if missing large texture support but proceed anyway
        if (hasRequiredFeatures && !hasLargeTextures) {
            GpuStorePropsEventHandler.logger.warn('System meets core requirements but lacks large texture support - proceeding with potential performance impact')
        }
        
        // Only fail if missing core requirements (WebGL2, instanced arrays, hardware renderer)
        return hasRequiredFeatures
    }
    
    private registerAsReplacement(): void {
        // Register as override handler to replace default handler when system is capable
        this.eventManager.registerOverrideHandler(
            StorePropsEventTypes.SetupRequest,
            this.handleSetupRequest.bind(this)
        )
        
        this.eventManager.registerOverrideHandler(
            StorePropsEventTypes.ClearRequest,
            this.handleClearRequest.bind(this)
        )
        
        this.eventManager.registerOverrideHandler(
            StorePropsEventTypes.AtmosphericRequest,
            this.handleAtmosphericRequest.bind(this)
        )
        
        GpuStorePropsEventHandler.logger.debug('Registered as override handler for store props events')
    }
    
    private async handleSetupRequest(event: CustomEvent<StorePropsSetupRequestEvent>): Promise<void> {
        const startTime = performance.now()
        const { config } = event.detail
        
        try {
            GpuStorePropsEventHandler.logger.info('Handling store props setup request with instanced renderer')
            
            // Initialize instanced renderer if not already done
            if (!this.renderer) {
                // Get dependencies from singletons - no DI through events
                const { DataManager } = await import('../../core/data')
                const dataManager = DataManager.getInstance()
                const scene = dataManager.get<THREE.Scene>('core.mainScene')
                
                if (!scene) {
                    throw new Error('Main scene not available in DataManager')
                }
                
                // Create renderer with own GameBoxRenderer (composition, not injection)
                this.renderer = new GpuStorePropsRenderer(scene)
            }
            
            // Emit setup started event
            this.eventManager.emit<StorePropsSetupStartedEvent>(StorePropsEventTypes.SetupStarted, {
                timestamp: Date.now(),
                source: EventSource.System
            })
            
            // Perform instanced setup
            await this.renderer.setupProps(config as any)
            
            const endTime = performance.now()
            const setupTimeMs = endTime - startTime
            
            // Emit completion event
            this.eventManager.emit<StorePropsSetupCompletedEvent>(StorePropsEventTypes.SetupCompleted, {
                timestamp: Date.now(),
                source: EventSource.System
            })
            
            GpuStorePropsEventHandler.logger.info(`Instanced store props setup completed in ${setupTimeMs.toFixed(2)}ms`)
            
        } catch (error) {
            GpuStorePropsEventHandler.logger.warn('Instanced store props setup failed, falling back to default:', error)
            
            // Clean up failed renderer
            if (this.renderer) {
                try {
                    this.renderer.dispose()
                } catch (disposeError) {
                    GpuStorePropsEventHandler.logger.error('Failed to dispose renderer during fallback:', disposeError)
                }
                this.renderer = null
            }
            
            // Note: Default handler will be used for subsequent events since override failed
            GpuStorePropsEventHandler.logger.warn('Setup failed - default handler will handle future requests')
        }
    }
    
    // TODO: This wrapping is unnecessary
    private async handleClearRequest(event: CustomEvent<StorePropsClearRequestEvent>): Promise<void> {
        try {
            if (this.renderer) {
                this.renderer.clearProps()
                GpuStorePropsEventHandler.logger.debug('Instanced store props cleared')
            }
        } catch (error) {
            GpuStorePropsEventHandler.logger.warn('Instanced clear failed:', error);
            // Note: Default handler will be used for subsequent requests
        }
    }
    
    private async handleAtmosphericRequest(event: CustomEvent<StorePropsAtmosphericRequestEvent>): Promise<void> {
        try {
            if (this.renderer) {
                await this.renderer.addAtmosphericProps()
                GpuStorePropsEventHandler.logger.debug('Instanced atmospheric props added')
            }
        } catch (error) {
            GpuStorePropsEventHandler.logger.warn('Instanced atmospheric props failed:', error);
            // Note: Default handler will be used for subsequent requests
        }
    }

    
    private async handleRoomResized(event: CustomEvent<RoomResizedEvent>): Promise<void> {
        const { dimensions } = event.detail
        
        // Get scene reference if we don't have it yet
        if (!this.scene && this.renderer) {
            const { DataManager } = await import('../../core/data')
            const dataManager = DataManager.getInstance()
            this.scene = dataManager.get<THREE.Scene>('core.mainScene')
        }
        
        if (!this.scene) {
            GpuStorePropsEventHandler.logger.warn('Cannot create entrance mat - no scene reference')
            return
        }
        
        // Remove old entrance mat if it exists
        if (this.entranceMat) {
            this.scene.remove(this.entranceMat)
            this.entranceMat = null
        }
        
        // Create new entrance mat where player spawns (inside the store)
        const propRenderer = new PropRenderer(this.scene)
        this.entranceMat = propRenderer.createEntranceFloorMat(dimensions.width, dimensions.depth)
        
    // Position at origin - keep entrance mat/player spawn fixed at (0,0,0)
    // Room/front wall will be offset instead to encapsulate the mat
    this.entranceMat.position.set(0, 0, 0)
        
    this.scene.add(this.entranceMat)
    GpuStorePropsEventHandler.logger.debug(`🚪 Entrance mat positioned at origin (0,0,0) - player spawn`) 
    }
    
    public dispose(): void {
        if (this.renderer) {
            this.renderer.dispose()
            this.renderer = null
        }
        
        if (this.entranceMat && this.scene) {
            this.scene.remove(this.entranceMat)
            this.entranceMat = null
        }
        
        GpuStorePropsEventHandler.logger.info('GpuStorePropsEventHandler disposed')
    }
}
