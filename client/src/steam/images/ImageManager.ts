/**
 * Image management layer for downloading and caching game artwork
 * Handles IndexedDB storage and image processing
 */

export interface ImageCacheEntry {
    blob: Blob;
    url: string;
    timestamp: number;
    size: number;
    artworkType?: string;        // Optional: tracks which artwork type this is (header, library, etc)
    originalType?: string;        // Optional: if fallback used, what was the original requested type
    isFallback?: boolean;         // Optional: true if this was loaded from a fallback URL
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
    private static _instance: ImageManager | null = null;
    
    private db: IDBDatabase | null = null;
    private readonly dbName = 'SteamGameImages';
    private readonly dbVersion = 1;
    private readonly storeName = 'gameImages';
    private readonly QUOTA_WARNING_THRESHOLD = 0.8; // 80%
    private readonly QUOTA_CRITICAL_THRESHOLD = 0.95; // 95%
    
    // Artwork type priority for fallbacks (best quality to lowest)
    private readonly ARTWORK_PRIORITY = ['library', 'header', 'logo', 'icon'] as const;

    constructor() {
        this.initializeDB();
    }

    public static getInstance(): ImageManager {
        if (!ImageManager._instance) {
            ImageManager._instance = new ImageManager();
        }
        return ImageManager._instance;
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
                // Validate cached blob to ensure it's not corrupted
                const isValid = await this.validateImageBlob(cached.blob, url);
                if (!isValid) {
                    console.warn(`⚠️ [ImageManager] Cached image is invalid, removing from cache: ${url}`);
                    await this.removeFromCache(url);
                    // Continue to re-download
                } else {
                    opts.onImageLoaded?.(url, cached.blob);
                    return cached.blob;
                }
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
                const blob = await this.downloadImage(url, options);
                
                // If download succeeded, validate it
                if (blob) {
                    const isValid = await this.validateImageBlob(blob, url);
                    if (isValid) {
                        results[type] = blob;
                    } else {
                        console.warn(`⚠️ [ImageManager] Downloaded image for ${type} failed validation from ${url}`);
                        // Try fallback URLs for this type
                        const fallbackBlob = await this.tryFallbackArtwork(type, artworkUrls, url, options);
                        results[type] = fallbackBlob;
                    }
                } else {
                    console.warn(`⚠️ [ImageManager] Failed to download ${type} from ${url}`);
                    // Try fallback URLs for this type
                    const fallbackBlob = await this.tryFallbackArtwork(type, artworkUrls, url, options);
                    results[type] = fallbackBlob;
                }
                
                // Small delay between downloads
                await new Promise(resolve => setTimeout(resolve, 100));
            } else {
                console.warn(`Skipping empty or invalid URL for ${type}`);
                results[type] = null;
            }
        }

        return results;
    }
    
    /**
     * Try alternative artwork URLs when primary URL fails
     * Uses priority ordering: library > header > logo > icon
     */
    private async tryFallbackArtwork(
        failedType: string,
        artworkUrls: Record<string, string>,
        failedUrl: string,
        options: Partial<ImageLoadOptions>
    ): Promise<Blob | null> {
        console.log(`🔄 [ImageManager] Attempting fallback for ${failedType}...`);
        
        // Get priority-ordered list of artwork types, excluding the failed one
        const fallbackTypes = this.ARTWORK_PRIORITY.filter(type => 
            type !== failedType && 
            artworkUrls[type] && 
            artworkUrls[type].trim() !== '' &&
            artworkUrls[type] !== failedUrl // Don't retry same URL
        );
        
        for (const fallbackType of fallbackTypes) {
            const fallbackUrl = artworkUrls[fallbackType];
            console.log(`🔄 [ImageManager] Trying ${fallbackType} as fallback for ${failedType}: ${fallbackUrl}`);
            
            try {
                const blob = await this.downloadImage(fallbackUrl, options);
                if (blob) {
                    const isValid = await this.validateImageBlob(blob, fallbackUrl);
                    if (isValid) {
                        console.log(`✅ [ImageManager] Fallback successful: using ${fallbackType} for ${failedType}`);
                        return blob;
                    } else {
                        console.warn(`⚠️ [ImageManager] Fallback ${fallbackType} also failed validation`);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ [ImageManager] Fallback ${fallbackType} failed:`, error);
            }
            
            // Small delay between fallback attempts
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.warn(`❌ [ImageManager] All fallback attempts failed for ${failedType}`);
        return null;
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

    /**
     * Get all cached image URLs for preview functionality
     */
    async getAllCachedImageUrls(): Promise<string[]> {
        if (!this.db) {
            return []
        }

        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve([])
                return
            }
            
            const transaction = this.db.transaction([this.storeName], 'readonly')
            const store = transaction.objectStore(this.storeName)
            const request = store.getAllKeys()
            
            request.onsuccess = () => {
                // Keys in our IndexedDB are the image URLs
                resolve(request.result as string[])
            };
            
            request.onerror = () => {
                console.error('Failed to get cached image URLs:', request.error)
                resolve([]) // Return empty array on error instead of rejecting
            };
        });
    }

    /**
     * Get a cached image blob by URL for preview
     */
    async getCachedImageBlob(url: string): Promise<Blob | null> {
        const cacheEntry = await this.getFromCache(url);
        return cacheEntry?.blob || null;
    }

    /**
     * Validate and clean up existing cache entries
     * Removes any cached images that are invalid or empty/black
     * @returns Number of invalid entries removed
     */
    async validateAndCleanCache(): Promise<number> {
        if (!this.db) return 0;

        console.log('🔍 [ImageManager] Starting cache validation...');
        
        return new Promise(async (resolve) => {
            if (!this.db) {
                resolve(0);
                return;
            }
            
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            
            request.onsuccess = async () => {
                const entries = request.result as ImageCacheEntry[];
                console.log(`📊 [ImageManager] Validating ${entries.length} cached images...`);
                
                let removedCount = 0;
                for (const entry of entries) {
                    const isValid = await this.validateImageBlob(entry.blob, entry.url);
                    if (!isValid) {
                        await this.removeFromCache(entry.url);
                        removedCount++;
                        console.log(`🗑️ [ImageManager] Removed invalid cache entry: ${entry.url}`);
                    }
                }
                
                console.log(`✅ [ImageManager] Cache validation complete. Removed ${removedCount} invalid entries.`);
                resolve(removedCount);
            };
            
            request.onerror = () => {
                console.error('❌ [ImageManager] Failed to validate cache:', request.error);
                resolve(0);
            };
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

    /**
     * Validate blob contains actual image data (not empty/black)
     * Returns true if image appears valid, false otherwise
     */
    private async validateImageBlob(blob: Blob, url: string): Promise<boolean> {
        // Check basic blob properties
        if (blob.size === 0) {
            console.warn(`⚠️ [ImageManager] Zero-byte blob for ${url}`);
            return false;
        }
        
        if (blob.size < 100) {
            console.warn(`⚠️ [ImageManager] Suspiciously small blob for ${url}: ${blob.size} bytes`);
            return false;
        }
        
        if (!blob.type.startsWith('image/')) {
            console.warn(`⚠️ [ImageManager] Invalid content type for ${url}: ${blob.type}`);
            return false;
        }
        
        // Load image to validate it can be decoded and has content
        return new Promise((resolve) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(blob);
            
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                
                // Check dimensions
                if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                    console.warn(`⚠️ [ImageManager] Invalid dimensions for ${url}: ${img.naturalWidth}x${img.naturalHeight}`);
                    resolve(false);
                    return;
                }
                
                // Sample pixels to check if image is all black/empty
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.min(img.naturalWidth, 64);
                    canvas.height = Math.min(img.naturalHeight, 64);
                    const ctx = canvas.getContext('2d');
                    
                    if (!ctx) {
                        console.warn(`⚠️ [ImageManager] Could not create canvas context for validation`);
                        resolve(true); // Can't validate, but at least image loaded
                        return;
                    }
                    
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    
                    // Check if any pixels are non-zero (matches renderer logic)
                    // Sample more pixels for better detection - check first 256 pixels (64 iterations * 4 bytes)
                    const samplesToCheck = Math.min(256, imageData.data.length / 4);
                    let hasNonZeroPixels = false;
                    
                    for (let pixelIdx = 0; pixelIdx < samplesToCheck; pixelIdx++) {
                        const i = pixelIdx * 4;
                        const r = imageData.data[i];
                        const g = imageData.data[i + 1];
                        const b = imageData.data[i + 2];
                        
                        // Match renderer's exact logic: any non-zero RGB value
                        if (r !== 0 || g !== 0 || b !== 0) {
                            hasNonZeroPixels = true;
                            break;
                        }
                    }
                    
                    if (!hasNonZeroPixels) {
                        console.warn(`⚠️ [ImageManager] Image appears to be empty/black for ${url} (all ${samplesToCheck} sampled pixels are 0,0,0)`);
                        resolve(false);
                        return;
                    }
                    
                    resolve(true);
                } catch (error) {
                    console.warn(`⚠️ [ImageManager] Error validating image content for ${url}:`, error);
                    resolve(true); // Can't validate, but at least image loaded
                }
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                console.warn(`⚠️ [ImageManager] Image failed to load for validation: ${url}`);
                resolve(false);
            };
            
            img.src = objectUrl;
        });
    }

    private async cacheImage(url: string, blob: Blob): Promise<void> {
        if (!this.db) return;
        
        // Validate blob before caching
        const isValid = await this.validateImageBlob(blob, url);
        if (!isValid) {
            console.warn(`❌ [ImageManager] Refusing to cache invalid/empty image: ${url}`);
            return;
        }

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
            request.onsuccess = () => {
                console.debug(`✅ [ImageManager] Cached validated image: ${url} (${blob.size} bytes)`);
                resolve();
            };
            request.onerror = () => resolve(); // Don't fail on cache errors
        });
    }

    async getFromCache(url: string): Promise<ImageCacheEntry | null> {
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
