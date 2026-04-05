/**
 * Shared Material Manager - Material Resource Pooling
 *
 * Provides centralized management of shared material instances to reduce
 * material duplication and enable effective batching.
 *
 * Performance:
 * - Initialization: Near-instant (empty pool)
 * - Simple materials (glass, fallback, shelf interior): sync, instant
 * - Procedural materials (wood, carpet, ceiling): generated off-thread via
 *   ProceduralTextureWorker. Call prewarm() at startup so by the time
 *   getMaterial() is called they are already cached.
 */

import * as THREE from 'three'
import { MaterialUtils } from './MaterialUtils'
import { Logger } from './Logger'
import { ProceduralTextureWorker } from './textures/ProceduralTextureWorker'
import { EventManager } from '../core/EventManager'
import { StorePropsEventTypes } from '../scene/props/PropsEvents'
import { FrameBudgetScheduler } from './FrameBudgetScheduler'

export enum MaterialType {
    FallbackGameBox = 'fallbackGameBox',
    MdfVeneer       = 'mdfVeneer',
    ShelfInterior   = 'shelfInterior',
    BrandAccent     = 'brandAccent',
    Carpet          = 'carpet',
    Ceiling         = 'ceiling',
    WallWood        = 'wallWood',
    BasicWood       = 'basicWood',
    Glass           = 'glass'
}

export interface MaterialPool {
    materials: Map<MaterialType, THREE.MeshStandardMaterial>
}

export interface MaterialStats {
    totalMaterials: number
    memoryEstimate: number  // bytes
    poolHitRate:    number  // 0-1
}

export class SharedMaterialManager {
    private static readonly logger = Logger.createLogFunctions(SharedMaterialManager.name)
    private static instance: SharedMaterialManager

    private materialPool:    MaterialPool | null = null
    private prewarmPromise:  Promise<void> | null = null
    private poolRequests = 0
    private poolHits     = 0
    private disposed     = false

    private constructor() {
        // Lightweight — no sync texture generation here.

        // Observe SetupRequest to trigger prewarm. Use plain registerEventHandler
        // so this fires even when GpuStorePropsEventHandler holds the normal handler slot.
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.SetupRequest,
            this.prewarm.bind(this)
        )
    }

    public static getInstance(): SharedMaterialManager {
        if (!SharedMaterialManager.instance) {
            SharedMaterialManager.instance = new SharedMaterialManager()
        }
        return SharedMaterialManager.instance
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    public initialize(): void {
        if (this.disposed) throw new Error('SharedMaterialManager has been disposed')
        if (this.materialPool) {
            SharedMaterialManager.logger.warn('⚠️ SharedMaterialManager already initialized')
            return
        }
        const t0 = performance.now()
        this.materialPool = { materials: new Map() }
        SharedMaterialManager.logger.debug(
            `✅ SharedMaterialManager initialized in ${(performance.now() - t0).toFixed(2)}ms`
        )
    }

    /**
     * Pre-warm all procedurally-generated materials off the main thread.
     * Call once at startup. Subsequent calls return the same Promise (idempotent).
     */
    public async prewarm(): Promise<void> {
        if (this.disposed) return
        if (this.prewarmPromise) return this.prewarmPromise

        this.prewarmPromise = (async () => {
            if (!this.materialPool) this.initialize()
            const worker = ProceduralTextureWorker.getInstance()
            const t0 = performance.now()
            SharedMaterialManager.logger.debug('🚀 Starting off-thread material prewarm...')

            await Promise.all([
                this.prewarmMDFVeneer(worker),
                this.prewarmCarpet(worker),
                this.prewarmCeiling(worker),
                this.prewarmWallWood(worker),
                this.prewarmBasicWood(worker),
            ])

            SharedMaterialManager.logger.debug(
                `✨ Material prewarm complete in ${(performance.now() - t0).toFixed(2)}ms`
            )
        })().catch(err => {
            SharedMaterialManager.logger.warn('Material prewarm failed, continuing with fallback materials:', err)
        })

        return this.prewarmPromise
    }


    // --- Public API ----------------------------------------------------------

    public getMaterial(type: MaterialType): THREE.MeshStandardMaterial {
        if (!this.materialPool) this.initialize()

        if (!this.materialPool!.materials.has(type)) {
            // Fallback sync path: only reached if prewarm() wasn't awaited first.
            // Procedural types will still block here — prewarm() prevents this.
            const mat = this.createMaterialSync(type)
            this.materialPool!.materials.set(type, mat)
        }

        this.poolRequests++
        this.poolHits++
        return this.materialPool!.materials.get(type)!
    }

    public isInitialized(): boolean {
        return this.materialPool !== null && !this.disposed
    }

    public getStats(): MaterialStats {
        if (!this.materialPool) return { totalMaterials: 0, memoryEstimate: 0, poolHitRate: 0 }
        const totalMaterials = this.materialPool.materials.size
        return {
            totalMaterials,
            memoryEstimate: totalMaterials * 1024,
            poolHitRate: this.poolRequests > 0 ? this.poolHits / this.poolRequests : 0
        }
    }

    public dispose(): void {
        if (this.materialPool) {
            this.materialPool.materials.forEach(m => m.dispose())
            this.materialPool.materials.clear()
            this.materialPool = null
        }
        ProceduralTextureWorker.getInstance()?.dispose?.()
        this.disposed = true
        SharedMaterialManager.instance = null as any
        console.log('🗑️ SharedMaterialManager disposed')
    }

    // ─── Async prewarm helpers ────────────────────────────────────────────────

    private async prewarmMDFVeneer(worker: ProceduralTextureWorker): Promise<void> {
        const [diffuseBitmap, normalBitmap] = await Promise.all([
            worker.generate('wood_enhanced', {
                width: 2048, height: 2048,
                grainStrength: 0.3, ringFrequency: 0.01,
                color1: '#E6D3B7', color2: '#D4C4A0', color3: '#C8B896',
            }),
            worker.generate('wood_normal', { width: 2048, height: 2048, strength: 0.06 }),
        ])
        const diffuse = this.bitmapToTexture(diffuseBitmap, 6, 4)
        const normal  = this.bitmapToTexture(normalBitmap,  6, 4)
        
        FrameBudgetScheduler.getInstance().schedule(
            () => this.upsertMaterial(MaterialType.MdfVeneer,
                new THREE.MeshStandardMaterial({ map: diffuse, normalMap: normal, roughness: 0.4, metalness: 0.0 })),
            { priority: 'normal', estimatedMs: 2 }
        )
    }

    private async prewarmCarpet(worker: ProceduralTextureWorker): Promise<void> {
        const bitmap = await worker.generate('carpet_enhanced', {
            width: 512, height: 512, color: '#8B0000', fiberDensity: 0.5, roughness: 0.8,
        })
        const texture = this.bitmapToTexture(bitmap, 4, 4)
        
        FrameBudgetScheduler.getInstance().schedule(
            () => this.upsertMaterial(MaterialType.Carpet,
                new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.0 })),
            { priority: 'normal', estimatedMs: 2 }
        )
    }

    private async prewarmCeiling(worker: ProceduralTextureWorker): Promise<void> {
        const bitmap = await worker.generate('ceiling_enhanced', {
            width: 512, height: 512, color: '#F5F5DC', bumpSize: 0.6, density: 0.8,
        })
        const texture = this.bitmapToTexture(bitmap, 3, 3)
        
        FrameBudgetScheduler.getInstance().schedule(
            () => this.upsertMaterial(MaterialType.Ceiling,
                new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.0 })),
            { priority: 'normal', estimatedMs: 2 }
        )
    }

    private async prewarmWallWood(worker: ProceduralTextureWorker): Promise<void> {
        const [d, n] = await Promise.all([
            worker.generate('wood_enhanced', {
                width: 2048, height: 2048, grainStrength: 0.5, ringFrequency: 0.1,
                color1: '#8B4513', color2: '#A0522D', color3: '#654321',
            }),
            worker.generate('wood_normal', { width: 2048, height: 2048, strength: 0.3 }),
        ])
        const diffuse = this.bitmapToTexture(d, 3, 1)
        const normal  = this.bitmapToTexture(n, 3, 1)
        
        FrameBudgetScheduler.getInstance().schedule(
            () => this.upsertMaterial(MaterialType.WallWood,
                new THREE.MeshStandardMaterial({
                    map: diffuse,
                    normalMap: normal,
                    roughness: 0.8, metalness: 0.1,
                })),
            { priority: 'normal', estimatedMs: 2 }
        )
    }

    private async prewarmBasicWood(worker: ProceduralTextureWorker): Promise<void> {
        const [d, n] = await Promise.all([
            worker.generate('wood_enhanced', {
                width: 2048, height: 2048, grainStrength: 0.3, ringFrequency: 0.08,
                color1: '#8B4513', color2: '#A0522D', color3: '#654321',
            }),
            worker.generate('wood_normal', { width: 2048, height: 2048, strength: 0.18 }),
        ])
        const diffuse = this.bitmapToTexture(d, 3, 1)
        const normal  = this.bitmapToTexture(n, 3, 1)

        FrameBudgetScheduler.getInstance().schedule(
            () => this.upsertMaterial(MaterialType.BasicWood,
                new THREE.MeshStandardMaterial({
                    map: diffuse,
                    normalMap: normal,
                    roughness: 0.8, metalness: 0.1,
                })),
            { priority: 'normal', estimatedMs: 2 }
        )
    }

    /** Wrap an ImageBitmap in a repeating THREE.Texture. */
    private bitmapToTexture(bitmap: ImageBitmap, repeatX: number, repeatY: number): THREE.Texture {
        const texture = new THREE.Texture(bitmap)
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(repeatX, repeatY)
        texture.needsUpdate = true
        return texture
    }

    /**
     * Insert or upgrade a pooled material.
     *
     * Critical behavior: if a fallback material is already in use by live meshes,
     * mutate that same material instance instead of replacing the object reference.
     * This allows textured prewarm results to "pop in" without rebuilding meshes.
     */
    private upsertMaterial(type: MaterialType, material: THREE.MeshStandardMaterial): void {
        const existing = this.materialPool!.materials.get(type)

        if (!existing) {
            this.materialPool!.materials.set(type, material)
            return
        }

        // Dispose old GPU textures on the existing material before swapping properties.
        if (existing.map) existing.map.dispose()
        if (existing.normalMap) existing.normalMap.dispose()

        // Transfer core PBR properties to preserve object identity for all meshes
        // currently referencing this material instance.
        existing.color.copy(material.color)
        existing.emissive.copy(material.emissive)
        existing.emissiveIntensity = material.emissiveIntensity
        existing.roughness = material.roughness
        existing.metalness = material.metalness
        existing.transparent = material.transparent
        existing.opacity = material.opacity
        existing.side = material.side
        existing.map = material.map
        existing.normalMap = material.normalMap
        existing.name = material.name
        existing.needsUpdate = true

        // Avoid double-disposing transferred textures.
        material.map = null
        material.normalMap = null
        material.dispose()
    }

    // ─── Sync fallback (instant, no canvas work) ─────────────────────────────

    /**
     * Synchronous material creation — called by getMaterial() when the cache
     * is cold (prewarm() not yet awaited). Procedural types will block here.
     */
    private createMaterialSync(type: MaterialType): THREE.MeshStandardMaterial {
        switch (type) {
            case MaterialType.FallbackGameBox:
                return new THREE.MeshStandardMaterial({
                    color: 0xff00ff, roughness: 0.8, metalness: 0.2,
                    name: 'fallback-gamebox-material',
                })
            case MaterialType.ShelfInterior:
                return MaterialUtils.createPBRMaterial({ color: 0xf8f8f8, roughness: 0.2, metalness: 0.0 })
            case MaterialType.BrandAccent:
                return MaterialUtils.createPBRMaterial({ color: 0x0066cc, roughness: 0.3, metalness: 0.1 })
            case MaterialType.Glass:
                return new THREE.MeshStandardMaterial({
                    color: 0xCCF5FF, emissive: 0xFFE4B5, emissiveIntensity: 0.375,
                    roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.35,
                    side: THREE.DoubleSide,
                })
            // Procedural types — generate synchronously as fallback (slow, avoidable via prewarm)
            case MaterialType.MdfVeneer:
            case MaterialType.Carpet:
            case MaterialType.Ceiling:
            case MaterialType.WallWood:
            case MaterialType.BasicWood:
                SharedMaterialManager.logger.warn(
                    `⚠️ getMaterial(${type}) called before prewarm() — generating synchronously (blocks main thread)`
                )
                return this.createProceduralFallback(type)
            default:
                throw new Error(`Unknown material type: ${type}`)
        }
    }

    /**
     * Sync fallback for procedural materials when prewarm() wasn't awaited.
     * Creates a flat-colour approximation — visually imperfect but non-blocking fast.
     */
    private createProceduralFallback(type: MaterialType): THREE.MeshStandardMaterial {
        const FALLBACK_COLORS: Record<string, number> = {
            [MaterialType.MdfVeneer]: 0xE6D3B7,
            [MaterialType.Carpet]:    0x8B0000,
            [MaterialType.Ceiling]:   0xF5F5DC,
            [MaterialType.WallWood]:  0x8B4513,
            [MaterialType.BasicWood]: 0x8B4513,
        }
        return new THREE.MeshStandardMaterial({
            color:     FALLBACK_COLORS[type] ?? 0x888888,
            roughness: 0.8,
            metalness: 0.0,
            name:      `${type}-sync-fallback`,
        })
    }
}
