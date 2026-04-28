import { EventManager } from '../../core/EventManager'
import {
    GameRenderEventTypes,
    type ArtworkIntentSettledEvent,
    type PlacementResolvedEvent,
    type PlacementIntentReadyEvent,
} from '../../types/InteractionEvents'

/**
 * Renderer-side rendezvous for placement intents and artwork outcomes.
 * One settled artwork outcome can satisfy many placement intents.
 */
export class RenderIntentCoordinator {
    private readonly settledAppIds = new Set<number>()
    private readonly pendingPlacementIntents = new Map<number, PlacementIntentReadyEvent[]>()

    private readonly boundHandleArtworkIntentSettled: (event: CustomEvent<ArtworkIntentSettledEvent>) => void
    private readonly boundHandlePlacementIntentReady: (event: CustomEvent<PlacementIntentReadyEvent>) => void

    public constructor() {
        this.boundHandleArtworkIntentSettled = this.handleArtworkIntentSettled.bind(this)
        this.boundHandlePlacementIntentReady = this.handlePlacementIntentReady.bind(this)

        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.ArtworkIntentSettled,
            this.boundHandleArtworkIntentSettled
        )
        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementIntentReady,
            this.boundHandlePlacementIntentReady
        )
    }

    public clearPendingPlacementIntents(): void {
        this.pendingPlacementIntents.clear()
    }

    public dispose(): void {
        EventManager.getInstance().deregisterEventHandler(
            GameRenderEventTypes.ArtworkIntentSettled,
            this.boundHandleArtworkIntentSettled
        )
        EventManager.getInstance().deregisterEventHandler(
            GameRenderEventTypes.PlacementIntentReady,
            this.boundHandlePlacementIntentReady
        )

        this.pendingPlacementIntents.clear()
        this.settledAppIds.clear()
    }

    private handleArtworkIntentSettled(event: CustomEvent<ArtworkIntentSettledEvent>): void {
        const { appid } = event.detail
        this.settledAppIds.add(appid)
        this.flushReadyPlacements(appid)
    }

    private handlePlacementIntentReady(event: CustomEvent<PlacementIntentReadyEvent>): void {
        const { appid } = event.detail
        const pending = this.pendingPlacementIntents.get(appid) ?? []
        pending.push(event.detail)
        this.pendingPlacementIntents.set(appid, pending)
        this.flushReadyPlacements(appid)
    }

    private flushReadyPlacements(appid: number): void {
        if (!this.settledAppIds.has(appid)) {
            return
        }

        const pending = this.pendingPlacementIntents.get(appid)
        if (!pending || pending.length === 0) {
            return
        }

        while (pending.length > 0) {
            const intent = pending.shift()
            if (!intent) {
                break
            }
            EventManager.getInstance().emit<PlacementResolvedEvent>(
                GameRenderEventTypes.PlacementResolved,
                {
                    appid,
                    game: intent.game,
                    position: intent.position,
                    rotation: intent.rotation,
                }
            )
        }

        this.pendingPlacementIntents.delete(appid)
    }
}
