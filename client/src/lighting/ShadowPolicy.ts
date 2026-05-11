import * as THREE from 'three'

export interface ShadowConfig {
    shadowQuality?: number
    shadowMapEnabled?: boolean
}

export interface RoomFootprint {
    width: number
    depth: number
}

const SHADOW_MAP_SIZES = {
    LOW: 512,
    MEDIUM: 1024,
    HIGH: 2048,
    ULTRA: 4096
} as const

export function getShadowMapSizeForQuality(shadowQuality: number): number {
    switch (shadowQuality) {
        case 0: return 0
        case 1: return SHADOW_MAP_SIZES.LOW
        case 2: return SHADOW_MAP_SIZES.MEDIUM
        case 3: return SHADOW_MAP_SIZES.HIGH
        case 4: return SHADOW_MAP_SIZES.ULTRA
        default: return SHADOW_MAP_SIZES.MEDIUM
    }
}

export function shouldCastShadows(config: ShadowConfig): boolean {
    return config.shadowMapEnabled !== false && (config.shadowQuality ?? 0) > 0
}

export function applyRendererShadowPolicy(renderer: THREE.WebGLRenderer, config: ShadowConfig): void {
    const shadowQuality = config.shadowQuality || 0
    const shadowMapEnabled = config.shadowMapEnabled !== false

    if (!shadowMapEnabled || shadowQuality === 0) {
        renderer.shadowMap.enabled = false
        return
    }

    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = shadowQuality >= 4
        ? THREE.VSMShadowMap
        : THREE.PCFSoftShadowMap
}

export function applyLightShadowPolicy(
    light: THREE.DirectionalLight | THREE.SpotLight,
    config: ShadowConfig
): void {
    if (!shouldCastShadows(config)) {
        light.castShadow = false
        return
    }

    const shadowMapSize = getShadowMapSizeForQuality(config.shadowQuality || 0)
    light.castShadow = true
    light.shadow.mapSize.width = shadowMapSize
    light.shadow.mapSize.height = shadowMapSize
}

export function fitDirectionalShadowCamera(
    light: THREE.DirectionalLight,
    footprint: RoomFootprint
): void {
    const halfWidth = Math.max(10, footprint.width * 0.6)
    const halfDepth = Math.max(8, footprint.depth * 0.6)
    light.shadow.camera.left = -halfWidth
    light.shadow.camera.right = halfWidth
    light.shadow.camera.top = halfDepth
    light.shadow.camera.bottom = -halfDepth
    light.shadow.camera.near = 0.5
    light.shadow.camera.far = 40
    light.shadow.camera.updateProjectionMatrix()
}

export function configureDirectionalShadow(
    light: THREE.DirectionalLight,
    config: ShadowConfig,
    footprint: RoomFootprint
): void {
    applyLightShadowPolicy(light, config)
    if (!light.castShadow) return

    light.shadow.bias = -0.0006
    light.shadow.normalBias = 0.015
    fitDirectionalShadowCamera(light, footprint)
}

export function refitDirectionalShadowCameras(
    group: THREE.Group,
    footprint: RoomFootprint
): void {
    group.traverse((child) => {
        if (!(child instanceof THREE.DirectionalLight)) return
        if (!child.castShadow) return
        fitDirectionalShadowCamera(child, footprint)
    })
}
