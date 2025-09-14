/**
 * Image management layer for downloading and caching game artwork
 * Handles IndexedDB storage and image processing
 */

export interface ImageCacheEntry {
    blob: Blob;
    url: string;
    timestamp: number;
    size: number;
}

export interface ImageLoadOptions {
    timeout: number;
    enableFallback: boolean;
    onImageLoaded?: (url: string, blob: Blob) => void;
    onImageError?: (url: string, error: Error) => void;
}

export interface StorageQuotaInfo {
    usage: number;
    quota: number;
    usagePercent: number;
    usageMB: number;
    quotaMB: number;
    available: number;
    isNearLimit: boolean;
    isSupported: boolean;
}

export interface ImageCacheStats {
    totalImages: number;
    totalSize: number;
    oldestTimestamp: number;
    newestTimestamp: number;
    storageQuota?: StorageQuotaInfo;
}

export class ImageManager {
    private db: IDBDatabase | null = null;
    private readonly dbName = 'SteamGameImages';
    private readonly dbVersion = 1;
    private readonly storeName = 'gameImages';
    private readonly QUOTA_WARNING_THRESHOLD = 0.8; // 80%
    private readonly QUOTA_CRITICAL_THRESHOLD = 0.95; // 95%

    constructor() {
        this.initializeDB();
    }

    async downloadImage(url: string, options: Partial<ImageLoadOptions> = {}): Promise<Blob | null> {
        const opts: ImageLoadOptions = {
            timeout: 10000,
            enableFallback: true,
            ...options
        };

        try {
            // Check cache first
            const cached = await this.getFromCache(url);
            if (cached?.blob) {
                opts.onImageLoaded?.(url, cached.blob);
                return cached.blob;
            }

            // Download with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

            const response = await fetch(url, {
                signal: controller.signal,
                mode: 'cors'
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const blob = await response.blob();
            
            if (!blob.type.startsWith('image/')) {
                throw new Error(`Invalid content type: ${blob.type}`);
            }

            await this.cacheImage(url, blob);
            opts.onImageLoaded?.(url, blob);
            return blob;

        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error('Unknown error');
            opts.onImageError?.(url, errorObj);
            
            return opts.enableFallback ? null : (() => { throw errorObj; })();
        }
    }

    async downloadGameArtwork(
        artworkUrls: Record<string, string>,
        options: Partial<ImageLoadOptions> = {}
    ): Promise<Record<string, Blob | null>> {
        const results: Record<string, Blob | null> = {};

        for (const [type, url] of Object.entries(artworkUrls)) {
            if (url && url.trim() !== '') {
                results[type] = await this.downloadImage(url, options);
                // Small delay between downloads
                await new Promise(resolve => setTimeout(resolve, 100));
            } else {
                // TODO: try something different
                console.warn(`Skipping empty or invalid URL for ${type}`);
                // Skip empty or invalid URLs
                results[type] = null;
            }
        }

        return results;
    }

    async getStats(): Promise<ImageCacheStats> {
        if (!this.db) return { totalImages: 0, totalSize: 0, oldestTimestamp: 0, newestTimestamp: 0 };

        return new Promise<ImageCacheStats>((resolve, reject) => {
            if (!this.db) {
                resolve({ totalImages: 0, totalSize: 0, oldestTimestamp: 0, newestTimestamp: 0 });
                return;
            }
            
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            
            request.onsuccess = async () => {
                const images = request.result as ImageCacheEntry[];
                
                if (images.length === 0) {
                    const storageQuota = await this.getStorageQuotaInfo(0);
                    resolve({ 
                        totalImages: 0, 
                        totalSize: 0, 
                        oldestTimestamp: 0, 
                        newestTimestamp: 0,
                        storageQuota 
                    });
                    return;
                }
                
                const totalSize = images.reduce((sum, img) => sum + img.size, 0);
                const timestamps = images.map(img => img.timestamp);
                const storageQuota = await this.getStorageQuotaInfo(totalSize);
                
                resolve({
                    totalImages: images.length,
                    totalSize,
                    oldestTimestamp: Math.min(...timestamps),
                    newestTimestamp: Math.max(...timestamps),
                    storageQuota
                });
            };
            
            request.onerror = () => reject(new Error('Failed to get image cache stats'));
        });
    }

    async clearCache(): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve();
                return;
            }
            
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error('Failed to clear image cache'));
        });
    }

    private async initializeDB(): Promise<void> {
        return new Promise((resolve) => {
            if (typeof indexedDB === 'undefined') {
                resolve(); // Gracefully handle missing IndexedDB
                return;
            }

            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => resolve(); // Don't fail on DB errors
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'url' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('size', 'size', { unique: false });
                }
            };
        });
    }

    private async cacheImage(url: string, blob: Blob): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve) => {
            if (!this.db) {
                resolve();
                return;
            }
            
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const entry: ImageCacheEntry = {
                url,
                blob,
                timestamp: Date.now(),
                size: blob.size
            };
            
            const request = store.put(entry);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve(); // Don't fail on cache errors
        });
    }

    private async getFromCache(url: string): Promise<ImageCacheEntry | null> {
        if (!this.db) return null;

        return new Promise((resolve) => {
            if (!this.db) {
                resolve(null);
                return;
            }
            
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(url);
            
            request.onsuccess = () => {
                const result = request.result as ImageCacheEntry | undefined;
                
                if (result) {
                    // Check if cache is valid (24 hours)
                    const cacheAge = Date.now() - result.timestamp;
                    const imageCacheDuration = 24 * 60 * 60 * 1000;
                    
                    if (cacheAge < imageCacheDuration) {
                        resolve(result);
                    } else {
                        // Remove expired entry
                        this.removeFromCache(url);
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = () => resolve(null);
        });
    }

    private async removeFromCache(url: string): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve) => {
            if (!this.db) {
                resolve();
                return;
            }
            
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(url);
            
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
        });
    }

    private async getStorageQuotaInfo(totalUsed: number): Promise<StorageQuotaInfo> {
        if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
            return {
                usage: totalUsed,
                quota: 0,
                usagePercent: 0,
                usageMB: totalUsed / (1024 * 1024),
                quotaMB: 0,
                available: 0,
                isNearLimit: false,
                isSupported: false
            };
        }

        try {
            const estimate = await navigator.storage.estimate();
            const { quota = 0, usage = 0 } = estimate;
            const quotaMB = quota / (1024 * 1024);
            const usageMB = usage / (1024 * 1024);
            const available = quota - usage;
            const usagePercent = quota > 0 ? (usage / quota) * 100 : 0;
            const isNearLimit = quota > 0 && (usage / quota) > this.QUOTA_WARNING_THRESHOLD;
            const isSupported = quota > 0;

            return {
                usage,
                quota,
                usagePercent,
                usageMB,
                quotaMB,
                available,
                isNearLimit,
                isSupported
            };
        } catch {
            return {
                usage: totalUsed,
                quota: 0,
                usagePercent: 0,
                usageMB: totalUsed / (1024 * 1024),
                quotaMB: 0,
                available: 0,
                isNearLimit: false,
                isSupported: false
            };
        }
    }
}
