import type { ShelfInfo } from '../../../types/LayoutTypes'

type AxisRegion = 'negative' | 'positive'

interface RegionBuckets {
    negative: number[]
    positive: number[]
    neutral: number[]
}

interface RegionOrders {
    negative: number[]
    positive: number[]
}

interface DpState {
    previousSum: number
    sectionIndex: number
}

interface NegativeSelectionResult {
    sectionIndices: Set<number>
    achievedSlots: number
}

function partitionShelfIndicesByXAxis(shelves: ReadonlyArray<ShelfInfo>): RegionBuckets {
    const buckets: RegionBuckets = {
        negative: [],
        positive: [],
        neutral: [],
    }

    for (let index = 0; index < shelves.length; index++) {
        const x = shelves[index].position.x
        if (x < 0) {
            buckets.negative.push(index)
        } else if (x > 0) {
            buckets.positive.push(index)
        } else {
            buckets.neutral.push(index)
        }
    }

    return buckets
}

function chooseNegativeRegionSections(
    shelvesPerSection: ReadonlyArray<number>,
    targetNegativeSlots: number
): NegativeSelectionResult {
    const clampedTarget = Math.max(0, targetNegativeSlots)
    const states: Array<DpState | null> = new Array(clampedTarget + 1).fill(null)
    states[0] = { previousSum: -1, sectionIndex: -1 }

    for (let sectionIndex = 0; sectionIndex < shelvesPerSection.length; sectionIndex++) {
        const sectionCount = shelvesPerSection[sectionIndex]
        for (let sum = clampedTarget; sum >= sectionCount; sum--) {
            if (states[sum] !== null || states[sum - sectionCount] === null) {
                continue
            }

            states[sum] = {
                previousSum: sum - sectionCount,
                sectionIndex,
            }
        }
    }

    let bestSum = clampedTarget
    while (bestSum > 0 && states[bestSum] === null) {
        bestSum--
    }

    const chosen = new Set<number>()
    let cursor = bestSum

    while (cursor > 0) {
        const state = states[cursor]
        if (!state || state.sectionIndex < 0) {
            break
        }

        chosen.add(state.sectionIndex)
        cursor = state.previousSum
    }

    return {
        sectionIndices: chosen,
        achievedSlots: bestSum,
    }
}

function buildRegionOrders(
    shelvesPerSection: ReadonlyArray<number>,
    regionCapacity: Record<AxisRegion, number>
): RegionOrders {
    const orders: RegionOrders = {
        negative: [],
        positive: [],
    }
    const selection = chooseNegativeRegionSections(shelvesPerSection, regionCapacity.negative)
    const negativeCountPerSection = shelvesPerSection.map((count, sectionIndex) =>
        selection.sectionIndices.has(sectionIndex) ? count : 0
    )

    let deficit = Math.max(0, regionCapacity.negative - selection.achievedSlots)
    if (deficit > 0) {
        for (let sectionIndex = 0; sectionIndex < shelvesPerSection.length && deficit > 0; sectionIndex++) {
            if (selection.sectionIndices.has(sectionIndex)) {
                continue
            }

            const movable = Math.min(deficit, shelvesPerSection[sectionIndex])
            negativeCountPerSection[sectionIndex] += movable
            deficit -= movable
        }
    }

    for (let sectionIndex = 0; sectionIndex < shelvesPerSection.length; sectionIndex++) {
        const sectionShelfCount = shelvesPerSection[sectionIndex]
        const negativeCount = Math.min(sectionShelfCount, negativeCountPerSection[sectionIndex])
        const positiveCount = sectionShelfCount - negativeCount

        for (let slot = 0; slot < negativeCount; slot++) {
            orders.negative.push(sectionIndex)
        }

        for (let slot = 0; slot < positiveCount; slot++) {
            orders.positive.push(sectionIndex)
        }
    }

    return orders
}

export function assignSectionsByBalancedXAxisRegions(
    shelves: ReadonlyArray<ShelfInfo>,
    shelvesPerSection: ReadonlyArray<number>
): number[] {
    if (shelves.length === 0 || shelvesPerSection.length === 0) {
        return []
    }

    const buckets = partitionShelfIndicesByXAxis(shelves)
    const orders = buildRegionOrders(shelvesPerSection, {
        negative: buckets.negative.length,
        positive: buckets.positive.length,
    })

    const sectionByShelfIndex = new Array<number>(shelves.length)
    const cursors: Record<AxisRegion, number> = {
        negative: 0,
        positive: 0,
    }

    for (const shelfIndex of buckets.negative) {
        const sectionIndex = orders.negative[cursors.negative] ?? 0
        cursors.negative++
        sectionByShelfIndex[shelfIndex] = sectionIndex
    }

    for (const shelfIndex of buckets.positive) {
        const sectionIndex = orders.positive[cursors.positive] ?? 0
        cursors.positive++
        sectionByShelfIndex[shelfIndex] = sectionIndex
    }

    for (const shelfIndex of buckets.neutral) {
        const negativeRemaining = buckets.negative.length - cursors.negative
        const preferredRegion: AxisRegion = negativeRemaining > 0 ? 'negative' : 'positive'
        const sectionIndex = preferredRegion === 'negative'
            ? (orders.negative[cursors.negative] ?? 0)
            : (orders.positive[cursors.positive] ?? 0)

        if (preferredRegion === 'negative') {
            cursors.negative++
        } else {
            cursors.positive++
        }

        sectionByShelfIndex[shelfIndex] = sectionIndex
    }

    return sectionByShelfIndex
}
