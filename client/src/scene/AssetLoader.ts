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
    private static gltfLoader = new GLTFLoader()
    private static loadedAssets: Map<string, THREE.Group> = new Map()

    public static async loadModel(
        path: string,
        options: AssetLoadOptions = {},
        onProgress?: (progress: LoadProgress) => void
    ): Promise<THREE.Group> {
        if (this.loadedAssets.has(path)) {
            console.log(`📦 Using cached model: ${path}`)
            return this.loadedAssets.get(path)!.clone()
        }

        console.log(`📦 Loading model: ${path}`)

        const gltf = await this.gltfLoader.loadAsync(path, (progressEvent) => {
            if (onProgress && progressEvent.total > 0) {
                onProgress({
                    loaded: progressEvent.loaded,
                    total: progressEvent.total,
                    percentage: Math.round((progressEvent.loaded / progressEvent.total) * 100),
                })
            }
        })

        const model = gltf.scene

        if (options.scale !== undefined) model.scale.setScalar(options.scale)
        if (options.position) model.position.copy(options.position)
        if (options.rotation) model.rotation.copy(options.rotation)
        if (options.enableShadows ?? true) this.enableShadowsForModel(model)

        this.loadedAssets.set(path, model.clone())
        console.log(`✅ Model loaded successfully: ${path}`)
        return model
    }

    private static enableShadowsForModel(model: THREE.Group): void {
        model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true
                child.receiveShadow = true
            }
        })
    }

    public static getCachedAsset(path: string): THREE.Group | undefined {
        return this.loadedAssets.get(path)?.clone()
    }

    public static isAssetCached(path: string): boolean {
        return this.loadedAssets.has(path)
    }

    public static clearCache(): void {
        this.loadedAssets.clear()
        console.log('🗑️ Asset cache cleared')
    }

    public static getCacheStats() {
        return {
            cachedAssets: this.loadedAssets.size,
            assetPaths: Array.from(this.loadedAssets.keys()),
        }
    }

    public static async preloadAssets(
        assets: { path: string; options?: AssetLoadOptions }[],
        onProgress?: (current: number, total: number, currentAsset: string) => void
    ): Promise<THREE.Group[]> {
        const loadedModels: THREE.Group[] = []

        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i]
            onProgress?.(i, assets.length, asset.path)
            try {
                loadedModels.push(await this.loadModel(asset.path, asset.options))
            } catch (error) {
                console.warn(`⚠️ Failed to preload asset: ${asset.path}`, error)
            }
        }

        onProgress?.(assets.length, assets.length, 'Complete')
        return loadedModels
    }

    public static dispose(): void {
        this.clearCache()
    }
}
