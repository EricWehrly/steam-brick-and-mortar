/**
 * Debug Statistics Provider
 * 
 * Provides comprehensive debug statistics for the application.
 * Separated from main app class to reduce complexity.
 */

import * as THREE from 'three'
import type { PerformanceMonitor } from '../ui'
import type { SteamIntegration } from '../steam-integration'
import type { SceneManager } from '../scene'

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
    private sceneManager: SceneManager
    private steamIntegration: SteamIntegration
    private performanceMonitor: PerformanceMonitor

    constructor(
        sceneManager: SceneManager,
        steamIntegration: SteamIntegration,
        performanceMonitor: PerformanceMonitor
    ) {
        this.sceneManager = sceneManager
        this.steamIntegration = steamIntegration
        this.performanceMonitor = performanceMonitor
    }

    /**
     * Get comprehensive debug statistics
     */
    async getDebugStats(): Promise<DebugStats> {
        const scene = this.sceneManager.getScene()
        const renderer = this.sceneManager.getRenderer()
        const info = renderer.info

        // Count scene objects
        const sceneObjects = this.countSceneObjects(scene)
        
        // Get performance stats
        const performanceStats = this.performanceMonitor.getStats()
        
        // Get cache stats
        const imageCacheStats = await this.steamIntegration.getImageCacheStats()
        
        // Get WebGL context info
        const gl = renderer.getContext()
        const debugInfo = renderer.debug
        
        // Get memory info if available
        const memoryInfo = this.getMemoryInfo()

        // Get storage quota info
        const storageInfo = await this.getStorageInfo()

        return {
            sceneObjects: {
                total: scene.children.length,
                meshes: sceneObjects.meshes,
                lights: sceneObjects.lights,
                cameras: sceneObjects.cameras,
                textures: info.memory.textures,
                materials: Object.keys(scene.userData.materials ?? {}).length,
                geometries: info.memory.geometries
            },
            performance: {
                fps: performanceStats.fps,
                frameTime: performanceStats.frameTime,
                memoryUsed: memoryInfo.usedJSHeapSize,
                memoryTotal: memoryInfo.totalJSHeapSize,
                triangles: info.render.triangles,
                drawCalls: info.render.calls
            },
            cache: {
                imageCount: imageCacheStats.totalImages,
                imageCacheSize: imageCacheStats.totalSize,
                gameDataCount: 0, // TODO: Implement getGameDataCount in SteamIntegration
                gameDataSize: 0, // TODO: Implement getGameDataSize in SteamIntegration
                quotaUsed: storageInfo.quotaUsed,
                quotaTotal: storageInfo.quotaTotal
            },
            system: {
                userAgent: navigator.userAgent,
                webxrSupported: 'xr' in navigator, // Simple check for WebXR support
                webglVersion: renderer.capabilities.isWebGL2 ? 'WebGL 2.0' : 'WebGL 1.0',
                maxTextureSize: renderer.capabilities.maxTextureSize,
                vendor: debugInfo.checkShaderErrors ? 'Debug Mode' : gl.getParameter(gl.VENDOR) ?? 'Unknown',
                renderer: gl.getParameter(gl.RENDERER) ?? 'Unknown'
            }
        }
    }

    private countSceneObjects(scene: THREE.Scene): { meshes: number; lights: number; cameras: number } {
        let meshCount = 0
        let lightCount = 0
        let cameraCount = 0

        scene.traverse((object) => {
            if (object instanceof THREE.Mesh) meshCount++
            if (object instanceof THREE.Light) lightCount++
            if (object instanceof THREE.Camera) cameraCount++
        })

        return {
            meshes: meshCount,
            lights: lightCount,
            cameras: cameraCount
        }
    }

    private getMemoryInfo(): { usedJSHeapSize: number; totalJSHeapSize: number } {
        const performanceObj = window.performance as unknown as { 
            memory?: { usedJSHeapSize: number; totalJSHeapSize: number } 
        }
        
        return performanceObj.memory ?? {
            usedJSHeapSize: 0,
            totalJSHeapSize: 0
        }
    }

    private async getStorageInfo(): Promise<{ quotaUsed: number; quotaTotal: number }> {
        let quotaUsed = 0
        let quotaTotal = 0
        
        try {
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                const estimate = await navigator.storage.estimate()
                quotaUsed = estimate.usage ?? 0
                quotaTotal = estimate.quota ?? 0
            }
        } catch {
            // Storage API not available
        }

        return { quotaUsed, quotaTotal }
    }
}
