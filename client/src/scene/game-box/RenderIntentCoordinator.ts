import * as THREE from 'three'
import type { SteamGameData } from './types/GameData'
import { EventManager } from '../../core/EventManager'
import {
    GameRenderEventTypes,
    type ArtworkIntentSettledEvent,
    type PlacementIntentReadyEvent,
} from '../../types/InteractionEvents'

interface RenderIntentCoordinatorOptions {
    placeTexturedGame: (game: SteamGameData, position: THREE.Vector3, rotation: THREE.Quaternion) => void
    placeLabelGame: (game: SteamGameData, position: THREE.Vector3, rotation: THREE.Quaternion) => void
}

/**
 * Renderer-side rendezvous for placement intents and artwork outcomes.
 * One settled artwork outcome can satisfy many placement intents.
 */
export class RenderIntentCoordinator {
    private readonly placeTexturedGame: RenderIntentCoordinatorOptions['placeTexturedGame']
    private readonly placeLabelGame: RenderIntentCoordinatorOptions['placeLabelGame']

    private readonly artworkOutcomes = new Map<number, ArtworkIntentSettledEvent['result']>()
    private readonly pendingPlacementIntents = new Map<number, PlacementIntentReadyEvent[]>()

    private readonly boundHandleArtworkIntentSettled: (event: CustomEvent<ArtworkIntentSettledEvent>) => void
    private readonly boundHandlePlacementIntentReady: (event: CustomEvent<PlacementIntentReadyEvent>) => void

    public constructor(options: RenderIntentCoordinatorOptions) {
        this.placeTexturedGame = options.placeTexturedGame
        this.placeLabelGame = options.placeLabelGame

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
        this.artworkOutcomes.clear()
    }

    private handleArtworkIntentSettled(event: CustomEvent<ArtworkIntentSettledEvent>): void {
        const { appid, result } = event.detail
        this.artworkOutcomes.set(appid, result)
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
        const outcome = this.artworkOutcomes.get(appid)
        if (outcome === undefined) {
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

            if (outcome === 'permanent-failure' || outcome === 'error') {
                this.placeLabelGame(intent.game, intent.position, intent.rotation)
                continue
            }

            this.placeTexturedGame(intent.game, intent.position, intent.rotation)
        }

        this.pendingPlacementIntents.delete(appid)
    }
}
