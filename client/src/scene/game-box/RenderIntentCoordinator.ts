import { EventManager } from '../../core/EventManager'
import {
    GameRenderEventTypes,
    UIEventTypes,
    StorePropsEventTypes,
    type ArtworkIntentSettledEvent,
    type PlacementResolvedEvent,
    type PlacementIntentReadyEvent,
    type ArrangementRequestedEvent,
    type LayoutRequestedEvent,
    type StorePropsLibraryReloadRequestEvent,
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
    private readonly boundHandleArrangementRequested: (event: CustomEvent<ArrangementRequestedEvent>) => void
    private readonly boundHandleLayoutRequested: (event: CustomEvent<LayoutRequestedEvent>) => void
    private readonly boundHandleLibraryReloadRequest: (event: CustomEvent<StorePropsLibraryReloadRequestEvent>) => void

    public constructor() {
        this.boundHandleArtworkIntentSettled = this.handleArtworkIntentSettled.bind(this)
        this.boundHandlePlacementIntentReady = this.handlePlacementIntentReady.bind(this)
        this.boundHandleArrangementRequested = this.handleArrangementRequested.bind(this)
        this.boundHandleLayoutRequested = this.handleLayoutRequested.bind(this)
        this.boundHandleLibraryReloadRequest = this.handleLibraryReloadRequest.bind(this)

        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.ArtworkIntentSettled,
            this.boundHandleArtworkIntentSettled
        )
        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementIntentReady,
            this.boundHandlePlacementIntentReady
        )
        EventManager.getInstance().registerEventHandler(
            UIEventTypes.ArrangementRequested,
            this.boundHandleArrangementRequested
        )
        EventManager.getInstance().registerEventHandler(
            UIEventTypes.LayoutRequested,
            this.boundHandleLayoutRequested
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            this.boundHandleLibraryReloadRequest
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
            UIEventTypes.ArrangementRequested,
            this.boundHandleArrangementRequested
        )
        EventManager.getInstance().deregisterEventHandler(
            UIEventTypes.LayoutRequested,
            this.boundHandleLayoutRequested
        )
        EventManager.getInstance().deregisterEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            this.boundHandleLibraryReloadRequest
        )

        this.clearRunState()
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

    private handleArrangementRequested(_event: CustomEvent<ArrangementRequestedEvent>): void {
        this.clearRunState()
    }

    private handleLayoutRequested(_event: CustomEvent<LayoutRequestedEvent>): void {
        this.clearRunState()
    }

    private handleLibraryReloadRequest(_event: CustomEvent<StorePropsLibraryReloadRequestEvent>): void {
        this.clearRunState()
    }

    private clearRunState(): void {
        this.pendingPlacementIntents.clear()
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
