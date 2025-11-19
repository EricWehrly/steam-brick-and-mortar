import { Logger } from '../utils/Logger'

export enum EventSource {
    UI = 'ui',
    // TODO: Why won't "input device" suffice?
    Keyboard = 'keyboard',
    Mouse = 'mouse',
    Gamepad = 'gamepad',
    VRController = 'vr-controller',
    System = 'system',
    ManagedLight = 'managed-light'
}

export interface BaseInteractionEvent {
    // TODO: Remove these optional markers after migrating all emit() calls to not provide timestamp/source
    timestamp?: number
    source?: EventSource
}

export interface EventHandlerOptions extends AddEventListenerOptions {
    /** Register as default handler - only used if no other handlers exist */
    isDefault?: boolean
    /** Register as override handler - removes existing handlers first */
    isOverride?: boolean
}

// Type alias for cleaner code
type HandlerFunction = (event: CustomEvent<BaseInteractionEvent>) => void

export class EventManager extends EventTarget {
    private static instance: EventManager
    private static readonly logger = Logger.withContext(EventManager.name)
    
    // Simplified tracking
    private registeredHandlers = new Map<string, Set<HandlerFunction>>()
    private normalHandlers = new Map<string, Set<HandlerFunction>>()
    private defaultHandlers = new Map<string, Set<HandlerFunction>>()
    
    private constructor() {
        super()
        EventManager.logger.info('EventManager initialized')
    }
    
    public static getInstance(): EventManager {
        if (!EventManager.instance) {
            EventManager.instance = new EventManager()
        }
        return EventManager.instance
    }
    
    /**
     * Emit an event with automatic timestamp generation.
     * Note: The timestamp field will be automatically set to Date.now() - 
     * consuming classes should not provide their own timestamp value.
     */
    public emit<T extends BaseInteractionEvent>(
        eventType: string, 
        detail?: T,
        source: T['source'] = EventSource.System as T['source']
    ): boolean {
        const eventDetail = {
            ...(detail || {}),
            timestamp: Date.now(),
            source: detail?.source || source
        }
        
        const event = new CustomEvent(eventType, { detail: eventDetail })
        
        // Only log non-noisy events (skip high-frequency events like game-loaded)
        if (!eventType.includes('game-loaded') && !eventType.includes(':progress')) {
            EventManager.logger.debug(`Emitting event: ${eventType}`, { detail: eventDetail })
        }
        return this.dispatchEvent(event)
    }
    
    public registerEventHandler<T extends BaseInteractionEvent>(
        eventType: string,
        handler: (event: CustomEvent<T>) => void,
        options?: EventHandlerOptions
    ): void {
        const typedHandler = handler as HandlerFunction
        const normalCount = this.normalHandlers.get(eventType)?.size ?? 0
        const defaultCount = this.defaultHandlers.get(eventType)?.size ?? 0
        
        if (options?.isDefault) {
            if (normalCount > 0) {
                EventManager.logger.warn(`Skipping default handler for ${eventType}, normal handlers already exist`)
                return
            }
            this.addToHandlerMap(this.defaultHandlers, eventType, typedHandler)
            
        } else if (options?.isOverride) {
            if (defaultCount > 0) {
                this.removeDefaultHandlers(eventType)
                EventManager.logger.debug(`Removed default handlers for override: ${eventType}`)
            }
            this.addToHandlerMap(this.normalHandlers, eventType, typedHandler)
            
        } else {
            if (defaultCount > 0) {
                this.removeDefaultHandlers(eventType)
                EventManager.logger.debug(`Replaced default handlers with normal handler: ${eventType}`)
            }
            this.addToHandlerMap(this.normalHandlers, eventType, typedHandler)
        }
        
        this.addEventListener(eventType, handler as EventListener, options)
        this.addToHandlerMap(this.registeredHandlers, eventType, typedHandler)
        
        // Only log registration for important/infrequent events
        if (!eventType.includes(':progress') && !eventType.includes('game-loaded')) {
            const handlerType = options?.isDefault ? 'default' : options?.isOverride ? 'override' : 'normal'
            EventManager.logger.debug(`Registered ${handlerType} handler for: ${eventType}`)
        }
    }
    
    private addToHandlerMap(map: Map<string, Set<HandlerFunction>>, eventType: string, handler: HandlerFunction): void {
        if (!map.has(eventType)) {
            map.set(eventType, new Set())
        }
        map.get(eventType)?.add(handler)
    }
    
    private removeFromHandlerMap(map: Map<string, Set<HandlerFunction>>, eventType: string, handler: HandlerFunction): boolean {
        const handlers = map.get(eventType)
        if (handlers?.has(handler)) {
            handlers.delete(handler)
            if (handlers.size === 0) {
                map.delete(eventType)
            }
            return true
        }
        return false
    }
    
    private removeDefaultHandlers(eventType: string): void {
        const defaultHandlers = this.defaultHandlers.get(eventType)
        if (defaultHandlers) {
            for (const handler of defaultHandlers) {
                this.removeEventListener(eventType, handler as EventListener)
                this.removeFromHandlerMap(this.registeredHandlers, eventType, handler)
            }
            this.defaultHandlers.delete(eventType)
        }
    }
    
    public deregisterEventHandler<T extends BaseInteractionEvent>(
        eventType: string,
        handler: (event: CustomEvent<T>) => void,
        options?: EventListenerOptions
    ): void {
        const typedHandler = handler as HandlerFunction
        this.removeEventListener(eventType, handler as EventListener, options)
        
        // Remove from all tracking maps
        this.removeFromHandlerMap(this.registeredHandlers, eventType, typedHandler)
        this.removeFromHandlerMap(this.normalHandlers, eventType, typedHandler)
        this.removeFromHandlerMap(this.defaultHandlers, eventType, typedHandler)
    }
    
    private removeAllListenersForEvent(eventType: string): void {
        const handlers = this.registeredHandlers.get(eventType)
        if (handlers) {
            for (const handler of handlers) {
                this.removeEventListener(eventType, handler as EventListener)
            }
        }
        
        // Clean up all tracking consistently
        this.registeredHandlers.delete(eventType)
        this.normalHandlers.delete(eventType)
        this.defaultHandlers.delete(eventType)
    }
    
    public removeAllListeners(eventType?: string): void {
        if (eventType) {
            this.removeAllListenersForEvent(eventType)
            EventManager.logger.debug(`Removed all listeners for: ${eventType}`)
        } else {
            // Remove all listeners for all events
            for (const eventType of this.registeredHandlers.keys()) {
                this.removeAllListenersForEvent(eventType)
            }
            // Final cleanup
            this.registeredHandlers.clear()
            this.normalHandlers.clear()
            this.defaultHandlers.clear()
            EventManager.logger.debug('Removed all listeners')
        }
    }
    
    // Backward compatibility methods
    public registerDefaultHandler<T extends BaseInteractionEvent>(
        eventType: string,
        handler: (event: CustomEvent<T>) => void
    ): void {
        this.registerEventHandler(eventType, handler, { isDefault: true })
    }
    
    public registerOverrideHandler<T extends BaseInteractionEvent>(
        eventType: string,
        handler: (event: CustomEvent<T>) => void
    ): void {
        this.registerEventHandler(eventType, handler, { isOverride: true })
    }

    public dispose(): void {
        this.removeAllListeners()
        EventManager.logger.info('EventManager disposed')
    }
}
