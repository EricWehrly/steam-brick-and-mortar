import { describe, it, expect } from 'vitest'
import { ShelfSurfaceUtils } from '../../../../../src/scene/props/shared/ShelfSurfaceUtils'

describe('ShelfSurfaceUtils', () => {
  it('returns standard shelf surfaces sorted top-to-bottom', () => {
    const surfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)

    expect(surfaces.length).toBeGreaterThan(1)

    for (let i = 1; i < surfaces.length; i++) {
      expect(surfaces[i - 1].topY).toBeGreaterThanOrEqual(surfaces[i].topY)
    }
  })
})
