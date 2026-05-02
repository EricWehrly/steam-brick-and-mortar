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

function chooseRegionWithMostCapacity(remainingCapacity: Record<AxisRegion, number>): AxisRegion {
    return remainingCapacity.negative >= remainingCapacity.positive ? 'negative' : 'positive'
}

function buildRegionOrders(
    shelvesPerSection: ReadonlyArray<number>,
    regionCapacity: Record<AxisRegion, number>
): RegionOrders {
    const orders: RegionOrders = {
        negative: [],
        positive: [],
    }
    const remainingCapacity: Record<AxisRegion, number> = {
        negative: regionCapacity.negative,
        positive: regionCapacity.positive,
    }

    const sectionsBySize = shelvesPerSection
        .map((count, sectionIndex) => ({ sectionIndex, count }))
        .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count
            return a.sectionIndex - b.sectionIndex
        })

    for (const { sectionIndex, count } of sectionsBySize) {
        let remainingForSection = count

        while (remainingForSection > 0) {
            let targetRegion = chooseRegionWithMostCapacity(remainingCapacity)
            if (remainingCapacity[targetRegion] <= 0) {
                targetRegion = targetRegion === 'negative' ? 'positive' : 'negative'
            }

            const allocatable = Math.min(remainingForSection, Math.max(0, remainingCapacity[targetRegion]))
            if (allocatable <= 0) {
                break
            }

            for (let slot = 0; slot < allocatable; slot++) {
                orders[targetRegion].push(sectionIndex)
            }

            remainingForSection -= allocatable
            remainingCapacity[targetRegion] -= allocatable
        }
    }

    return orders
}

function findNextAvailableSection(remainingPerSection: number[]): number {
    for (let sectionIndex = 0; sectionIndex < remainingPerSection.length; sectionIndex++) {
        if (remainingPerSection[sectionIndex] > 0) {
            return sectionIndex
        }
    }
    return 0
}

function takeNextSectionFromRegionOrder(
    region: AxisRegion,
    orders: RegionOrders,
    cursors: Record<AxisRegion, number>,
    remainingPerSection: number[]
): number {
    const order = orders[region]
    let cursor = cursors[region]

    while (cursor < order.length) {
        const sectionIndex = order[cursor]
        cursor++
        if (remainingPerSection[sectionIndex] > 0) {
            cursors[region] = cursor
            return sectionIndex
        }
    }

    cursors[region] = cursor
    return findNextAvailableSection(remainingPerSection)
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
    const remainingPerSection = [...shelvesPerSection]
    const cursors: Record<AxisRegion, number> = {
        negative: 0,
        positive: 0,
    }

    for (const shelfIndex of buckets.negative) {
        const sectionIndex = takeNextSectionFromRegionOrder('negative', orders, cursors, remainingPerSection)
        sectionByShelfIndex[shelfIndex] = sectionIndex
        remainingPerSection[sectionIndex] = Math.max(0, remainingPerSection[sectionIndex] - 1)
    }

    for (const shelfIndex of buckets.positive) {
        const sectionIndex = takeNextSectionFromRegionOrder('positive', orders, cursors, remainingPerSection)
        sectionByShelfIndex[shelfIndex] = sectionIndex
        remainingPerSection[sectionIndex] = Math.max(0, remainingPerSection[sectionIndex] - 1)
    }

    for (const shelfIndex of buckets.neutral) {
        const negativeRemaining = orders.negative.length - cursors.negative
        const positiveRemaining = orders.positive.length - cursors.positive
        const preferredRegion: AxisRegion = negativeRemaining >= positiveRemaining ? 'negative' : 'positive'
        const sectionIndex = takeNextSectionFromRegionOrder(preferredRegion, orders, cursors, remainingPerSection)

        sectionByShelfIndex[shelfIndex] = sectionIndex
        remainingPerSection[sectionIndex] = Math.max(0, remainingPerSection[sectionIndex] - 1)
    }

    return sectionByShelfIndex
}
