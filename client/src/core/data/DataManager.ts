/**
 * Centralized Data Management System
 * 
 * Single source of truth for application data with type safety,
 * meta-keying, dynamic lookups, and future persistence support.
 * 
 * Phase 1 Implementation:
 * - Basic string->object mapping with type safety
 * - Domain-based meta-keying for data organization
 * - Singleton pattern for global access
 * - Event integration for automatic updates
 */

import { EventManager, EventSource, type BaseInteractionEvent } from '../EventManager'
import type { 
    DataDomain, 
    DataEntry, 
    DataMetadata, 
    DataProvider, 
    DataManagerConfig,
    DataChangeEvent 
} from './DataTypes'

// Data-specific events that extend BaseInteractionEvent
interface DataEvent extends BaseInteractionEvent {
    key: string
    domain: DataDomain
}

interface DataChangeEventDetail<T = any> extends DataEvent {
    oldValue?: T
    newValue: T
}

interface DataDeletedEventDetail extends DataEvent {}

interface DataClearedEventDetail extends BaseInteractionEvent {
    entriesCleared: number
}

export class DataManager {
    private static instance: DataManager | null = null
    private store = new Map<string, DataEntry>()
    private metaStore = new Map<DataDomain, Set<string>>()
    private dynamicProviders = new Map<string, DataProvider>()
    private eventManager: EventManager
    private config: DataManagerConfig

    private constructor(config: DataManagerConfig = {}) {
        this.config = {
            enablePersistence: false,
            defaultTTL: undefined,
            maxEntries: 10000,
            ...config
        }
        this.eventManager = EventManager.getInstance()
        
        console.debug('📊 DataManager initialized')
    }

    /**
     * Get singleton instance
     */
    public static getInstance(config?: DataManagerConfig): DataManager {
        if (!DataManager.instance) {
            DataManager.instance = new DataManager(config)
        }
        return DataManager.instance
    }

    /**
     * Store data with type safety and metadata
     */
    public set<T>(key: string, value: T, metadata: DataMetadata): void {
        const oldEntry = this.store.get(key)
        const now = Date.now()
        
        const entry: DataEntry<T> = {
            value,
            metadata,
            timestamp: now,
            expiresAt: metadata.ttl ? now + metadata.ttl : undefined
        }
        
        this.store.set(key, entry)
        
        // Update meta-store for domain tracking
        if (!this.metaStore.has(metadata.domain)) {
            this.metaStore.set(metadata.domain, new Set())
        }
        this.metaStore.get(metadata.domain)!.add(key)
        
        // Emit change event using DOM events
        const changeDetail: DataChangeEventDetail<T> = {
            key,
            oldValue: oldEntry?.value,
            newValue: value,
            domain: metadata.domain,
            timestamp: now,
            source: EventSource.System
        }
        
        window.dispatchEvent(new CustomEvent('data:changed', { detail: changeDetail }))
        
        console.debug(`📊 Stored data: ${key} (domain: ${metadata.domain})`)
    }

    /**
     * Retrieve data with type safety
     */
    public get<T>(key: string): T | undefined {
        const entry = this.store.get(key)
        
        if (!entry) {
            return undefined
        }
        
        // Check expiration
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.delete(key)
            return undefined
        }
        
        return entry.value as T
    }

    /**
     * Retrieve data with fallback value
     */
    public getOrDefault<T>(key: string, defaultValue: T): T {
        const value = this.get<T>(key)
        return value !== undefined ? value : defaultValue
    }

    /**
     * Check if key exists and is not expired
     */
    public has(key: string): boolean {
        const entry = this.store.get(key)
        
        if (!entry) {
            return false
        }
        
        // Check expiration
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.delete(key)
            return false
        }
        
        return true
    }

    /**
     * Delete data entry
     */
    public delete(key: string): boolean {
        const entry = this.store.get(key)
        
        if (!entry) {
            return false
        }
        
        // Remove from meta-store
        const domainKeys = this.metaStore.get(entry.metadata.domain)
        if (domainKeys) {
            domainKeys.delete(key)
            if (domainKeys.size === 0) {
                this.metaStore.delete(entry.metadata.domain)
            }
        }
        
        const deleted = this.store.delete(key)
        
        if (deleted) {
            const deleteDetail: DataDeletedEventDetail = {
                key,
                domain: entry.metadata.domain,
                timestamp: Date.now(),
                source: EventSource.System
            }
            
            window.dispatchEvent(new CustomEvent('data:deleted', { detail: deleteDetail }))
            console.debug(`📊 Deleted data: ${key}`)
        }
        
        return deleted
    }

    /**
     * Get all keys for a specific domain
     */
    public getKeysByDomain(domain: DataDomain): string[] {
        const keys = this.metaStore.get(domain)
        return keys ? Array.from(keys) : []
    }

    /**
     * Get all data for a specific domain
     */
    public getDataByDomain<T = any>(domain: DataDomain): Record<string, T> {
        const keys = this.getKeysByDomain(domain)
        const result: Record<string, T> = {}
        
        for (const key of keys) {
            const value = this.get<T>(key)
            if (value !== undefined) {
                result[key] = value
            }
        }
        
        return result
    }

    /**
     * Clear all data for a specific domain
     */
    public clearDomain(domain: DataDomain): number {
        const keys = this.getKeysByDomain(domain)
        let deletedCount = 0
        
        for (const key of keys) {
            if (this.delete(key)) {
                deletedCount++
            }
        }
        
        console.debug(`📊 Cleared ${deletedCount} entries from domain: ${domain}`)
        return deletedCount
    }

    /**
     * Get all available domains
     */
    public getDomains(): DataDomain[] {
        return Array.from(this.metaStore.keys())
    }

    /**
     * Get metadata for a key
     */
    public getMetadata(key: string): DataMetadata | undefined {
        const entry = this.store.get(key)
        return entry?.metadata
    }

    /**
     * Get all keys (optionally filtered by domain)
     */
    public getAllKeys(domain?: DataDomain): string[] {
        if (domain) {
            return this.getKeysByDomain(domain)
        }
        return Array.from(this.store.keys())
    }

    /**
     * Clear all data
     */
    public clear(): void {
        const totalEntries = this.store.size
        this.store.clear()
        this.metaStore.clear()
        this.dynamicProviders.clear()
        
        const clearDetail: DataClearedEventDetail = {
            entriesCleared: totalEntries,
            timestamp: Date.now(),
            source: EventSource.System
        }
        
        window.dispatchEvent(new CustomEvent('data:cleared', { detail: clearDetail }))
        
        console.debug(`📊 Cleared all data (${totalEntries} entries)`)
    }

    /**
     * Get statistics about data storage
     */
    public getStats(): {
        totalEntries: number
        domains: number
        providers: number
        memoryUsage: string
    } {
        return {
            totalEntries: this.store.size,
            domains: this.metaStore.size,
            providers: this.dynamicProviders.size,
            memoryUsage: `~${Math.round(JSON.stringify(Array.from(this.store.entries())).length / 1024)}KB`
        }
    }

    /**
     * Cleanup expired entries
     */
    public cleanup(): number {
        const now = Date.now()
        const expiredKeys: string[] = []
        
        for (const [key, entry] of this.store.entries()) {
            if (entry.expiresAt && now > entry.expiresAt) {
                expiredKeys.push(key)
            }
        }
        
        for (const key of expiredKeys) {
            this.delete(key)
        }
        
        if (expiredKeys.length > 0) {
            console.debug(`📊 Cleaned up ${expiredKeys.length} expired entries`)
        }
        
        return expiredKeys.length
    }

    /**
     * Reset singleton instance (for testing)
     */
    public static resetInstance(): void {
        DataManager.instance = null
    }
}

// Re-export types for convenience
export type { DataDomain, DataMetadata, DataProvider, DataChangeEvent } from './DataTypes'