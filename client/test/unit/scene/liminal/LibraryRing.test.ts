import { describe, expect, it } from 'vitest'
import { indexAt } from '../../../../src/scene/liminal/LibraryRing'

describe('LibraryRing.indexAt', () => {
    it('wraps forward past the end of the library', () => {
        expect(indexAt(8, 2, 10)).toBe(0)
        expect(indexAt(8, 3, 10)).toBe(1)
    })

    it('wraps backward past the start of the library', () => {
        expect(indexAt(1, -2, 10)).toBe(9)
        expect(indexAt(0, -1, 10)).toBe(9)
    })

    it('is a no-op within bounds', () => {
        expect(indexAt(3, 2, 10)).toBe(5)
    })

    it('wraps repeatedly for offsets larger than the library size', () => {
        expect(indexAt(0, 25, 10)).toBe(5)
        expect(indexAt(0, -25, 10)).toBe(5)
    })

    it('returns 0 for a zero-length library rather than dividing by zero', () => {
        expect(indexAt(0, 5, 0)).toBe(0)
    })
})
