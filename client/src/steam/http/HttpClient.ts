/**
 * Base HTTP client for API requests
 * Handles timeouts, CORS, and basic error handling
 */

export interface HttpClientOptions {
    baseUrl: string;
    timeout?: number;
    defaultHeaders?: Record<string, string>;
}

export class HttpClient {
    private readonly baseUrl: string;
    private readonly timeout: number;
    private readonly defaultHeaders: Record<string, string>;

    constructor(options: HttpClientOptions) {
        this.baseUrl = options.baseUrl;
        this.timeout = options.timeout || 10000;
        this.defaultHeaders = options.defaultHeaders || {
            'Accept': 'application/json'
        };
    }

    async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    ...this.defaultHeaders,
                    'Origin': window.location.origin,
                },
                signal: controller.signal,
                ...options
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorMessage: string;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || `HTTP ${response.status}: ${response.statusText}`;
                } catch {
                    errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            return await response.json() as T;

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error(`Request timeout after ${this.timeout}ms`);
                }
                throw error;
            }
            
            throw new Error('Unknown error occurred during API request');
        }
    }
}
