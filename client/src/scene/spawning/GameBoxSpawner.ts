import * as THREE from 'three'
import { GpuGameBoxRenderer } from '../game-box/GpuGameBoxRenderer'
import type { SteamGameData } from '../game-box/types/GameData'
import { ShelfSurfaceUtils, GameBoxUtils, type IStockStrategy } from '../props/SharedPropsUtils'
import { EventManager } from '../../core/EventManager'
import { 
    BatchProcessingStatus,
    GameRenderEventTypes,
    StorePropsEventTypes, 
    GameEventTypes,
    SteamEventTypes,
    type PlacementRunResetRequestedEvent,
    type PlacementIntentReadyEvent,
    type ShelfReadyEvent,
    type ShelfLayoutDeterminedEvent,
    type GamesPlacedEvent,
} from '../../types/InteractionEvents'
import type { SectionsReadyForPlacementEvent } from '../../types/EnvironmentEvents'
import type { SteamLibraryManifestReadyEvent } from '../../types/InteractionEvents'
import type {
    StorePropsLibraryReloadRequestEvent,
} from '../props/PropsEvents'
import { Logger } from '../../utils/Logger'
import type { StockSurface } from '../../types/LayoutTypes'
import type { ShelfSurface } from '../props/shared/SharedPropsTypes'

interface ShelfPosition {
    position: THREE.Vector3
    rotationY: number
    sectionIndex: number
}

export class GameBoxSpawner {
    private static readonly logger = Logger.createLogFunctions(GameBoxSpawner.name)

    private renderer: GpuGameBoxRenderer | null = null
    private shelfPositions: Map<number, ShelfPosition> = new Map()
    private pendingSections: SectionsReadyForPlacementEvent | null = null
    private stockStrategy: IStockStrategy | null = null
    private layoutReadyForPlacement = false
    private layoutDeterminedSinceLastSections = false
    private placementRunSequence = 0

    static {
        new GameBoxSpawner()
    }

    private constructor() {
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (e: CustomEvent<ShelfReadyEvent>) => this.cacheShelfAnchor(e.detail)
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.ShelfLayoutDetermined,
            (e: CustomEvent<ShelfLayoutDeterminedEvent>) => this.stageLayoutStrategy(e.detail)
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SectionsReadyForPlacement,
            (e: CustomEvent<SectionsReadyForPlacementEvent>) => this.stagePlacementRunFromSections(e.detail)
        )
        EventManager.getInstance().registerEventHandler(
            SteamEventTypes.LibraryManifestReady,
            (e: CustomEvent<SteamLibraryManifestReadyEvent>) => this.ensureRendererCapacityForLibrary(e.detail)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            (_e: CustomEvent<StorePropsLibraryReloadRequestEvent>) => this.resetForLibraryReload()
        )

        GameBoxSpawner.logger.debug('Constructed')
    }

    private fullReset(): void {
        this.renderer?.dispose()
        this.renderer = null
        this.stockStrategy = null
        this.layoutReadyForPlacement = false
        this.layoutDeterminedSinceLastSections = false
        this.clearPlacementState()
        GameBoxSpawner.logger.debug('Full reset (library reload)')
    }

    private clearPlacementState(): void {
        this.pendingSections = null
        this.shelfPositions.clear()
    }

    private resetForLibraryReload(): void {
        this.fullReset()
    }

    private initializeRendererForLibrary(totalGames: number): void {
        if (this.renderer) return
        const textureCapacity = Math.max(totalGames, 1) + 100
        // TD: placement-headroom-policy (HIGH) — placement capacity should be policy-driven
        // from measured overlap/cardinality, not a fixed multiplier.
        const placementCapacity = Math.max(textureCapacity + 100, Math.ceil(textureCapacity * 2))
        this.renderer = new GpuGameBoxRenderer(textureCapacity, placementCapacity)
        GameBoxSpawner.logger.debug(
            `Renderer initialized: textureCapacity=${textureCapacity}, placementCapacity=${placementCapacity}`
        )
    }

    private ensureRendererCapacityForLibrary(detail: SteamLibraryManifestReadyEvent): void {
        this.initializeRendererForLibrary(detail.totalGames)
    }

    private stageLayoutStrategy(detail: ShelfLayoutDeterminedEvent): void {
        this.stockStrategy = detail.stockStrategy
        this.layoutReadyForPlacement = true
        this.layoutDeterminedSinceLastSections = true
        GameBoxSpawner.logger.debug('Stock strategy received from ShelfLayoutDetermined')
        this.tryPlacePendingSections()
    }

    private cacheShelfAnchor(detail: ShelfReadyEvent): void {
        const { shelfIndex, sectionIndex, position, rotationY } = detail
        // ShelfLayoutCoordinator emits a contiguous wave per run starting at index 0.
        if (shelfIndex === 0) this.shelfPositions.clear()
        this.shelfPositions.set(shelfIndex, {
            position: (position as THREE.Vector3).clone(),
            rotationY,
            sectionIndex,
        })
        GameBoxSpawner.logger.debug(
            `ShelfReady: shelf ${shelfIndex} (section ${sectionIndex}) at ` +
            `(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`
        )
    }

    private stagePlacementRunFromSections(detail: SectionsReadyForPlacementEvent): void {
        this.resetPlacementStateForIncomingSections()
        this.pendingSections = detail
        this.layoutDeterminedSinceLastSections = false
        const totalGames = detail.sections.reduce((sum, sectionEntry) => sum + sectionEntry.section.games.length, 0)
        GameBoxSpawner.logger.info(
            `Placement staging: ${detail.sections.length} section(s), ${totalGames} game placements, ` +
            `layoutReady=${this.layoutReadyForPlacement}, shelvesKnown=${this.shelfPositions.size}`
        )
        this.tryPlacementWhenLayoutReady()
    }

    private resetPlacementStateForIncomingSections(): void {
        if (!this.layoutDeterminedSinceLastSections) {
            this.clearPlacementState()
        }
    }

    private tryPlacementWhenLayoutReady(): void {
        if (this.layoutReadyForPlacement) {
            this.tryPlacePendingSections()
        }
    }

    private canPlacePendingSections(): boolean {
        if (!this.pendingSections) return false
        if (!this.renderer) {
            GameBoxSpawner.logger.warn('tryPlacePendingSections: renderer not yet constructed')
            return false
        }
        if (!this.stockStrategy) {
            GameBoxSpawner.logger.warn('tryPlacePendingSections: no stock strategy')
            return false
        }
        if (this.shelfPositions.size === 0) {
            GameBoxSpawner.logger.debug('tryPlacePendingSections: waiting for shelf positions')
            return false
        }
        return true
    }

    private tryPlacePendingSections(): void {
        const sections = this.pendingSections
        const stockStrategy = this.stockStrategy
        if (!this.canPlacePendingSections()) return
        this.placeSections(sections, stockStrategy)
        this.pendingSections = null
        this.layoutDeterminedSinceLastSections = false
    }

    private placeSections(
        detail: SectionsReadyForPlacementEvent,
        stockStrategy: IStockStrategy
    ): void {
        const { sections } = detail
        const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)
        if (shelfSurfaces.length === 0) {
            GameBoxSpawner.logger.warn('placeSections: no shelf surfaces found')
            return
        }

        const sectionShelvesByIndex = sections.map((sectionEntry) =>
            [...this.shelfPositions.entries()]
                .filter(([, shelf]) => shelf.sectionIndex === sectionEntry.sectionIndex)
                .sort(([a], [b]) => a - b)
        )

        const totalSectionShelves = sectionShelvesByIndex.reduce((sum, s) => sum + s.length, 0)
        if (totalSectionShelves === 0) {
            GameBoxSpawner.logger.debug('placeSections: no section shelves available for this run')
            return
        }

        const placementRunId = ++this.placementRunSequence
        const totalGames = sections.reduce((sum, sectionEntry) => sum + sectionEntry.section.games.length, 0)

        GameBoxSpawner.logger.info(
            `Placement run ${placementRunId}: sections=${sections.length}, ` +
            `games=${totalGames}, shelves=${totalSectionShelves}`
        )

        EventManager.getInstance().emit<PlacementRunResetRequestedEvent>(
            GameRenderEventTypes.PlacementRunResetRequested,
            {}
        )

        let shelvesUsed = 0
        for (let i = 0; i < sections.length; i++) {
            shelvesUsed += this.placeSection(sections[i].section, sectionShelvesByIndex[i], shelfSurfaces, stockStrategy)
        }

        GameBoxSpawner.logger.debug(`Placement intents emitted across ${shelvesUsed} shelves`)
    }

    private placeSection(
        section: SectionsReadyForPlacementEvent['sections'][number]['section'],
        sectionShelves: [number, ShelfPosition][],
        shelfSurfaces: ShelfSurface[],
        stockStrategy: IStockStrategy
    ): number {
        const gameQueue = [...section.games] as SteamGameData[]
        let shelvesUsed = 0

        for (const [shelfIndex, shelfPos] of sectionShelves) {
            if (gameQueue.length === 0) break
            const stockSurfaces = GameBoxUtils.buildStockSurfaces(
                shelfPos.position, shelfPos.rotationY, shelfSurfaces, { strategy: stockStrategy }
            )
            const batch = gameQueue.splice(0, stockSurfaces.reduce((sum, s) => sum + s.capacity, 0))
            this.assignIntentsFromStock(stockSurfaces, batch)
            EventManager.getInstance().emit<GamesPlacedEvent>(
                StorePropsEventTypes.GamesPlaced,
                { batchIndex: shelfIndex, status: BatchProcessingStatus.GamesPlaced }
            )
            shelvesUsed++
        }

        if (gameQueue.length > 0) {
            GameBoxSpawner.logger.warn(`Section "${section.name}": ${gameQueue.length} games had no shelf space`)
        }
        return shelvesUsed
    }

    private assignIntentsFromStock(stockSurfaces: StockSurface[], games: SteamGameData[]): void {
        const intents = GameBoxUtils.stockSurfaces(stockSurfaces, games)
        for (const { game, position, rotation } of intents) {
            const appid = typeof game.appid === 'number' ? game.appid : 0
            EventManager.getInstance().emit<PlacementIntentReadyEvent>(
                GameRenderEventTypes.PlacementIntentReady,
                { appid, game, position, rotation }
            )
        }
    }

}
