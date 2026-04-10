import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../../src/core/EventManager'
import { StorePropsEventTypes, type ShelfReadyEvent } from '../../../../src/types/InteractionEvents'
import { ShelfRenderer } from '../../../../src/scene/shelves/ShelfRenderer'

describe('ShelfRenderer', () => {
    let eventManager: EventManager

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
    })

    it('emits ShelfReady with minimal authoritative transform payload', () => {
        const renderer = new ShelfRenderer()
        const position = new THREE.Vector3(1, 2, 3)
        let received: ShelfReadyEvent | null = null

        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => {
                received = event.detail
            }
        )

        renderer.emitShelfReady(7, position, Math.PI)

        expect(received).toBeTruthy()
        expect(received?.shelfId).toBe(7)
        expect(received?.rotationY).toBe(Math.PI)
        expect(received?.position).toEqual(position)
        expect(received?.position).not.toBe(position)
    })
})
