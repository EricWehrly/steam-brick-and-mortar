import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'

import { EventManager } from '../../../../src/core/EventManager'
import { RenderIntentCoordinator } from '../../../../src/scene/game-box/RenderIntentCoordinator'
import {
    GameRenderEventTypes,
    type ArtworkIntentSettledEvent,
    type PlacementResolvedEvent,
    type PlacementIntentReadyEvent,
} from '../../../../src/types/InteractionEvents'

const makeGame = (appid: number, name = `Game ${appid}`) => ({
    appid,
    name,
    playtime_forever: 0,
    img_icon_url: '',
    img_logo_url: '',
})

describe('RenderIntentCoordinator', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
    })

    afterEach(() => {
        EventManager.getInstance().removeAllListeners()
    })

    it('emits placement-resolved when artwork settles before placement intent', () => {
        const coordinator = new RenderIntentCoordinator()
        const resolved: PlacementResolvedEvent[] = []

        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementResolved,
            (event: CustomEvent<PlacementResolvedEvent>) => resolved.push(event.detail)
        )

        EventManager.getInstance().emit<ArtworkIntentSettledEvent>(
            GameRenderEventTypes.ArtworkIntentSettled,
            { appid: 7, gameName: 'Game 7' }
        )
        EventManager.getInstance().emit<PlacementIntentReadyEvent>(
            GameRenderEventTypes.PlacementIntentReady,
            {
                appid: 7,
                game: makeGame(7),
                position: new THREE.Vector3(1, 2, 3),
                rotation: new THREE.Quaternion(),
            } as any
        )

        expect(resolved).toHaveLength(1)
        expect(resolved[0]?.appid).toBe(7)
        expect(resolved[0]?.game.name).toBe('Game 7')

        coordinator.dispose()
    })

    it('fans out one settled signal to multiple placement intents', () => {
        const coordinator = new RenderIntentCoordinator()
        const resolved: PlacementResolvedEvent[] = []

        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementResolved,
            (event: CustomEvent<PlacementResolvedEvent>) => resolved.push(event.detail)
        )

        EventManager.getInstance().emit<PlacementIntentReadyEvent>(
            GameRenderEventTypes.PlacementIntentReady,
            {
                appid: 42,
                game: makeGame(42, 'Shared Game'),
                position: new THREE.Vector3(0, 0, 0),
                rotation: new THREE.Quaternion(),
            } as any
        )
        EventManager.getInstance().emit<PlacementIntentReadyEvent>(
            GameRenderEventTypes.PlacementIntentReady,
            {
                appid: 42,
                game: makeGame(42, 'Shared Game'),
                position: new THREE.Vector3(3, 0, 0),
                rotation: new THREE.Quaternion(),
            } as any
        )

        EventManager.getInstance().emit<ArtworkIntentSettledEvent>(
            GameRenderEventTypes.ArtworkIntentSettled,
            { appid: 42, gameName: 'Shared Game' }
        )

        expect(resolved).toHaveLength(2)
        expect(resolved.every(event => event.appid === 42)).toBe(true)

        coordinator.dispose()
    })

    it('clears stale pending placement intents only when explicitly reset', () => {
        const coordinator = new RenderIntentCoordinator()
        const resolved: PlacementResolvedEvent[] = []

        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementResolved,
            (event: CustomEvent<PlacementResolvedEvent>) => resolved.push(event.detail)
        )

        EventManager.getInstance().emit<PlacementIntentReadyEvent>(
            GameRenderEventTypes.PlacementIntentReady,
            {
                appid: 9,
                game: makeGame(9),
                position: new THREE.Vector3(9, 0, 0),
                rotation: new THREE.Quaternion(),
            } as any
        )

        coordinator.clearPendingPlacementIntents()

        EventManager.getInstance().emit<ArtworkIntentSettledEvent>(
            GameRenderEventTypes.ArtworkIntentSettled,
            { appid: 9, gameName: 'Game 9' }
        )

        expect(resolved).toHaveLength(0)

        coordinator.dispose()
    })

    it('does not replay stale intents after reset on re-sort, but resolves new intents', () => {
        const coordinator = new RenderIntentCoordinator()
        const resolved: PlacementResolvedEvent[] = []

        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementResolved,
            (event: CustomEvent<PlacementResolvedEvent>) => resolved.push(event.detail)
        )

        // Run 1 emits an intent before artwork settles.
        EventManager.getInstance().emit<PlacementIntentReadyEvent>(
            GameRenderEventTypes.PlacementIntentReady,
            {
                appid: 11,
                game: makeGame(11),
                position: new THREE.Vector3(1, 0, 0),
                rotation: new THREE.Quaternion(),
            } as any
        )

        // Re-sort clear: stale pending intents must be dropped before settlement.
        coordinator.clearPendingPlacementIntents()

        EventManager.getInstance().emit<ArtworkIntentSettledEvent>(
            GameRenderEventTypes.ArtworkIntentSettled,
            { appid: 11, gameName: 'Game 11' }
        )
        expect(resolved).toHaveLength(0)

        // Run 2 emits a fresh intent for the same appid; this one should resolve.
        EventManager.getInstance().emit<PlacementIntentReadyEvent>(
            GameRenderEventTypes.PlacementIntentReady,
            {
                appid: 11,
                game: makeGame(11),
                position: new THREE.Vector3(2, 0, 0),
                rotation: new THREE.Quaternion(),
            } as any
        )

        expect(resolved).toHaveLength(1)
        expect(resolved[0]?.appid).toBe(11)
        expect(resolved[0]?.position).toEqual(new THREE.Vector3(2, 0, 0))

        coordinator.dispose()
    })
})
