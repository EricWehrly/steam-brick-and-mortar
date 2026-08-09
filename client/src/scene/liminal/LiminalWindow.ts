import { indexAt } from './LibraryRing'

/** Windows a ring of items (e.g. RingEntry) into fixed-size per-slot chunks. Payload-agnostic —
 *  the indexing math never inspects T, so any ring (games, section-tagged games, etc.) can share it. */
export class LiminalWindow<T> {
    constructor(
        private readonly items: ReadonlyArray<Readonly<T>>,
        private readonly slotsPerUnit: number,
        private readonly depthSlots: number
    ) {}

    itemsForSlot(depthSlot: number): Readonly<T>[] {
        const length = this.items.length
        if (length === 0) return []

        const itemsPerSlot = this.slotsPerUnit * 2
        const base = depthSlot * itemsPerSlot
        const result: Readonly<T>[] = []
        for (let offset = 0; offset < itemsPerSlot; offset++) {
            result.push(this.items[indexAt(base, offset, length)])
        }
        return result
    }

    allWindowItems(): Readonly<T>[] {
        const result: Readonly<T>[] = []
        for (let depthSlot = 0; depthSlot < this.depthSlots; depthSlot++) {
            result.push(...this.itemsForSlot(depthSlot))
        }
        return result
    }
}
