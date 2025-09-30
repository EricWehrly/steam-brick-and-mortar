/**
 * Steam error message utilities for providing clear, contextual feedback to users
 */

export interface SteamErrorContext {
    userInput: string
    parsedInputType: 'steamid' | 'customurl'
    parsedInputValue: string
    errorType: 'vanity_not_found' | 'steamid_invalid' | 'api_error' | 'network_error' | 'unknown'
    originalError?: Error
}

export class SteamErrorMessages {
    /**
     * Generate a user-friendly error message with specific guidance based on the input and error context
     */
    static generateErrorMessage(context: SteamErrorContext): string {
        const { userInput, parsedInputType, parsedInputValue, errorType } = context

        // Base explanation of what was attempted
        const attemptedFormat = parsedInputType === 'steamid' 
            ? `SteamID "${parsedInputValue}"`
            : `custom URL "${parsedInputValue}"`

        switch (errorType) {
            case 'vanity_not_found':
                if (parsedInputType === 'customurl') {
                    return this.buildCustomUrlNotFoundMessage(userInput, parsedInputValue)
                } else {
                    return `❌ SteamID "${parsedInputValue}" was not found. Please verify the 17-digit SteamID is correct.`
                }

            case 'steamid_invalid':
                return this.buildInvalidSteamIdMessage(userInput, parsedInputValue)

            case 'api_error':
                return `❌ Steam API error occurred while looking up ${attemptedFormat}. Please try again in a moment.`

            case 'network_error':
                return `❌ Network error while contacting Steam. Please check your connection and try again.`

            case 'unknown':
            default:
                return this.buildGenericErrorWithGuidance(userInput, parsedInputType)
        }
    }

    private static buildCustomUrlNotFoundMessage(originalInput: string, parsedValue: string): string {
        const baseMessage = `❌ Custom URL "${parsedValue}" was not found.`
        
        // Common bullet points for all scenarios
        const commonOptions = this.getCommonInputOptions()
        
        // Provide specific guidance based on the input format
        if (originalInput === parsedValue) {
            // User entered just the custom URL part (e.g., "moodchanging")
            return `${baseMessage}<br><br>This might be a display name rather than a custom URL. Please try one of these instead:<br>${commonOptions}`
        } else {
            // User entered a URL that we parsed
            return `${baseMessage}<br><br>Please verify the custom URL is correct, or try:<br>${commonOptions}`
        }
    }

    private static buildInvalidSteamIdMessage(originalInput: string, parsedValue: string): string {
        const commonOptions = this.getCommonInputOptions()
        return `❌ "${parsedValue}" is not a valid SteamID.<br><br>SteamIDs must be 17-digit numbers. Please try:<br>${commonOptions}`
    }

    private static buildGenericErrorWithGuidance(originalInput: string, inputType: 'steamid' | 'customurl'): string {
        const inputTypeDesc = inputType === 'steamid' ? 'SteamID' : 'custom URL'
        const commonOptions = this.getCommonInputOptions()
        
        return `❌ Unable to load games using "${originalInput}" as a ${inputTypeDesc}.<br><br>Please try one of these formats:<br>${commonOptions}`
    }

    /**
     * Determine error type from the error message or error object
     */
    static categorizeError(error: Error): SteamErrorContext['errorType'] {
        const message = error.message.toLowerCase()
        
        if (message.includes('vanity url not found') || message.includes('not found')) {
            return 'vanity_not_found'
        }
        
        if (message.includes('invalid steamid') || message.includes('steamid')) {
            return 'steamid_invalid'
        }
        
        if (message.includes('network') || message.includes('connection')) {
            return 'network_error'
        }
        
        if (message.includes('api') || message.includes('server')) {
            return 'api_error'
        }
        
        return 'unknown'
    }

    /**
     * Get common input options as HTML formatted bullet points
     */
    private static getCommonInputOptions(): string {
        return `• Your SteamID (17-digit number): e.g., 76561197960287930<br>
• Your full profile URL: steamcommunity.com/profiles/[YourSteamID]<br>
• Your custom URL (if you've set one): steamcommunity.com/id/[YourCustomURL]`
    }

    /**
     * Helper to extract meaningful guidance for display names vs custom URLs
     */
    static getDisplayNameGuidance(): string {
        return `💡 Tip: Display names (what others see) are different from custom URLs.<br>
To find your SteamID or custom URL:<br>
1. Go to your Steam profile<br>
2. Right-click → "Copy Profile URL"<br>
3. Use that URL here, or extract the number/name from it`
    }
}