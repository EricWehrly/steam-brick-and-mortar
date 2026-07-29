/**
 * URL manipulation utilities
 */

export class UrlUtils {
    /**
     * Remove a single query parameter from a URL, leaving any others intact.
     * Drops the trailing `?` entirely if no parameters remain.
     * Returns the input unchanged if it isn't a parseable absolute URL.
     */
    static stripQueryParam(url: string, paramName: string): string {
        try {
            const parsed = new URL(url)
            parsed.searchParams.delete(paramName)
            return parsed.toString()
        } catch {
            return url
        }
    }
}
