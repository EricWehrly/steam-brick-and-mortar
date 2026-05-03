const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z\d+\-.]*:)?\/\//i
const PASS_THROUGH_SCHEMES = ['data:', 'blob:'] as const

function hasPassThroughScheme(path: string): boolean {
    return PASS_THROUGH_SCHEMES.some((scheme) => path.startsWith(scheme))
}

function ensureTrailingSlash(path: string): string {
    return path.endsWith('/') ? path : `${path}/`
}

export function toPublicAssetUrl(path: string): string {
    if (ABSOLUTE_URL_PATTERN.test(path) || hasPassThroughScheme(path)) {
        return path
    }

    const normalizedPath = path.replace(/^\/+/, '')
    const basePath = new URL(import.meta.env.BASE_URL || '/', 'https://asset.local').pathname
    return `${ensureTrailingSlash(basePath)}${normalizedPath}`
}
