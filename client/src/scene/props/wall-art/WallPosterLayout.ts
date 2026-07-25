/**
 * Pure slot-math for wall posters - the math itself needs no THREE/scene state, so it's testable
 * without any mocking. See docs/plans/wall-poster-placement-plan.md for the spacing rule this
 * implements: 3 poster-widths of gap between adjacent posters, where "poster width" is the
 * frame's outer (image + molding) width, not the bare image width. Frame *height* varies per
 * image aspect (see PosterFrameBuilder's poster-size presets) and has no bearing on horizontal
 * spacing. Width itself is owned by PosterFrameBuilder (the frame's own size data belongs with
 * the frame, not a layout module) and pulled in here via getFrameOuterWidth().
 */

import { getFrameOuterWidth } from './PosterFrameBuilder'

/** Gap between adjacent posters, expressed in poster-widths, per instruction. */
const GAP_IN_FRAME_WIDTHS = 3

/**
 * Local-x offsets (wall-space, centered on the wall's own midpoint) for each poster slot along a
 * wall of the given width. Returns an empty array if the wall is too narrow for even one frame.
 */
export function computeWallPosterSlots(wallWidth: number): number[] {
    const frameOuterWidth = getFrameOuterWidth()
    // Kept clear of each wall corner so an end poster never sits flush against the side wall.
    const cornerMargin = frameOuterWidth
    const pitch = frameOuterWidth * (1 + GAP_IN_FRAME_WIDTHS)

    const availableWidth = wallWidth - 2 * cornerMargin
    if (availableWidth < frameOuterWidth) {
        return []
    }

    const slotCount = Math.floor((availableWidth - frameOuterWidth) / pitch) + 1
    const totalSpan = (slotCount - 1) * pitch
    const start = -totalSpan / 2

    return Array.from({ length: slotCount }, (_, index) => start + index * pitch)
}
