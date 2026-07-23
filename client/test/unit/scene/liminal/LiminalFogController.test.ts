import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../../../src/core/data/DataTypes'
import { EventManager } from '../../../../src/core/EventManager'
import { LiminalFogController } from '../../../../src/scene/liminal/LiminalFogController'
import { GameEventTypes, type ShelfLayoutDeterminedEvent } from '../../../../src/types/InteractionEvents'

function emitShelfLayoutDetermined(layoutMode?: string): void {
    EventManager.getInstance().emit<ShelfLayoutDeterminedEvent>(GameEventTypes.ShelfLayoutDetermined, {
        layoutMode: layoutMode as any,
        shelfBounds: { minX: -10, maxX: 10, minZ: -20, maxZ: -2 },
        shelfLayout: { rows: 1 },
        stockStrategy: { order: (boards: any[]) => boards } as any,
    })
}

describe('LiminalFogController', () => {
    let scene: THREE.Scene

    beforeEach(() => {
        EventManager['instance'] = undefined as unknown as EventManager
        scene = new THREE.Scene()

        const dataManager = DataManager.getInstance()
        dataManager.set(DataKey.MainScene, scene, { domain: DataDomain.Scene })

        new LiminalFogController()
    })

    afterEach(() => {
        EventManager.getInstance().removeAllListeners()
        EventManager['instance'] = undefined as unknown as EventManager
    })

    it('adds fog when liminal layout is determined', () => {
        expect(scene.fog).toBeNull()
        emitShelfLayoutDetermined('liminal')
        expect(scene.fog).toBeInstanceOf(THREE.Fog)
    })

    it('leaves fog off for non-liminal layouts', () => {
        emitShelfLayoutDetermined('row')
        expect(scene.fog).toBeNull()

        emitShelfLayoutDetermined('arc')
        expect(scene.fog).toBeNull()
    })

    it('clears fog when switching away from liminal', () => {
        emitShelfLayoutDetermined('liminal')
        expect(scene.fog).toBeInstanceOf(THREE.Fog)

        emitShelfLayoutDetermined('row')
        expect(scene.fog).toBeNull()
    })

    it('fog far distance exceeds near distance', () => {
        emitShelfLayoutDetermined('liminal')
        const fog = scene.fog as THREE.Fog
        expect(fog.far).toBeGreaterThan(fog.near)
        expect(fog.near).toBeGreaterThan(0)
    })
})
