import { Logger } from '../utils/Logger'

export enum EventSource {
    UI = 'ui',
    Keyboard = 'keyboard',
    Mouse = 'mouse',
    Gamepad = 'gamepad',
    VRController = 'vr-controller',
    System = 'system',
    ManagedLight = 'managed-light'
}

export interface BaseInteractionEvent {
    timestamp: number
    source: EventSource
}

export class EventManager extends EventTarget {
    private static instance: EventManager
    private static readonly logger = Logger.withContext(EventManager.name)
    
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
    
    public emit<T extends BaseInteractionEvent>(
        eventType: string, 
        detail: T,
        source: T['source'] = EventSource.System as T['source']
    ): boolean {
        const event = new CustomEvent(eventType, {
            detail: {
                ...detail,
                timestamp: Date.now(),
                source
            }
        })
        
        EventManager.logger.debug(`Emitting event: ${eventType}`, { detail })
        return this.dispatchEvent(event)
    }
    
    public registerEventHandler<T extends BaseInteractionEvent>(
        eventType: string,
        handler: (event: CustomEvent<T>) => void,
        options?: AddEventListenerOptions
    ): void {
        this.addEventListener(eventType, handler as EventListener, options)
    }
    
    public deregisterEventHandler<T extends BaseInteractionEvent>(
        eventType: string,
        handler: (event: CustomEvent<T>) => void,
        options?: EventListenerOptions
    ): void {
        this.removeEventListener(eventType, handler as EventListener, options)
    }
    
    public registerOnceHandler<T extends BaseInteractionEvent>(
        eventType: string,
        handler: (event: CustomEvent<T>) => void
    ): void {
        this.registerEventHandler(eventType, handler, { once: true })
    }
    
    public removeAllListeners(eventType?: string): void {
        if (eventType) {
            EventManager.logger.debug(`Requested removal of all listeners for: ${eventType}`)
        } else {
            EventManager.logger.debug('Requested removal of all listeners')
        }
    }
    
    public dispose(): void {
        this.removeAllListeners()
        EventManager.logger.info('EventManager disposed')
    }
}

export const eventManager = EventManager.getInstance()
