import type { SteamCategory } from '../steam/types/SteamMetadata'

/** Features with this priority value are excluded from display entirely. */
export const HIDDEN_PRIORITY = 9999

/** Default priority table: Steam category id -> display priority (lower = shown first) */
export const DEFAULT_FEATURE_PRIORITIES: ReadonlyMap<number, number> = new Map<number, number>([
  [1, 10],   // Multi-player
  [9, 11],   // Co-op
  [38, 12],  // Online Co-op
  [28, 20],  // Full controller support
  [18, 21],  // Partial controller support
  [401, 30], // VR Supported
  [22, 40],  // Steam Achievements
  [30, 50],  // Steam Workshop
  [35, 60],  // In-App Purchases
  [29, HIDDEN_PRIORITY], // Steam Trading Cards
  [23, HIDDEN_PRIORITY], // Steam Cloud
  [15, HIDDEN_PRIORITY], // Stats
])

/**
 * Sort and filter a list of Steam categories for display.
 * Excludes categories with priority >= HIDDEN_PRIORITY.
 * Returns remaining categories sorted by priority ascending.
 * Categories not in the priority table get a default mid-range priority (500).
 */
export function sortAndFilterCategories(categories: SteamCategory[]): SteamCategory[] {
  if (!categories || categories.length === 0) {
    return []
  }

  const DEFAULT_PRIORITY = 500

  return categories
    .map(category => ({
      category,
      priority: DEFAULT_FEATURE_PRIORITIES.get(category.id) ?? DEFAULT_PRIORITY
    }))
    .filter(item => item.priority < HIDDEN_PRIORITY)
    .sort((a, b) => a.priority - b.priority)
    .map(item => item.category)
}
