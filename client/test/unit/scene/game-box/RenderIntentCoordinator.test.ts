import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'

import { EventManager } from '../../../../src/core/EventManager'
import { RenderIntentCoordinator } from '../../../../src/scene/game-box/RenderIntentCoordinator'
import {
    GameRenderEventTypes,
    type ArtworkIntentSettledEvent,
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

    it('places textured games when artwork settles before placement intent', () => {
        const placeTexturedGame = vi.fn()
        const placeLabelGame = vi.fn()

        const coordinator = new RenderIntentCoordinator({
            placeTexturedGame,
            placeLabelGame,
        })

        EventManager.getInstance().emit<ArtworkIntentSettledEvent>(
            GameRenderEventTypes.ArtworkIntentSettled,
            { appid: 7, gameName: 'Game 7', result: 'prefetched' }
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

        expect(placeTexturedGame).toHaveBeenCalledTimes(1)
        expect(placeLabelGame).not.toHaveBeenCalled()

        coordinator.dispose()
    })

    it('places label boxes for failure outcomes and fans out to multiple intents', () => {
        const placeTexturedGame = vi.fn()
        const placeLabelGame = vi.fn()

        const coordinator = new RenderIntentCoordinator({
            placeTexturedGame,
            placeLabelGame,
        })

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
            { appid: 42, gameName: 'Shared Game', result: 'permanent-failure' }
        )

        expect(placeTexturedGame).not.toHaveBeenCalled()
        expect(placeLabelGame).toHaveBeenCalledTimes(2)

        coordinator.dispose()
    })
})
