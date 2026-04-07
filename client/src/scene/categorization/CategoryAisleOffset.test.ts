import { describe, it, expect } from 'vitest'
import {
    getPrimaryGenreFromBatch,
    computeGenreClusterIndex,
    computeAlternatingClusterXOffset,
} from './CategoryAisleOffset'

describe('CategoryAisleOffset', () => {
    it('gets first recognized primary genre from batch games', () => {
        const genre = getPrimaryGenreFromBatch([
            { genres: [{ description: 'UnknownGenre' }] },
            { genres: [{ description: 'Action' }] },
        ])

        expect(genre).toBe('Action')
    })

    it('falls back to Other when no recognized primary genres exist', () => {
        const genre = getPrimaryGenreFromBatch([
            { genres: [{ description: 'UnknownGenre' }] },
            { genres: [] },
            {},
        ])

        expect(genre).toBe('Other')
    })

    it('computes cluster index by detecting genre transitions across batch indices', () => {
        const map = new Map<number, string>([
            [0, 'Action'],
            [1, 'Action'],
            [2, 'Adventure'],
            [3, 'Adventure'],
            [4, 'RPG'],
        ])

        expect(computeGenreClusterIndex(0, map)).toBe(0)
        expect(computeGenreClusterIndex(1, map)).toBe(0)
        expect(computeGenreClusterIndex(2, map)).toBe(1)
        expect(computeGenreClusterIndex(3, map)).toBe(1)
        expect(computeGenreClusterIndex(4, map)).toBe(2)
    })

    it('alternates x offset left/right by cluster parity', () => {
        const map = new Map<number, string>([
            [0, 'Action'],
            [1, 'Action'],
            [2, 'Adventure'],
            [3, 'RPG'],
        ])

        expect(computeAlternatingClusterXOffset(0, map, 1.25)).toBe(-1.25)
        expect(computeAlternatingClusterXOffset(1, map, 1.25)).toBe(-1.25)
        expect(computeAlternatingClusterXOffset(2, map, 1.25)).toBe(1.25)
        expect(computeAlternatingClusterXOffset(3, map, 1.25)).toBe(-1.25)
    })
})
