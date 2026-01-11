import { describe, it, expect } from 'vitest'

/**
 * Tests for batch count calculation logic to ensure consistent batch totals
 * across cached and uncached game phases.
 * 
 * Context: Two-phase loading (cached first, uncached background) must calculate
 * batch counts identically to how they're emitted to prevent array bounds errors.
 * 
 * See: GpuStorePropsRenderer shelf position pre-allocation bug where
 * Math.ceil(total/batchSize) != Math.ceil(cached/batchSize) + Math.ceil(uncached/batchSize)
 * due to independent rounding in each phase.
 */
describe('Batch Count Calculation', () => {
    const BATCH_SIZE = 18

    /**
     * Helper to calculate batch count the correct way (per-phase rounding)
     */
    function calculateBatchCountPerPhase(cachedCount: number, uncachedCount: number, batchSize: number): number {
        const cachedBatches = Math.ceil(cachedCount / batchSize)
        const uncachedBatches = Math.ceil(uncachedCount / batchSize)
        return cachedBatches + uncachedBatches
    }

    /**
     * Helper to calculate batch count the wrong way (total rounding)
     */
    function calculateBatchCountWrong(cachedCount: number, uncachedCount: number, batchSize: number): number {
        return Math.ceil((cachedCount + uncachedCount) / batchSize)
    }

    describe('Phase-based batch calculation', () => {
        it('should match actual emission when cached + uncached rounds differently than total', () => {
            // Real case from bug: 787 cached + 20 uncached = 807 total
            const cachedCount = 787
            const uncachedCount = 20
            
            const correctCount = calculateBatchCountPerPhase(cachedCount, uncachedCount, BATCH_SIZE)
            const wrongCount = calculateBatchCountWrong(cachedCount, uncachedCount, BATCH_SIZE)
            
            // Per-phase: ceil(787/18) + ceil(20/18) = 44 + 2 = 46
            expect(correctCount).toBe(46)
            
            // Total: ceil(807/18) = ceil(44.83) = 45 (WRONG!)
            expect(wrongCount).toBe(45)
            
            // Verify they're different (this is the bug!)
            expect(correctCount).not.toBe(wrongCount)
        })

        it('should handle exact multiples correctly', () => {
            const cachedCount = 36  // Exactly 2 batches
            const uncachedCount = 18  // Exactly 1 batch
            
            const correctCount = calculateBatchCountPerPhase(cachedCount, uncachedCount, BATCH_SIZE)
            const wrongCount = calculateBatchCountWrong(cachedCount, uncachedCount, BATCH_SIZE)
            
            // Both methods agree when there's no rounding
            expect(correctCount).toBe(3)
            expect(wrongCount).toBe(3)
        })

        it('should handle edge case with 1 game in uncached phase', () => {
            const cachedCount = 787
            const uncachedCount = 1  // Single game triggers extra batch
            
            const correctCount = calculateBatchCountPerPhase(cachedCount, uncachedCount, BATCH_SIZE)
            
            // Per-phase: ceil(787/18) + ceil(1/18) = 44 + 1 = 45
            expect(correctCount).toBe(45)
        })

        it('should handle edge case with batch-size-minus-one games', () => {
            const cachedCount = 17  // Just under 1 batch
            const uncachedCount = 17  // Just under 1 batch
            
            const correctCount = calculateBatchCountPerPhase(cachedCount, uncachedCount, BATCH_SIZE)
            const wrongCount = calculateBatchCountWrong(cachedCount, uncachedCount, BATCH_SIZE)
            
            // Per-phase: ceil(17/18) + ceil(17/18) = 1 + 1 = 2
            expect(correctCount).toBe(2)
            
            // Total: ceil(34/18) = ceil(1.89) = 2
            expect(wrongCount).toBe(2)
            
            // In this case they match, but structure is still important
            expect(correctCount).toBe(wrongCount)
        })

        it('should handle all games cached (no uncached phase)', () => {
            const cachedCount = 807
            const uncachedCount = 0
            
            const correctCount = calculateBatchCountPerPhase(cachedCount, uncachedCount, BATCH_SIZE)
            
            // Per-phase: ceil(807/18) + ceil(0/18) = 45 + 0 = 45
            expect(correctCount).toBe(45)
        })

        it('should handle all games uncached (no cached phase)', () => {
            const cachedCount = 0
            const uncachedCount = 807
            
            const correctCount = calculateBatchCountPerPhase(cachedCount, uncachedCount, BATCH_SIZE)
            
            // Per-phase: ceil(0/18) + ceil(807/18) = 0 + 45 = 45
            expect(correctCount).toBe(45)
        })
    })

    describe('Rounding discrepancy detection', () => {
        it('should identify cases where naive rounding fails', () => {
            const testCases = [
                { cached: 787, uncached: 20 },  // Real bug case
                { cached: 199, uncached: 20 },  // 11 + 2 = 13 vs ceil(219/18) = 13 (match)
                { cached: 200, uncached: 17 },  // 12 + 1 = 13 vs ceil(217/18) = 13 (match)
                { cached: 200, uncached: 19 },  // 12 + 2 = 14 vs ceil(219/18) = 13 (MISMATCH!)
            ]

            const discrepancies = testCases.filter(tc => {
                const correct = calculateBatchCountPerPhase(tc.cached, tc.uncached, BATCH_SIZE)
                const wrong = calculateBatchCountWrong(tc.cached, tc.uncached, BATCH_SIZE)
                return correct !== wrong
            })

            // Should find at least the known bug cases
            expect(discrepancies.length).toBeGreaterThan(0)
            expect(discrepancies).toContainEqual({ cached: 787, uncached: 20 })
            expect(discrepancies).toContainEqual({ cached: 200, uncached: 19 })
        })
    })
})
