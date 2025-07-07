/**
 * Rate limiting layer that can wrap any async method
 * Handles request queuing and timing constraints
 */

export interface RateLimitConfig {
    requestsPerSecond: number;
    maxQueueSize?: number;
}

export class RateLimiter {
    private lastRequestTime: number = 0;
    private readonly minInterval: number;
    private readonly maxQueueSize: number;

    constructor(config: RateLimitConfig) {
        this.minInterval = 1000 / config.requestsPerSecond;
        this.maxQueueSize = config.maxQueueSize ?? 100;
    }

    /**
     * Wrap a method with rate limiting
     */
    limited<TArgs extends any[], TReturn>(
        method: (...args: TArgs) => Promise<TReturn>
    ) {
        return async (...args: TArgs): Promise<TReturn> => {
            await this.enforceRateLimit();
            return method(...args);
        };
    }

    /**
     * Enforce rate limit with delay if needed
     */
    private async enforceRateLimit(): Promise<void> {
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.minInterval) {
            const waitTime = this.minInterval - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
    }

    /**
     * Get current rate limit status
     */
    getStatus() {
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        const canMakeRequest = timeSinceLastRequest >= this.minInterval;
        const timeUntilNext = canMakeRequest ? 0 : this.minInterval - timeSinceLastRequest;
        
        return {
            canMakeRequest,
            timeUntilNext,
            requestsPerSecond: 1000 / this.minInterval
        };
    }
}
