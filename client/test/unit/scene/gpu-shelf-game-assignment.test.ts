/**
 * Unit tests for GPU shelf game assignment logic
 * Tests the cumulative shelf count calculation fix that ensures games
 * are correctly distributed across shelves when rows have varying shelf counts
 */

import { describe, it, expect } from 'vitest'

describe('GPU Shelf Game Assignment - Cumulative Index Calculation', () => {
    const GAMES_PER_SHELF = 18 // 3 levels × 2 sides × 3 games

    /**
     * Calculate shelf global index using the OLD BUGGY method
     * Bug: Assumes all rows have 4 shelves (rowIndex * 4)
     */
    function calculateOldBuggyIndex(rowIndex: number, shelfIndexInRow: number): number {
        return rowIndex * 4 + shelfIndexInRow
    }

    /**
     * Calculate shelf global index using the NEW FIXED method
     * Fix: Uses cumulative count across rows
     */
    function calculateFixedIndex(
        rowIndex: number,
        shelfIndexInRow: number,
        shelvesPerRow: number[]
    ): number {
        let cumulativeCount = 0
        for (let i = 0; i < rowIndex; i++) {
            cumulativeCount += shelvesPerRow[i]
        }
        return cumulativeCount + shelfIndexInRow
    }

    /**
     * Get game range for a shelf given its global index
     */
    function getGameRangeForShelf(shelfGlobalIndex: number): { start: number; end: number } {
        const startGameIndex = shelfGlobalIndex * GAMES_PER_SHELF
        return {
            start: startGameIndex,
            end: startGameIndex + GAMES_PER_SHELF
        }
    }

    describe('Bug Reproduction: 798 games, 45 shelves (1 + 11×4)', () => {
        const TOTAL_GAMES = 798
        const shelves = [
            1,  // Row 0: partial row (1 shelf)
            4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4  // Rows 1-11: full rows (4 shelves each)
        ]
        const totalShelves = shelves.reduce((sum, count) => sum + count, 0) // 45 shelves

        it('should have correct test setup', () => {
            expect(totalShelves).toBe(45)
            expect(TOTAL_GAMES).toBe(798)
            expect(Math.ceil(TOTAL_GAMES / GAMES_PER_SHELF)).toBe(45) // Need exactly 45 shelves
        })

        describe('OLD BUGGY calculation', () => {
            it('produces wrong indices for row 1 onwards', () => {
                // Row 0, Shelf 0: Should be global index 0
                const row0shelf0 = calculateOldBuggyIndex(0, 0)
                expect(row0shelf0).toBe(0) // Correct by accident

                // Row 1, Shelf 0: Should be global index 1 (after row 0's 1 shelf)
                // But buggy version gives 4 (assumes row 0 had 4 shelves)
                const row1shelf0 = calculateOldBuggyIndex(1, 0)
                expect(row1shelf0).toBe(4) // WRONG! Should be 1
            })

            it('assigns wrong game indices to shelves', () => {
                // Row 6, Shelf 0: Buggy calculation
                const buggyIndex = calculateOldBuggyIndex(6, 0)
                expect(buggyIndex).toBe(24) // Wrong index - should be 21

                const correctIndex = calculateFixedIndex(6, 0, shelves)
                expect(correctIndex).toBe(21) // Correct index

                // The buggy index skips 3 shelves worth of games
                const buggyRange = getGameRangeForShelf(buggyIndex)
                const correctRange = getGameRangeForShelf(correctIndex)
                
                expect(buggyRange.start).toBe(432) // Games 432-449 (wrong)
                expect(correctRange.start).toBe(378) // Games 378-395 (correct)
                
                // Buggy calculation wastes 54 games (3 shelves × 18 games)
                expect(buggyRange.start - correctRange.start).toBe(54)
            })

            it('creates empty shelves in last rows', () => {
                // Test shelves that would be empty with buggy calculation
                // With 798 games and 18 per shelf, we can fill 44.33 shelves
                // Last 3 shelves (indices 42-44) would be empty with buggy calc
                const potentiallyEmptyShelves = [
                    { row: 11, shelf: 1, expectedBuggyIndex: 45 },
                    { row: 11, shelf: 2, expectedBuggyIndex: 46 },
                    { row: 11, shelf: 3, expectedBuggyIndex: 47 }
                ]

                potentiallyEmptyShelves.forEach(({ row, shelf, expectedBuggyIndex }) => {
                    const buggyIndex = calculateOldBuggyIndex(row, shelf)
                    expect(buggyIndex).toBe(expectedBuggyIndex)

                    const gameRange = getGameRangeForShelf(buggyIndex)
                    // These would all slice beyond the game array
                    expect(gameRange.start).toBeGreaterThan(TOTAL_GAMES)
                })
            })
        })

        describe('NEW FIXED calculation', () => {
            it('produces correct cumulative indices for all rows', () => {
                // Row 0, Shelf 0: Global index 0
                expect(calculateFixedIndex(0, 0, shelves)).toBe(0)

                // Row 1, Shelf 0: Global index 1 (after row 0's 1 shelf)
                expect(calculateFixedIndex(1, 0, shelves)).toBe(1)

                // Row 1, Shelf 3: Global index 4 (0 + 1 row0 + 3 in row1)
                expect(calculateFixedIndex(1, 3, shelves)).toBe(4)

                // Row 6, Shelf 0: Global index 21 (1 + 4*5 rows)
                expect(calculateFixedIndex(6, 0, shelves)).toBe(21)
            })

            it('assigns games correctly across all shelves', () => {
                let previousEnd = 0

                for (let rowIndex = 0; rowIndex < shelves.length; rowIndex++) {
                    for (let shelfInRow = 0; shelfInRow < shelves[rowIndex]; shelfInRow++) {
                        const globalIndex = calculateFixedIndex(rowIndex, shelfInRow, shelves)
                        const gameRange = getGameRangeForShelf(globalIndex)

                        // Each shelf should start where the previous one ended
                        expect(gameRange.start).toBe(previousEnd)
                        previousEnd = gameRange.end
                    }
                }

                // Last shelf should end at or after 798 games
                expect(previousEnd).toBeGreaterThanOrEqual(TOTAL_GAMES)
            })

            it('has no empty shelves (all within game range)', () => {
                for (let rowIndex = 0; rowIndex < shelves.length; rowIndex++) {
                    for (let shelfInRow = 0; shelfInRow < shelves[rowIndex]; shelfInRow++) {
                        const globalIndex = calculateFixedIndex(rowIndex, shelfInRow, shelves)
                        const gameRange = getGameRangeForShelf(globalIndex)

                        // All shelves should start within the game array
                        // (Last shelf may have fewer than 18 games, which is fine)
                        expect(gameRange.start).toBeLessThan(TOTAL_GAMES)
                    }
                }
            })

            it('handles the last partial shelf correctly', () => {
                // Last shelf: row 11, shelf 3 (global index 44)
                const lastShelfIndex = calculateFixedIndex(11, 3, shelves)
                expect(lastShelfIndex).toBe(44) // 45th shelf (0-indexed)

                const gameRange = getGameRangeForShelf(lastShelfIndex)
                expect(gameRange.start).toBe(792) // Games 792-809 (but only 798 total)
                expect(gameRange.end).toBe(810)

                // Verify slice would work correctly
                const gamesOnLastShelf = TOTAL_GAMES - gameRange.start
                expect(gamesOnLastShelf).toBe(6) // Only 6 games on last shelf
                expect(gamesOnLastShelf).toBeGreaterThan(0)
                expect(gamesOnLastShelf).toBeLessThanOrEqual(GAMES_PER_SHELF)
            })
        })

        describe('Comparison: Old vs New', () => {
            it('shows divergence starting at row 1', () => {
                for (let rowIndex = 1; rowIndex < 6; rowIndex++) {
                    const oldIndex = calculateOldBuggyIndex(rowIndex, 0)
                    const newIndex = calculateFixedIndex(rowIndex, 0, shelves)
                    
                    // Old calculation is always 3 higher (assumes 4 shelves in row 0 instead of 1)
                    expect(oldIndex - newIndex).toBe(3)
                }
            })

            it('old method creates 3 empty shelves, new method creates 0', () => {
                let oldEmptyCount = 0
                let newEmptyCount = 0

                for (let rowIndex = 0; rowIndex < shelves.length; rowIndex++) {
                    for (let shelfInRow = 0; shelfInRow < shelves[rowIndex]; shelfInRow++) {
                        const oldIndex = calculateOldBuggyIndex(rowIndex, shelfInRow)
                        const newIndex = calculateFixedIndex(rowIndex, shelfInRow, shelves)

                        const oldRange = getGameRangeForShelf(oldIndex)
                        const newRange = getGameRangeForShelf(newIndex)

                        if (oldRange.start >= TOTAL_GAMES) oldEmptyCount++
                        if (newRange.start >= TOTAL_GAMES) newEmptyCount++
                    }
                }

                expect(oldEmptyCount).toBe(3) // 3 empty shelves with bug
                expect(newEmptyCount).toBe(0) // 0 empty shelves with fix
            })
        })
    })

    describe('Edge cases', () => {
        it('handles all full rows correctly', () => {
            const allFullRows = [4, 4, 4, 4] // 4 rows, 4 shelves each

            for (let row = 0; row < allFullRows.length; row++) {
                for (let shelf = 0; shelf < allFullRows[row]; shelf++) {
                    const fixedIndex = calculateFixedIndex(row, shelf, allFullRows)
                    const expectedIndex = row * 4 + shelf // Should match simple formula when all rows are full

                    expect(fixedIndex).toBe(expectedIndex)
                }
            }
        })

        it('handles single shelf correctly', () => {
            const singleShelf = [1] // Just one shelf total

            const index = calculateFixedIndex(0, 0, singleShelf)
            expect(index).toBe(0)

            const gameRange = getGameRangeForShelf(index)
            expect(gameRange.start).toBe(0)
            expect(gameRange.end).toBe(GAMES_PER_SHELF)
        })

        it('handles varying partial rows', () => {
            const varyingRows = [1, 2, 3, 4, 3, 2, 1] // 16 shelves total

            let expectedIndex = 0
            for (let row = 0; row < varyingRows.length; row++) {
                for (let shelf = 0; shelf < varyingRows[row]; shelf++) {
                    const actualIndex = calculateFixedIndex(row, shelf, varyingRows)
                    expect(actualIndex).toBe(expectedIndex)
                    expectedIndex++
                }
            }

            expect(expectedIndex).toBe(16) // Verify total count
        })
    })
})
