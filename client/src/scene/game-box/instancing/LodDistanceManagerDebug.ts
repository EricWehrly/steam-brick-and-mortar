import { LodDistanceManager } from './LodDistanceManager'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes } from '../../../types/InteractionEvents'
import type { ILodArtworkRenderer } from './ILodArtworkRenderer'

/* eslint-disable @typescript-eslint/no-explicit-any */

export class LodDistanceManagerDebug extends LodDistanceManager {
    constructor(renderer: ILodArtworkRenderer) {
        super(renderer)
        this.registerConsoleCommands()
        this.registerEventListeners()
    }

    private registerEventListeners(): void {
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SomeBatchesComplete,
            this.handleSomeBatchesComplete.bind(this)
        )
    }

    private handleSomeBatchesComplete(): void {
        this.syncInstances()
        this.startAutoUpdate()
    }

    private registerConsoleCommands(): void {
        ;(window as any).lodDistanceManager = this

        ;(window as any).lodDistribution = () => {
            const dist = this.getLodDistribution()
            if (dist) {
                const config = (this as any).config
                console.group('≡ƒôè LOD Distribution (Two-Tier System)')
                console.log(`HIGH: ${dist.counts.high} games (within ${config?.highDistance ?? '?'}m)`)
                console.log(`MID:  ${dist.counts.mid} games (everything else)`)
                console.log(`Total: ${dist.counts.total} instances`)
                console.log(`---`)
                console.log(`Current VRAM: ${dist.estimatedVRAM.current}`)
                console.log(`Optimal VRAM: ${dist.estimatedVRAM.optimal}`)
                console.groupEnd()
            }
            return dist
        }

        ;(window as any).preloadNearestGames = (count = 20) => this.preloadNearestGames(count)
        ;(window as any).preloadNearest = (count = 20) => this.preloadNearestGames(count)
        ;(window as any).diagnoseNearest = (count = 30) => this.diagnoseNearestGames(count)

        console.log('≡ƒöº LOD distance debug exports registered. Try: lodDistribution(), preloadNearest(), diagnoseNearest()')
    }
}

/* eslint-enable @typescript-eslint/no-explicit-any */