import { describe, it, expect } from 'vitest'
import { HighSlotAllocator } from '../../../../../src/scene/game-box/instancing/HighSlotAllocator'

describe('HighSlotAllocator', () => {
    it('allocates free slots before evicting', () => {
        const allocator = new HighSlotAllocator(2)

        const first = allocator.allocate(10, [])
        const second = allocator.allocate(20, [])

        expect(first).toEqual({ slot: 0, evictedGameIndex: -1 })
        expect(second).toEqual({ slot: 1, evictedGameIndex: -1 })
    })

    it('evicts the least recently used slot when full', () => {
        const allocator = new HighSlotAllocator(2)
        allocator.allocate(10, [])
        allocator.allocate(20, [])

        const result = allocator.allocate(30, [
            { gameIndex: 10, highSlot: 0, lastAccessTime: 1000 },
            { gameIndex: 20, highSlot: 1, lastAccessTime: 2000 },
        ])

        expect(result).toEqual({ slot: 0, evictedGameIndex: 10 })
    })

    it('reports slot usage and supports clearing', () => {
        const allocator = new HighSlotAllocator(2)
        allocator.allocate(10, [])
        allocator.allocate(20, [])
        expect(allocator.getUsedSlotCount()).toBe(2)

        allocator.clearSlot(1)
        expect(allocator.getUsedSlotCount()).toBe(1)

        allocator.clearAll()
        expect(allocator.getUsedSlotCount()).toBe(0)
    })
})
