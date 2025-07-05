/**
 * Steam API Client for WebXR Integration
 * 
 * This client communicates with our deployed AWS Lambda proxy
 * to fetch Steam user data without CORS issues.
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

export class SteamApiClient {
    private readonly apiBaseUrl: string;
    private readonly defaultTimeout: number = 10000; // 10 seconds

    constructor(apiBaseUrl: string = 'https://steam-api-dev.wehrly.com') {
        this.apiBaseUrl = apiBaseUrl;
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

        try {
            const response = await this.makeRequest<SteamResolveResponse>(endpoint);
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

        try {
            const response = await this.makeRequest<SteamUser>(endpoint);
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
}

// Export a default instance for convenience
export const steamApi = new SteamApiClient();
