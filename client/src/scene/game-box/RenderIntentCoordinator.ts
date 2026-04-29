import { EventManager } from '../../core/EventManager'
import {
    GameRenderEventTypes,
    StorePropsEventTypes,
    type ArtworkIntentSettledEvent,
    type PlacementRunResetRequestedEvent,
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
    private readonly boundHandleRunResetRequested: (event: CustomEvent<PlacementRunResetRequestedEvent>) => void
    private readonly boundHandleLibraryReloadRequested: (event: CustomEvent<unknown>) => void

    public constructor() {
        this.boundHandleArtworkIntentSettled = this.handleArtworkIntentSettled.bind(this)
        this.boundHandlePlacementIntentReady = this.handlePlacementIntentReady.bind(this)
        this.boundHandleRunResetRequested = this.handleRunResetRequested.bind(this)
        this.boundHandleLibraryReloadRequested = this.handleLibraryReloadRequested.bind(this)

        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.ArtworkIntentSettled,
            this.boundHandleArtworkIntentSettled
        )
        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementIntentReady,
            this.boundHandlePlacementIntentReady
        )
        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementRunResetRequested,
            this.boundHandleRunResetRequested
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            this.boundHandleLibraryReloadRequested
        )
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
        EventManager.getInstance().deregisterEventHandler(
            GameRenderEventTypes.PlacementRunResetRequested,
            this.boundHandleRunResetRequested
        )
        EventManager.getInstance().deregisterEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            this.boundHandleLibraryReloadRequested
        )

        this.clearAllState()
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

    private handleRunResetRequested(_event: CustomEvent<PlacementRunResetRequestedEvent>): void {
        this.clearPendingState()
    }

    private handleLibraryReloadRequested(_event: CustomEvent<unknown>): void {
        this.clearAllState()
    }

    private clearPendingState(): void {
        this.pendingPlacementIntents.clear()
    }

    private clearAllState(): void {
        this.clearPendingState()
        this.settledAppIds.clear()
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
