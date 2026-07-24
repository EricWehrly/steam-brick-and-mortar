import type { SteamGameData } from '../game-box/types/GameData'
import { indexAt } from './LibraryRing'

export class LiminalWindow {
    constructor(
        private readonly games: ReadonlyArray<Readonly<SteamGameData>>,
        private readonly slotsPerUnit: number,
        private readonly depthSlots: number
    ) {}

    gamesForSlot(depthSlot: number): Readonly<SteamGameData>[] {
        const length = this.games.length
        if (length === 0) return []

        const gamesPerSlot = this.slotsPerUnit * 2
        const base = depthSlot * gamesPerSlot
        const result: Readonly<SteamGameData>[] = []
        for (let offset = 0; offset < gamesPerSlot; offset++) {
            result.push(this.games[indexAt(base, offset, length)])
        }
        return result
    }

    allWindowGames(): Readonly<SteamGameData>[] {
        const result: Readonly<SteamGameData>[] = []
        for (let depthSlot = 0; depthSlot < this.depthSlots; depthSlot++) {
            result.push(...this.gamesForSlot(depthSlot))
        }
        return result
    }
}
