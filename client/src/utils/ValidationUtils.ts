/**
 * Input validation and parsing utilities
 */

export class ValidationUtils {
    /**
     * Extract Steam vanity name from various URL formats
     * Handles:
     * - Direct vanity: "SpiteMonger"
     * - Full URL: "https://steamcommunity.com/id/SpiteMonger"
     * - Partial URL: "steamcommunity.com/id/SpiteMonger"
     * - Profile URL: "/id/SpiteMonger"
     */
    static extractVanityFromInput(input: string): string {
        if (!input || typeof input !== 'string') {
            return ''
        }

        const trimmedInput = input.trim()
        if (!trimmedInput) {
            return ''
        }

        const vanityMatch = trimmedInput.match(/(?:steamcommunity\.com\/id\/|\/id\/)?([^/\s]+)\/?$/i)
        return vanityMatch ? vanityMatch[1] : trimmedInput
    }

    /**
     * Validate that a string is not empty after trimming
     */
    static isNonEmptyString(value: string): boolean {
        return typeof value === 'string' && value.trim().length > 0
    }

    /**
     * Sanitize user input for display purposes
     */
    static sanitizeForDisplay(input: string): string {
        return input
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .trim()
    }

    /**
     * Generate a consistent hue value (0-1) from a string for color generation
     */
    static stringToHue(str: string): number {
        if (!str || typeof str !== 'string') {
            return 0
        }

        let hash = 0
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash)
        }
        return Math.abs(hash % 360) / 360
    }
}
