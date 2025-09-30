/**
 * Input validation and parsing utilities
 */

export class ValidationUtils {
    /**
     * Parse Steam user input to determine the appropriate lookup method
     * 
     * Steam User Identification Mapping:
     * - steamID: Unique numeric identifier (e.g., 76561198054514251)
     * - Custom URL: User-chosen string for steamcommunity.com/id/<custom_url>
     * - Profile URL: Direct link using steamID steamcommunity.com/profiles/<steamid>
     * 
     * Supported input formats:
     * - Direct steamID: "76561198054514251"
     * - Direct custom URL: "SpiteMonger"
     * - Full custom URL: "https://steamcommunity.com/id/SpiteMonger"
     * - Partial custom URL: "steamcommunity.com/id/SpiteMonger"
     * - Profile URL: "https://steamcommunity.com/profiles/76561198054514251"
     * - Profile path: "/profiles/76561198054514251"
     */
    static parseSteamUserInput(input: string): { type: 'steamid' | 'customurl', value: string } {
        if (!input || typeof input !== 'string') {
            return { type: 'customurl', value: '' }
        }

        const trimmedInput = input.trim()
        if (!trimmedInput) {
            return { type: 'customurl', value: '' }
        }

        // Check for steamID in profile URL format
        const profileMatch = trimmedInput.match(/(?:steamcommunity\.com\/profiles\/|\/profiles\/)([0-9]{17})\/?/i)
        if (profileMatch) {
            return { type: 'steamid', value: profileMatch[1] }
        }

        // Check for direct steamID (17-digit number)
        if (/^[0-9]{17}$/.test(trimmedInput)) {
            return { type: 'steamid', value: trimmedInput }
        }

        // Check for custom URL in various formats
        const customUrlMatch = trimmedInput.match(/(?:steamcommunity\.com\/id\/|\/id\/)?([^/\s]+)\/?$/i)
        const customUrl = customUrlMatch ? customUrlMatch[1] : trimmedInput
        
        return { type: 'customurl', value: customUrl }
    }

    /**
     * @deprecated Use parseSteamUserInput instead. This method will be removed in a future version.
     */
    static extractVanityFromInput(input: string): string {
        const result = ValidationUtils.parseSteamUserInput(input)
        return result.value
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
