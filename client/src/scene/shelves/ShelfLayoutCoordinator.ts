import { EventManager } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'
import {
    GameEventTypes,
    StorePropsEventTypes,
    type ShelfLayoutDeterminedEvent,
    type ShelfPlacementReadyEvent,
} from '../../types/InteractionEvents'
import type { GamesSortEvent } from '../../types/EnvironmentEvents'
import { computeArcShelfLayout, type ArcLayoutConfig } from '../props/shared/ArcLayoutUtils'

/**
 * ShelfLayoutCoordinator
 *
 * Listens to GamesSort. When it fires, computes the full arc shelf layout
 * for the sorted game count, emits ShelfLayoutDetermined (bounds), then
 * emits one ShelfPlacementReady per shelf.
 *
 * This is the layout authority: it decides how many shelves exist and
 * where they go. It knows nothing about GPU, textures, or game content.
 *
 * ShelfRenderer listens downstream and handles GPU writes.
 */
export class ShelfLayoutCoordinator {
    private static readonly logger = Logger.createLogFunctions(ShelfLayoutCoordinator.name)

    private static readonly BATCH_SIZE = 18
    private static readonly SHELF_WIDTH = 2.0
    private static readonly SHELF_DEPTH = 1.0
    private static readonly FIXED_ROWS_COUNT = 4 + 6 + 10 + 12 // 32 — row 0–3 fixed counts

    constructor() {
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.GamesSort,
            (event: CustomEvent<GamesSortEvent>) => this.handleGamesSort(event.detail)
        )
        ShelfLayoutCoordinator.logger.debug('ShelfLayoutCoordinator subscribed to GamesSort')
    }

    private handleGamesSort(detail: GamesSortEvent): void {
        const totalShelves = Math.ceil(detail.sortedGames.length / ShelfLayoutCoordinator.BATCH_SIZE)
        if (totalShelves === 0) {
            ShelfLayoutCoordinator.logger.warn('GamesSort fired with 0 games — no shelves to place')
            return
        }

        ShelfLayoutCoordinator.logger.debug(`Computing arc layout for ${totalShelves} shelves (${detail.sortedGames.length} games)`)

        const arcConfig: ArcLayoutConfig = {
            rows: 5,
            shelvesPerRow: 10,
            shelvesPerRowByRow: [
                4,
                6,
                10,
                12,
                Math.max(1, totalShelves - ShelfLayoutCoordinator.FIXED_ROWS_COUNT),
            ],
            halfAngle: Math.PI / 3,
            halfAngleByRow: [
                Math.PI / 3.5,
                Math.PI / 3.5,
                Math.PI / 3,
                Math.PI / 3,
                Math.PI / 2.6,
            ],
            minShelfGap: 1.0,
            shelfWidthMetres: 2.0,
            rowRadiusStep: 4.0,
            firstRowRadius: 5.5,
        }

        const shelves = computeArcShelfLayout(totalShelves, arcConfig)

        // Compute bounds for room/lighting systems
        const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
        const hw = ShelfLayoutCoordinator.SHELF_WIDTH / 2
        const hd = ShelfLayoutCoordinator.SHELF_DEPTH / 2
        for (const s of shelves) {
            bounds.minX = Math.min(bounds.minX, s.position.x - hw)
            bounds.maxX = Math.max(bounds.maxX, s.position.x + hw)
            bounds.minZ = Math.min(bounds.minZ, s.position.z - hd)
            bounds.maxZ = Math.max(bounds.maxZ, s.position.z + hd)
        }

        EventManager.getInstance().emit<ShelfLayoutDeterminedEvent>(
            GameEventTypes.ShelfLayoutDetermined,
            {
                shelfBounds: bounds,
                shelfLayout: {
                    rows: (shelves[shelves.length - 1]?.row ?? 0) + 1,
                    shelvesPerRow: 10,
                },
            }
        )

        // Emit one placement event per shelf — ShelfRenderer and other listeners handle their slice
        for (let i = 0; i < shelves.length; i++) {
            const s = shelves[i]
            EventManager.getInstance().emit<ShelfPlacementReadyEvent>(
                StorePropsEventTypes.ShelfPlacementReady,
                {
                    shelfId: i,
                    totalShelves: shelves.length,
                    position: s.position,
                    rotationY: s.rotationY,
                    rowIndex: s.row,
                    shelfIndex: i % 10,
                }
            )
        }

        ShelfLayoutCoordinator.logger.debug(`Emitted ${shelves.length} ShelfPlacementReady events`)
    }

    public dispose(): void {
        // EventManager cleanup handled by removeAllListeners at scene teardown
    }
}
