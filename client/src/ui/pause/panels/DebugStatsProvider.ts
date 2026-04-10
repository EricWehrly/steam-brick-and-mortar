/**
 * Debug Statistics Provider
 *
 * Provides comprehensive debug statistics for the application.
 * No constructor dependencies — reads scene and renderer from DataManager,
 * and performance stats from the PerformanceMonitorUI registered there.
 */

import * as THREE from 'three'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey } from '../../../core/data/DataTypes'
import type { PerformanceMonitorUI } from '../..'

export interface DebugStats {
    sceneObjects: {
        total: number
        meshes: number
        lights: number
        cameras: number
        textures: number
        materials: number
        geometries: number
    }
    performance: {
        fps: number
        frameTime: number
        memoryUsed: number
        memoryTotal: number
        triangles: number
        drawCalls: number
    }
    cache: {
        imageCount: number
        imageCacheSize: number
        gameDataCount: number
        gameDataSize: number
        quotaUsed: number
        quotaTotal: number
    }
    system: {
        userAgent: string
        webxrSupported: boolean
        webglVersion: string
        maxTextureSize: number
        vendor: string
        renderer: string
    }
}

export class DebugStatsProvider {
    performanceMonitor: PerformanceMonitorUI

    constructor(performanceMonitor: PerformanceMonitorUI) {
        this.performanceMonitor = performanceMonitor
    }

    async getDebugStats(): Promise<DebugStats> {
        const dm = DataManager.getInstance()
        const scene = dm.get<THREE.Scene>(DataKey.MainScene)
        const renderer = dm.get<THREE.WebGLRenderer>(DataKey.Renderer)

        // Scene object counts
        const sceneObjects = scene ? this.countSceneObjects(scene) : { meshes: 0, lights: 0, cameras: 0 }
        const info = renderer?.info

        // TODO: maybe it makes sense to hoist this info somewhere statically accessible... (gotta think it through)
        const perfStats = this.performanceMonitor.getStats() ?? { fps: 0, frameTime: 0, drawCalls: 0, triangles: 0 }

        // Cache stats
        const { PixelDataCache } = await import('../../../scene/game-box/instancing/PixelDataCache')
        const pixelCacheStorage = await PixelDataCache.getInstance().getStorageEstimate()

        // WebGL info
        const gl = renderer?.getContext()
        const memoryInfo = this.getMemoryInfo()
        const storageInfo = await this.getStorageInfo()

        return {
            sceneObjects: {
                total: scene?.children.length ?? 0,
                meshes: sceneObjects.meshes,
                lights: sceneObjects.lights,
                cameras: sceneObjects.cameras,
                textures: info?.memory.textures ?? 0,
                materials: Object.keys(scene?.userData.materials ?? {}).length,
                geometries: info?.memory.geometries ?? 0
            },
            performance: {
                fps: perfStats.fps,
                frameTime: perfStats.frameTime,
                memoryUsed: memoryInfo.usedJSHeapSize,
                memoryTotal: memoryInfo.totalJSHeapSize,
                triangles: info?.render.triangles ?? 0,
                drawCalls: info?.render.calls ?? 0
            },
            cache: {
                imageCount: pixelCacheStorage.count,
                imageCacheSize: Math.round(pixelCacheStorage.estimatedMB * 1024 * 1024),
                gameDataCount: 0,
                gameDataSize: 0,
                quotaUsed: storageInfo.quotaUsed,
                quotaTotal: storageInfo.quotaTotal
            },
            system: {
                userAgent: navigator.userAgent,
                webxrSupported: 'xr' in navigator,
                webglVersion: renderer?.capabilities.isWebGL2 ? 'WebGL 2.0' : 'WebGL 1.0',
                maxTextureSize: renderer?.capabilities.maxTextureSize ?? 0,
                vendor: renderer?.debug.checkShaderErrors
                    ? 'Debug Mode'
                    : (gl?.getParameter(gl.VENDOR) ?? 'Unknown'),
                renderer: gl?.getParameter(gl.RENDERER) ?? 'Unknown'
            }
        }
    }

    // TODO: Scene manager debug wrapper?
    private countSceneObjects(scene: THREE.Scene): { meshes: number; lights: number; cameras: number } {
        let meshes = 0, lights = 0, cameras = 0
        scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh) meshes++
            if (obj instanceof THREE.Light) lights++
            if (obj instanceof THREE.Camera) cameras++
        })
        return { meshes, lights, cameras }
    }

    private getMemoryInfo(): { usedJSHeapSize: number; totalJSHeapSize: number } {
        const perf = window.performance as unknown as {
            memory?: { usedJSHeapSize: number; totalJSHeapSize: number }
        }
        return perf.memory ?? { usedJSHeapSize: 0, totalJSHeapSize: 0 }
    }

    private async getStorageInfo(): Promise<{ quotaUsed: number; quotaTotal: number }> {
        try {
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                const estimate = await navigator.storage.estimate()
                return { quotaUsed: estimate.usage ?? 0, quotaTotal: estimate.quota ?? 0 }
            }
        } catch { /* Storage API not available */ }
        return { quotaUsed: 0, quotaTotal: 0 }
    }
}
