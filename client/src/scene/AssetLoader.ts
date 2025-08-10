/**
 * Asset Loader - 3D Asset Loading and Management
 * 
 * Handles:
 * - GLTF model loading
 * - Asset caching
 * - Loading progress tracking
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface AssetLoadOptions {
    enableShadows?: boolean
    scale?: number
    position?: THREE.Vector3
    rotation?: THREE.Euler
}

export interface LoadProgress {
    loaded: number
    total: number
    percentage: number
}

export class AssetLoader {
    private gltfLoader: GLTFLoader
    private loadedAssets: Map<string, THREE.Group> = new Map()

    constructor() {
        this.gltfLoader = new GLTFLoader()
    }

    /**
     * Load a GLTF model
     */
    public async loadModel(
        path: string, 
        options: AssetLoadOptions = {},
        onProgress?: (progress: LoadProgress) => void
    ): Promise<THREE.Group> {
        // Check if already loaded
        if (this.loadedAssets.has(path)) {
            console.log(`📦 Using cached model: ${path}`)
            const cachedModel = this.loadedAssets.get(path)
            if (cachedModel) {
                return cachedModel.clone()
            }
        }

        try {
            console.log(`📦 Loading model: ${path}`)
            
            const gltf = await this.gltfLoader.loadAsync(path, (progressEvent) => {
                if (onProgress && progressEvent.total > 0) {
                    const progress: LoadProgress = {
                        loaded: progressEvent.loaded,
                        total: progressEvent.total,
                        percentage: Math.round((progressEvent.loaded / progressEvent.total) * 100)
                    }
                    onProgress(progress)
                }
            })

            const model = gltf.scene

            // Apply options
            if (options.scale !== undefined) {
                model.scale.setScalar(options.scale)
            }

            if (options.position) {
                model.position.copy(options.position)
            }

            if (options.rotation) {
                model.rotation.copy(options.rotation)
            }

            // Enable shadows if requested
            if (options.enableShadows ?? true) {
                this.enableShadowsForModel(model)
            }

            // Cache the original model
            this.loadedAssets.set(path, model.clone())

            console.log(`✅ Model loaded successfully: ${path}`)
            return model

        } catch (error) {
            console.error(`❌ Failed to load model: ${path}`, error)
            throw error
        }
    }

    /**
     * Enable shadows for all meshes in a model
     */
    private enableShadowsForModel(model: THREE.Group) {
        model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true
                child.receiveShadow = true
            }
        })
    }

    /**
     * Get cached asset
     */
    public getCachedAsset(path: string): THREE.Group | undefined {
        return this.loadedAssets.get(path)?.clone()
    }

    /**
     * Check if asset is cached
     */
    public isAssetCached(path: string): boolean {
        return this.loadedAssets.has(path)
    }

    /**
     * Clear asset cache
     */
    public clearCache() {
        this.loadedAssets.clear()
        console.log('🗑️ Asset cache cleared')
    }

    /**
     * Get cache statistics
     */
    public getCacheStats() {
        return {
            cachedAssets: this.loadedAssets.size,
            assetPaths: Array.from(this.loadedAssets.keys())
        }
    }

    /**
     * Preload multiple assets
     */
    public async preloadAssets(
        assets: { path: string; options?: AssetLoadOptions }[],
        onProgress?: (current: number, total: number, currentAsset: string) => void
    ): Promise<THREE.Group[]> {
        const loadedModels: THREE.Group[] = []

        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i]
            
            if (onProgress) {
                onProgress(i, assets.length, asset.path)
            }

            try {
                const model = await this.loadModel(asset.path, asset.options)
                loadedModels.push(model)
            } catch (error) {
                console.warn(`⚠️ Failed to preload asset: ${asset.path}`, error)
            }
        }

        if (onProgress) {
            onProgress(assets.length, assets.length, 'Complete')
        }

        return loadedModels
    }

    /**
     * Dispose of resources
     */
    public dispose() {
        this.clearCache()
    }
}
