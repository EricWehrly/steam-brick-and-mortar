export const DEFAULT_TOP_STEAMSPY_TAG_COUNT = 5

export function getTopSteamSpyTags(
    steamspyTags: Record<string, number> | undefined,
    limit: number = DEFAULT_TOP_STEAMSPY_TAG_COUNT
): string[] {
    if (!steamspyTags) return []

    return Object.entries(steamspyTags)
        .filter(([tag, score]) => Boolean(tag) && Number.isFinite(score) && score > 0)
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
        .slice(0, limit)
        .map(([tag]) => tag)
}
