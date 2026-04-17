export interface SlotSnapshot {
    slotToGame: number[]
}

export class HighSlotAllocator {
    private slotToGame: number[]

    constructor(private readonly totalSlots: number) {
        this.slotToGame = new Array(totalSlots).fill(-1)
    }

    public allocate(
        gameIndex: number,
        loadedEntries: Iterable<{ gameIndex: number; highSlot: number; lastAccessTime: number }>
    ): { slot: number; evictedGameIndex: number } {
        for (let slot = 0; slot < this.totalSlots; slot++) {
            if (this.slotToGame[slot] === -1) {
                this.slotToGame[slot] = gameIndex
                return { slot, evictedGameIndex: -1 }
            }
        }

        const evictedSlot = this.findLruSlot(loadedEntries)
        if (evictedSlot < 0) {
            return { slot: -1, evictedGameIndex: -1 }
        }

        const evictedGameIndex = this.slotToGame[evictedSlot]
        this.slotToGame[evictedSlot] = gameIndex
        return { slot: evictedSlot, evictedGameIndex }
    }

    public clearSlot(slot: number): void {
        if (slot >= 0 && slot < this.totalSlots) {
            this.slotToGame[slot] = -1
        }
    }

    public clearAll(): void {
        this.slotToGame.fill(-1)
    }

    public getUsedSlotCount(): number {
        return this.slotToGame.filter(gameIndex => gameIndex >= 0).length
    }

    public getSlotOwner(slot: number): number {
        return this.slotToGame[slot] ?? -1
    }

    public getSnapshot(): SlotSnapshot {
        return { slotToGame: [...this.slotToGame] }
    }

    private findLruSlot(loadedEntries: Iterable<{ highSlot: number; lastAccessTime: number }>): number {
        let lruSlot = -1
        let lruTime = Infinity

        for (const entry of loadedEntries) {
            if (entry.highSlot >= 0 && entry.lastAccessTime < lruTime) {
                lruTime = entry.lastAccessTime
                lruSlot = entry.highSlot
            }
        }

        return lruSlot
    }
}
