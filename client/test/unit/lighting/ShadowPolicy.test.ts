import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
    shouldCastShadows,
    applyRendererShadowPolicy,
    getShadowMapSizeForQuality,
    configureDirectionalShadow,
    configureDirectionalShadowForShelfContact,
} from '../../../src/lighting/ShadowPolicy'

function makeFakeRenderer(): THREE.WebGLRenderer {
    return {
        shadowMap: {
            enabled: false,
            type: THREE.BasicShadowMap,
        },
    } as unknown as THREE.WebGLRenderer
}

describe('ShadowPolicy', () => {
    describe('shouldCastShadows', () => {
        it('returns true when shadows enabled and quality > 0', () => {
            expect(shouldCastShadows({ shadowMapEnabled: true, shadowQuality: 2 })).toBe(true)
        })

        it('returns false when quality is 0', () => {
            expect(shouldCastShadows({ shadowMapEnabled: true, shadowQuality: 0 })).toBe(false)
        })

        it('returns false when shadowMapEnabled is false', () => {
            expect(shouldCastShadows({ shadowMapEnabled: false, shadowQuality: 2 })).toBe(false)
        })

        it('returns false with empty config — undefined quality treated as off', () => {
            expect(shouldCastShadows({})).toBe(false)
        })
    })

    describe('getShadowMapSizeForQuality', () => {
        it.each([
            [0, 0],
            [1, 512],
            [2, 1024],
            [3, 2048],
            [4, 4096],
        ])('quality %i → size %i', (quality, expected) => {
            expect(getShadowMapSizeForQuality(quality)).toBe(expected)
        })

        it('defaults to medium (1024) for unrecognised quality values', () => {
            expect(getShadowMapSizeForQuality(99)).toBe(1024)
        })
    })

    describe('applyRendererShadowPolicy', () => {
        it('enables shadow map when shadowMapEnabled=true and quality>0', () => {
            const renderer = makeFakeRenderer()
            applyRendererShadowPolicy(renderer, { shadowMapEnabled: true, shadowQuality: 2 })
            expect(renderer.shadowMap.enabled).toBe(true)
        })

        it('disables shadow map when shadowMapEnabled=false', () => {
            const renderer = makeFakeRenderer()
            renderer.shadowMap.enabled = true
            applyRendererShadowPolicy(renderer, { shadowMapEnabled: false, shadowQuality: 2 })
            expect(renderer.shadowMap.enabled).toBe(false)
        })

        it('disables shadow map when quality=0', () => {
            const renderer = makeFakeRenderer()
            renderer.shadowMap.enabled = true
            applyRendererShadowPolicy(renderer, { shadowMapEnabled: true, shadowQuality: 0 })
            expect(renderer.shadowMap.enabled).toBe(false)
        })

        it('uses VSMShadowMap at quality 4', () => {
            const renderer = makeFakeRenderer()
            applyRendererShadowPolicy(renderer, { shadowMapEnabled: true, shadowQuality: 4 })
            expect(renderer.shadowMap.type).toBe(THREE.VSMShadowMap)
        })

        it('uses PCFSoftShadowMap for quality 1–3', () => {
            const renderer = makeFakeRenderer()
            applyRendererShadowPolicy(renderer, { shadowMapEnabled: true, shadowQuality: 2 })
            expect(renderer.shadowMap.type).toBe(THREE.PCFSoftShadowMap)
        })
    })

    describe('configureDirectionalShadow', () => {
        it('enables castShadow when config allows', () => {
            const light = new THREE.DirectionalLight()
            configureDirectionalShadow(light, { shadowMapEnabled: true, shadowQuality: 2 }, { width: 20, depth: 16 })
            expect(light.castShadow).toBe(true)
        })

        it('disables castShadow when shadowMapEnabled=false', () => {
            const light = new THREE.DirectionalLight()
            light.castShadow = true
            configureDirectionalShadow(light, { shadowMapEnabled: false, shadowQuality: 2 }, { width: 20, depth: 16 })
            expect(light.castShadow).toBe(false)
        })

        it('sets shadow map size from quality', () => {
            const light = new THREE.DirectionalLight()
            configureDirectionalShadow(light, { shadowMapEnabled: true, shadowQuality: 3 }, { width: 20, depth: 16 })
            expect(light.shadow.mapSize.width).toBe(2048)
            expect(light.shadow.mapSize.height).toBe(2048)
        })

        it('fits shadow camera frustum to room footprint', () => {
            const light = new THREE.DirectionalLight()
            configureDirectionalShadow(light, { shadowMapEnabled: true, shadowQuality: 2 }, { width: 20, depth: 16 })
            expect(light.shadow.camera.left).toBeLessThan(0)
            expect(light.shadow.camera.right).toBeGreaterThan(0)
            expect(light.shadow.camera.top).toBeGreaterThan(0)
            expect(light.shadow.camera.bottom).toBeLessThan(0)
        })

        it('skips frustum setup when shadow disabled', () => {
            const light = new THREE.DirectionalLight()
            const originalLeft = light.shadow.camera.left
            configureDirectionalShadow(light, { shadowMapEnabled: false, shadowQuality: 2 }, { width: 20, depth: 16 })
            expect(light.shadow.camera.left).toBe(originalLeft)
        })
    })

    describe('configureDirectionalShadowForShelfContact', () => {
        it('enables castShadow and applies contact tuning biases', () => {
            const light = new THREE.DirectionalLight()
            configureDirectionalShadowForShelfContact(
                light,
                { shadowMapEnabled: true, shadowQuality: 2 },
                { width: 20, depth: 16 },
                { bias: -0.002, normalBias: 0.01 }
            )
            expect(light.castShadow).toBe(true)
            expect(light.shadow.bias).toBe(-0.002)
            expect(light.shadow.normalBias).toBe(0.01)
        })

        it('uses tighter footprint fraction than configureDirectionalShadow', () => {
            const footprint = { width: 20, depth: 20 }
            const standardLight = new THREE.DirectionalLight()
            const contactLight = new THREE.DirectionalLight()

            configureDirectionalShadow(standardLight, { shadowMapEnabled: true, shadowQuality: 2 }, footprint)
            configureDirectionalShadowForShelfContact(contactLight, { shadowMapEnabled: true, shadowQuality: 2 }, footprint)

            expect(Math.abs(contactLight.shadow.camera.right)).toBeLessThan(Math.abs(standardLight.shadow.camera.right))
        })
    })
})
