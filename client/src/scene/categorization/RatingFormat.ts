import { RATING_TIERS } from './GroupResolver'

/**
 * Formats a Steam userscore (0-100) into a display string with tier label, e.g.
 * "92% · Overwhelmingly Positive". Shared by BinderGameDetailPanel and
 * GameBoxFoldCoordinator so both surfaces agree on wording - extracted from
 * BinderGameDetailPanel's own formerly-private formatRating().
 */
export function formatRating(userscore: number): string {
    if (userscore <= 0) {
        return 'Unrated'
    }
    const tier = RATING_TIERS.find(t => userscore >= t.minScore)
    return tier ? `${userscore}% · ${tier.label}` : `${userscore}% · Mixed or Lower`
}
