/**
 * Picks which local screenshots become wall posters - one per game (earliest capture), capped to
 * however many wall slots are available. Pure function, no THREE/scene dependency. See
 * docs/plans/wall-poster-placement-plan.md's "Content selection" section.
 */

import type { LocalScreenshot } from '../../../steam/LocalScreenshotReader'

export function selectPosterScreenshots(screenshots: readonly LocalScreenshot[], slotCount: number): LocalScreenshot[] {
    const earliestByAppid = new Map<number, LocalScreenshot>()
    for (const screenshot of [...screenshots].sort((a, b) => a.creation - b.creation)) {
        if (!earliestByAppid.has(screenshot.appid)) {
            earliestByAppid.set(screenshot.appid, screenshot)
        }
    }
    return Array.from(earliestByAppid.values()).slice(0, slotCount)
}
