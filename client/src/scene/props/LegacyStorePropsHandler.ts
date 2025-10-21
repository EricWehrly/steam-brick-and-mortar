/**
 * Legacy Store Props Handler
 * 
 * Registers as the default handler for store props events.
 * Wraps the LegacyStorePropsRenderer and provides event-driven interface.
 * 
 * This handler is always available and provides baseline functionality
 * for systems that don't support advanced GPU features.
 */

import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { LegacyStorePropsRenderer } from '../LegacyStorePropsRenderer'
import { Logger } from '../../utils/Logger'
import { StorePropsEventTypes, type StorePropsSetupRequestEvent, type StorePropsSetupStartedEvent, type StorePropsSetupCompletedEvent, type StorePropsClearRequestEvent, type StorePropsAtmosphericRequestEvent } from './PropsEvents'
import { EventSource } from '../../core/EventManager'

export class LegacyStorePropsHandler {
    private static readonly logger = Logger.withContext(LegacyStorePropsHandler.name)
    private eventManager: EventManager
    private renderer: LegacyStorePropsRenderer | null = null
    
    static {
        new LegacyStorePropsHandler();
    }
    
    private constructor() {
        this.eventManager = EventManager.getInstance()
        this.registerAsDefault()
        LegacyStorePropsHandler.logger.info('LegacyStorePropsHandler initialized and registered as default')
    }
    
    private registerAsDefault(): void {
        // Register as default handler for all store props events
        this.eventManager.registerDefaultHandler(
            StorePropsEventTypes.SetupRequest,
            this.handleSetupRequest.bind(this)
        )
        
        this.eventManager.registerDefaultHandler(
            StorePropsEventTypes.ClearRequest,
            this.handleClearRequest.bind(this)
        )
        
        this.eventManager.registerDefaultHandler(
            StorePropsEventTypes.AtmosphericRequest,
            this.handleAtmosphericRequest.bind(this)
        )
        
        LegacyStorePropsHandler.logger.debug('Registered as default handler for store props events')
    }
    
    private async handleSetupRequest(event: CustomEvent<StorePropsSetupRequestEvent>): Promise<void> {
        const startTime = performance.now()
        const { config } = event.detail
        
        try {
            LegacyStorePropsHandler.logger.info('Handling store props setup request with legacy renderer')
            
            // NOTE: This handler only runs when NO override handler (GpuStorePropsEventHandler) is registered
            // If system has GPU capabilities, GpuStorePropsEventHandler registers as override and this won't be called
            
            // Initialize legacy renderer if not already done
            if (!this.renderer) {
                // Get dependencies from singletons - no DI through events
                const { DataManager } = await import('../../core/data')
                const dataManager = DataManager.getInstance()
                const scene = dataManager.get<THREE.Scene>('core.mainScene')
                
                if (!scene) {
                    throw new Error('Main scene not available in DataManager')
                }
                
                // Create renderer with own GameBoxRenderer (composition, not injection)
                this.renderer = new LegacyStorePropsRenderer(scene, dataManager)
            }
            
            // Emit setup started event
            this.eventManager.emit<StorePropsSetupStartedEvent>(StorePropsEventTypes.SetupStarted, {
                timestamp: Date.now(),
                source: EventSource.System
            })
            
            // Perform legacy setup (cast readonly config to mutable for compatibility)
            await this.renderer.setupProps(config as any)
            
            const endTime = performance.now()
            const setupTimeMs = endTime - startTime
            
            // Emit completion event with performance data
            this.eventManager.emit<StorePropsSetupCompletedEvent>(StorePropsEventTypes.SetupCompleted, {
                timestamp: Date.now(),
                source: EventSource.System
            })
            
            LegacyStorePropsHandler.logger.info(`Legacy store props setup completed in ${setupTimeMs.toFixed(2)}ms`)
            
        } catch (error) {
            LegacyStorePropsHandler.logger.error('Legacy store props setup failed:', error)
            // Don't re-throw - this is the fallback handler
        }
    }
    
    private async handleClearRequest(event: CustomEvent<StorePropsClearRequestEvent>): Promise<void> {
        if (this.renderer) {
            this.renderer.clearProps()
            LegacyStorePropsHandler.logger.debug('Legacy store props cleared')
        }
    }
    
    private async handleAtmosphericRequest(event: CustomEvent<StorePropsAtmosphericRequestEvent>): Promise<void> {
        if (this.renderer) {
            await this.renderer.addAtmosphericProps()
            LegacyStorePropsHandler.logger.debug('Legacy atmospheric props added')
        }
    }

    
    public dispose(): void {
        if (this.renderer) {
            this.renderer.dispose()
            this.renderer = null
        }
        LegacyStorePropsHandler.logger.info('LegacyStorePropsHandler disposed')
    }
}