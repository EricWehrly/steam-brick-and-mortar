/**
 * Steam API Client for WebXR Integration
 * 
 * This client communicates with our d        // Load cache from localStorage on initialization
        if (this.cacheConfig.enableCache && typeof localStorage !== 'undefined') {
            this.loadCacheFromStorage()
        }yed AWS Lambda proxy
 * to fetch Steam user data without CORS issues.
 * 
 * Features:
 * - CORS-free Steam API access via AWS Lambda proxy
 * - Local storage caching for offline use
 * - Cache invalidation and management
 * - Robust error handling and fallback modes
 */

export interface SteamGame {
    appid: number;
    name: string;
    playtime_forever: number;
    playtime_2weeks?: number;
    img_icon_url: string;
    img_logo_url: string;
    artwork: {
        icon: string;
        logo: string;
        header: string;
        library: string;
    };
}

export interface SteamUser {
    steamid: string;
    vanity_url?: string;
    game_count: number;
    games: SteamGame[];
    retrieved_at: string;
}

export interface SteamResolveResponse {
    vanity_url: string;
    steamid: string;
    resolved_at: string;
}

export interface SteamApiError {
    error: string;
    message: string;
    timestamp: string;
}

export interface ProgressiveLoadOptions {
    /** Maximum requests per second (default: 4) */
    maxRequestsPerSecond: number;
    /** Callback for progress updates */
    onProgress?: (current: number, total: number, currentGame?: SteamGame) => void;
    /** Callback for each game loaded */
    onGameLoaded?: (game: SteamGame, index: number) => void;
    /** Skip games already in cache */
    skipCached: boolean;
    /** Prioritize games by playtime */
    prioritizeByPlaytime: boolean;
    /** Maximum number of games to process (default: 30 for development) */
    maxGames?: number;
}

export interface RateLimitedRequest {
    appid: number;
    resolve: (game: SteamGame) => void;
    reject: (error: Error) => void;
    priority: number;
}

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    vanity_url?: string;
    steamid?: string;
}

export interface CacheConfig {
    /** Cache duration in milliseconds (default: 1 hour) */
    cacheDuration: number;
    /** Enable localStorage caching (default: true) */
    enableCache: boolean;
    /** Cache key prefix for localStorage */
    cachePrefix: string;
}

export interface CacheStats {
    totalEntries: number;
    resolveEntries: number;
    gamesEntries: number;
    oldestEntry: number | null;
    newestEntry: number | null;
    totalSize: number; // Approximate size in bytes
}

export class SteamApiClient {
    private readonly apiBaseUrl: string;
    private readonly defaultTimeout: number = 10000; // 10 seconds
    private readonly cacheConfig: CacheConfig;
    private cache: Map<string, CacheEntry<any>> = new Map();
    
    // Rate limiting for progressive fetching
    private requestQueue: RateLimitedRequest[] = [];
    private isProcessingQueue: boolean = false;
    private lastRequestTime: number = 0;
    private readonly minRequestInterval: number = 250; // 250ms = 4 requests/second

    constructor(
        apiBaseUrl: string = 'https://steam-api-dev.wehrly.com',
        cacheOptions: Partial<CacheConfig> = {}
    ) {
        this.apiBaseUrl = apiBaseUrl;
        this.cacheConfig = {
            cacheDuration: 60 * 60 * 1000, // 1 hour default
            enableCache: true,
            cachePrefix: 'steam_api_cache_',
            ...cacheOptions
        };
        
        // Load cache from localStorage on initialization
        if (this.cacheConfig.enableCache && typeof localStorage !== 'undefined') {
            this.loadCacheFromStorage();
        }
    }

    /**
     * Resolve a Steam vanity URL to a Steam ID
     * @param vanityUrl Steam vanity URL (e.g., "SpiteMonger")
     * @returns Promise<SteamResolveResponse>
     */
    async resolveVanityUrl(vanityUrl: string): Promise<SteamResolveResponse> {
        if (!vanityUrl || vanityUrl.trim().length === 0) {
            throw new Error('Vanity URL cannot be empty');
        }

        const cleanVanityUrl = vanityUrl.trim().toLowerCase();
        const endpoint = `/resolve/${encodeURIComponent(cleanVanityUrl)}`;

        // Check cache
        const cached = this.getFromCache<SteamResolveResponse>(`resolve_${cleanVanityUrl}`);
        if (cached) {
            console.log(`🔄 Cache hit for vanity URL: ${vanityUrl}`);
            return cached;
        }

        try {
            const response = await this.makeRequest<SteamResolveResponse>(endpoint);
            // Update cache
            this.saveToCache(`resolve_${cleanVanityUrl}`, response);
            console.log(`✅ Resolved ${vanityUrl} to Steam ID: ${response.steamid}`);
            return response;
        } catch (error) {
            console.error(`❌ Failed to resolve vanity URL "${vanityUrl}":`, error);
            throw error;
        }
    }

    /**
     * Get owned games for a Steam user
     * @param steamId 64-bit Steam ID (e.g., "76561197984589530")
     * @returns Promise<SteamUser>
     */
    async getUserGames(steamId: string): Promise<SteamUser> {
        if (!steamId || steamId.trim().length === 0) {
            throw new Error('Steam ID cannot be empty');
        }

        // Validate Steam ID format (17 digits)
        const cleanSteamId = steamId.trim();
        if (!/^\d{17}$/.test(cleanSteamId)) {
            throw new Error('Invalid Steam ID format. Expected 17 digits.');
        }

        const endpoint = `/games/${encodeURIComponent(cleanSteamId)}`;

        // Check cache
        const cached = this.getFromCache<SteamUser>(`games_${cleanSteamId}`);
        if (cached) {
            console.log(`🔄 Cache hit for Steam ID: ${steamId}`);
            return cached;
        }

        try {
            const response = await this.makeRequest<SteamUser>(endpoint);
            // Update cache
            this.saveToCache(`games_${cleanSteamId}`, response);
            console.log(`✅ Fetched ${response.game_count} games for Steam ID: ${steamId}`);
            return response;
        } catch (error) {
            console.error(`❌ Failed to fetch games for Steam ID "${steamId}":`, error);
            throw error;
        }
    }

    /**
     * Get user games by vanity URL (convenience method)
     * @param vanityUrl Steam vanity URL
     * @returns Promise<SteamUser>
     */
    async getUserGamesByVanityUrl(vanityUrl: string): Promise<SteamUser> {
        console.log(`🔍 Resolving vanity URL and fetching games for: ${vanityUrl}`);
        
        try {
            // Step 1: Resolve vanity URL to Steam ID
            const resolveResponse = await this.resolveVanityUrl(vanityUrl);
            
            // Step 2: Fetch games using Steam ID
            const gamesResponse = await this.getUserGames(resolveResponse.steamid);
            
            // Add normalized vanity URL to response for reference
            gamesResponse.vanity_url = resolveResponse.vanity_url;
            
            console.log(`✅ Complete workflow successful for ${vanityUrl}: ${gamesResponse.game_count} games`);
            return gamesResponse;
        } catch (error) {
            console.error(`❌ Complete workflow failed for "${vanityUrl}":`, error);
            throw error;
        }
    }

    /**
     * Check API health
     * @returns Promise<any>
     */
    async checkHealth(): Promise<any> {
        try {
            const response = await this.makeRequest<any>('/health');
            console.log('✅ Steam API proxy is healthy');
            return response;
        } catch (error) {
            console.error('❌ Steam API proxy health check failed:', error);
            throw error;
        }
    }

    /**
     * Make HTTP request to Steam API proxy
     */
    private async makeRequest<T>(endpoint: string): Promise<T> {
        const url = `${this.apiBaseUrl}${endpoint}`;
        
        console.log(`🌐 Making request to: ${url}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Origin': window.location.origin,
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorMessage: string;
                try {
                    const errorData: SteamApiError = await response.json();
                    errorMessage = errorData.message || `HTTP ${response.status}: ${response.statusText}`;
                } catch {
                    errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const data: T = await response.json();
            return data;

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error(`Request timeout after ${this.defaultTimeout}ms`);
                }
                throw error;
            }
            
            throw new Error('Unknown error occurred during API request');
        }
    }

    /**
     * Save data to cache
     */
    private saveToCache<T>(key: string, data: T): void {
        if (!this.cacheConfig.enableCache) {
            return;
        }

        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
        };

        this.cache.set(this.cacheConfig.cachePrefix + key, entry);
        this.updateLocalStorage();
    }

    /**
     * Get data from cache
     */
    private getFromCache<T>(key: string): T | null {
        const entry = this.cache.get(this.cacheConfig.cachePrefix + key);
        if (!entry) {
            return null;
        }

        // Check expiration
        const isExpired = (Date.now() - entry.timestamp) > this.cacheConfig.cacheDuration;
        if (isExpired) {
            this.cache.delete(this.cacheConfig.cachePrefix + key);
            return null;
        }

        return entry.data;
    }

    /**
     * Update localStorage with current cache state
     */
    private updateLocalStorage(): void {
        if (!this.cacheConfig.enableCache) {
            return;
        }

        const state = JSON.stringify(Array.from(this.cache.entries()));
        localStorage.setItem(this.cacheConfig.cachePrefix + 'state', state);
    }

    /**
     * Load cache state from localStorage
     */
    private loadCacheFromStorage(): void {
        if (typeof localStorage === 'undefined') {
            return;
        }
        
        const state = localStorage.getItem(this.cacheConfig.cachePrefix + 'state');
        if (!state) {
            return;
        }

        try {
            const entries = JSON.parse(state) as [string, CacheEntry<any>][];
            for (const [key, entry] of entries) {
                this.cache.set(key, entry);
            }
            console.log(`✅ Loaded ${entries.length} cache entries from localStorage`);
        } catch (error) {
            console.error('❌ Failed to load cache from localStorage:', error);
            // Clear corrupted cache
            localStorage.removeItem(this.cacheConfig.cachePrefix + 'state');
        }
    }
    
    /**
     * Load games progressively with rate limiting
     * @param steamUser Base user data with game list
     * @param options Progressive loading configuration
     * @returns Promise that resolves when all games are processed
     */
    async loadGamesProgressively(
        steamUser: SteamUser, 
        options: Partial<ProgressiveLoadOptions> = {}
    ): Promise<SteamGame[]> {
        const config: ProgressiveLoadOptions = {
            maxRequestsPerSecond: 4,
            skipCached: true,
            prioritizeByPlaytime: true,
            maxGames: 30, // Development limit
            ...options
        };
        
        console.log(`🚀 Starting progressive loading for ${steamUser.games.length} games`);
        console.log(`⚡ Rate limit: ${config.maxRequestsPerSecond} requests/second`);
        
        // Create copy of games and optionally sort by playtime
        let gamesToProcess = [...steamUser.games];
        if (config.prioritizeByPlaytime) {
            gamesToProcess.sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0));
            console.log(`📊 Prioritized by playtime: ${gamesToProcess[0]?.name} (${gamesToProcess[0]?.playtime_forever}min) first`);
        }
        
        // 🚧 DEVELOPMENT LIMIT: Restrict to maxGames to avoid excessive API calls
        if (config.maxGames && gamesToProcess.length > config.maxGames) {
            console.log(`🔒 Development limit: Processing only top ${config.maxGames} games (${gamesToProcess.length} total)`);
            gamesToProcess = gamesToProcess.slice(0, config.maxGames);
        }
        
        // Filter out cached games if requested
        if (config.skipCached) {
            const originalCount = gamesToProcess.length;
            gamesToProcess = gamesToProcess.filter(game => {
                const cached = this.getFromCache<SteamGame>(`game_details_${game.appid}`);
                return !cached;
            });
            const skippedCount = originalCount - gamesToProcess.length;
            if (skippedCount > 0) {
                console.log(`⚡ Skipping ${skippedCount} cached games, ${gamesToProcess.length} remaining`);
            }
        }
        
        if (gamesToProcess.length === 0) {
            console.log(`✅ All games already cached, no requests needed`);
            config.onProgress?.(steamUser.games.length, steamUser.games.length);
            return steamUser.games;
        }
        
        const loadedGames: SteamGame[] = [];
        const totalGames = steamUser.games.length;
        let processedCount = totalGames - gamesToProcess.length; // Count cached games as processed
        
        console.log(`🎯 Processing ${gamesToProcess.length} games with rate limiting`);
        
        // Process games in rate-limited batches
        for (let i = 0; i < gamesToProcess.length; i++) {
            const game = gamesToProcess[i];
            
            try {
                // Respect rate limit
                await this.enforceRateLimit(config.maxRequestsPerSecond);
                
                // Try to get enhanced game details (or return basic details if API doesn't support it)
                const enhancedGame = await this.getGameDetails(game);
                loadedGames.push(enhancedGame);
                processedCount++;
                
                // Notify progress
                config.onProgress?.(processedCount, totalGames, enhancedGame);
                config.onGameLoaded?.(enhancedGame, i);
                
                console.log(`📦 Loaded game ${i + 1}/${gamesToProcess.length}: ${enhancedGame.name}`);
                
            } catch (error) {
                console.warn(`⚠️ Failed to load details for ${game.name}:`, error);
                // Use basic game data as fallback
                loadedGames.push(game);
                processedCount++;
                config.onProgress?.(processedCount, totalGames, game);
            }
        }
        
        console.log(`✅ Progressive loading complete: ${loadedGames.length} games loaded`);
        return [...steamUser.games]; // Return all games (cached + newly loaded)
    }
    
    /**
     * Get detailed information for a specific game
     * @param game Basic game info from Steam library
     * @returns Promise<SteamGame> Enhanced game details
     */
    async getGameDetails(game: SteamGame): Promise<SteamGame> {
        // Check cache first
        const cached = this.getFromCache<SteamGame>(`game_details_${game.appid}`);
        if (cached) {
            console.log(`🔄 Cache hit for game details: ${game.name}`);
            return cached;
        }
        
        // For now, enhance the existing game data with proper artwork URLs
        // In the future, this could call additional Steam APIs for more details
        const enhancedGame: SteamGame = {
            ...game,
            artwork: {
                icon: `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
                logo: `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`,
                header: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
                library: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
            }
        };
        
        // Cache the enhanced details
        this.saveToCache(`game_details_${game.appid}`, enhancedGame);
        
        return enhancedGame;
    }
    
    /**
     * Enforce rate limiting between requests
     * @param requestsPerSecond Maximum requests per second
     */
    private async enforceRateLimit(requestsPerSecond: number): Promise<void> {
        const minInterval = 1000 / requestsPerSecond; // Convert to milliseconds
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        
        if (timeSinceLastRequest < minInterval) {
            const waitTime = minInterval - timeSinceLastRequest;
            console.log(`⏱️ Rate limiting: waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
    }
    
    /**
     * Get prioritized game list (most played first)
     * @param steamUser User data with games
     * @param limit Maximum number of games to return
     * @returns Prioritized array of games
     */
    public getPrioritizedGames(steamUser: SteamUser, limit?: number): SteamGame[] {
        const sorted = [...steamUser.games].sort((a, b) => 
            (b.playtime_forever || 0) - (a.playtime_forever || 0)
        );
        
        return limit ? sorted.slice(0, limit) : sorted;
    }
    
    // Public Cache Management Methods
    
    /**
     * Clear all cached data
     */
    public clearCache(): void {
        this.cache.clear();
        if (typeof localStorage !== 'undefined') {
            // Collect keys to remove (can't modify while iterating)
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.cacheConfig.cachePrefix)) {
                    keysToRemove.push(key);
                }
            }
            
            // Remove the collected keys
            for (const key of keysToRemove) {
                localStorage.removeItem(key);
            }
        }
        console.log('🗑️ Cache cleared successfully');
    }
    
    /**
     * Get cache statistics
     */
    public getCacheStats(): CacheStats {
        const entries = Array.from(this.cache.entries());
        const resolveEntries = entries.filter(([key]) => key.includes('resolve_')).length;
        const gamesEntries = entries.filter(([key]) => key.includes('games_')).length;
        
        const timestamps = entries.map(([, entry]) => entry.timestamp);
        const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : null;
        const newestEntry = timestamps.length > 0 ? Math.max(...timestamps) : null;
        
        // Approximate size calculation
        const totalSize = entries.reduce((size, [key, entry]) => {
            return size + key.length + JSON.stringify(entry).length;
        }, 0) * 2; // Multiply by 2 for rough UTF-16 encoding size
        
        return {
            totalEntries: entries.length,
            resolveEntries,
            gamesEntries,
            oldestEntry,
            newestEntry,
            totalSize
        };
    }
    
    /**
     * Check if data is available offline for a Steam user
     */
    public isAvailableOffline(vanityUrl: string): boolean {
        const cleanVanityUrl = vanityUrl.trim().toLowerCase();
        const resolveKey = `resolve_${cleanVanityUrl}`;
        const resolveData = this.getFromCache<SteamResolveResponse>(resolveKey);
        
        if (!resolveData) {
            return false;
        }
        
        const gamesKey = `games_${resolveData.steamid}`;
        const gamesData = this.getFromCache<SteamUser>(gamesKey);
        
        return gamesData !== null;
    }
    
    /**
     * Get cached user data (offline mode)
     */
    public getCachedUserData(vanityUrl: string): SteamUser | null {
        const cleanVanityUrl = vanityUrl.trim().toLowerCase();
        const resolveKey = `resolve_${cleanVanityUrl}`;
        const resolveData = this.getFromCache<SteamResolveResponse>(resolveKey);
        
        if (!resolveData) {
            return null;
        }
        
        const gamesKey = `games_${resolveData.steamid}`;
        return this.getFromCache<SteamUser>(gamesKey);
    }
    
    /**
     * Refresh cache for a specific user
     */
    public async refreshUserCache(vanityUrl: string): Promise<SteamUser> {
        const cleanVanityUrl = vanityUrl.trim().toLowerCase();
        
        // Clear existing cache entries
        this.cache.delete(this.cacheConfig.cachePrefix + `resolve_${cleanVanityUrl}`);
        
        const resolveData = await this.resolveVanityUrl(cleanVanityUrl);
        this.cache.delete(this.cacheConfig.cachePrefix + `games_${resolveData.steamid}`);
        
        return await this.getUserGames(resolveData.steamid);
    }
}

// Export a default instance for convenience
export const steamApi = new SteamApiClient();
