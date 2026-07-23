/**
 * Pure slot-math for wall posters - no THREE/scene dependency, so it's testable without any
 * mocking. See docs/plans/wall-poster-placement-plan.md for the spacing rule this implements:
 * 3 poster-widths of gap between adjacent posters, where "poster width" is the frame's outer
 * (image + molding) width, not the bare image width. Frame *height* varies per image aspect
 * (see PosterFrameBuilder's poster-size presets) and has no bearing on horizontal spacing.
 */

/** Outer footprint width of one framed poster, in meters - the pitch unit for spacing. */
export const FRAME_OUTER_WIDTH_METERS = 2.7

/** Gap between adjacent posters, expressed in poster-widths, per instruction. */
const GAP_IN_FRAME_WIDTHS = 3

/** Kept clear of each wall corner so an end poster never sits flush against the side wall. */
const CORNER_MARGIN_METERS = FRAME_OUTER_WIDTH_METERS

const PITCH_METERS = FRAME_OUTER_WIDTH_METERS * (1 + GAP_IN_FRAME_WIDTHS)

/**
 * Local-x offsets (wall-space, centered on the wall's own midpoint) for each poster slot along a
 * wall of the given width. Returns an empty array if the wall is too narrow for even one frame.
 */
export function computeWallPosterSlots(wallWidth: number): number[] {
    const availableWidth = wallWidth - 2 * CORNER_MARGIN_METERS
    if (availableWidth < FRAME_OUTER_WIDTH_METERS) {
        return []
    }

    const slotCount = Math.floor((availableWidth - FRAME_OUTER_WIDTH_METERS) / PITCH_METERS) + 1
    const totalSpan = (slotCount - 1) * PITCH_METERS
    const start = -totalSpan / 2

    return Array.from({ length: slotCount }, (_, index) => start + index * PITCH_METERS)
}
