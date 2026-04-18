import * as THREE from 'three'
import { LabelTextureArrayManager } from './LabelTextureArrayManager'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes } from '../../../types/InteractionEvents'
import type { SomeBatchesCompleteEvent } from '../../../types/EnvironmentEvents'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey, DataDomain } from '../../../core/data/DataTypes'
import { SceneLayer } from '../../SceneLayers'
import { ShelfSide } from '../../props/SharedPropsUtils'
import vertexShader from './shaders/instanced-label.vert?raw'
import fragmentShader from './shaders/instanced-label.frag?raw'

export interface InstancedLabelConfig {
    maxInstances?: number
    textureSize?: number
    labelWidth?: number
    labelHeight?: number
}

export const INSTANCED_LABEL_MESH_NAME = 'gpu-instanced-game-boxes' as const

export class InstancedLabelRenderer {
    private instancedMesh: THREE.InstancedMesh | null = null
    private textureArrayManager: LabelTextureArrayManager
    private geometry: THREE.PlaneGeometry | null = null
    private material: THREE.ShaderMaterial | null = null

    private maxInstances: number
    private readonly textureSize: number
    private currentCount: number = 0
    private isInitialized: boolean = false
    private nextInstanceIndex: number = 0
    private gameNameToTextureIndex: Map<string, number> = new Map()

    private readonly boundHandleSomeBatchesComplete: (event: CustomEvent<SomeBatchesCompleteEvent>) => void
    private readonly boundHandleArtworkSettled: () => void

    private static readonly DEFAULT_ROTATION = new THREE.Quaternion()

    constructor(config: InstancedLabelConfig = {}) {
        this.maxInstances = config.maxInstances || 2000
        this.textureSize = config.textureSize || 128

        this.textureArrayManager = new LabelTextureArrayManager(this.textureSize, this.maxInstances)

        this.boundHandleSomeBatchesComplete = this.handleSomeBatchesComplete.bind(this)
        this.boundHandleArtworkSettled = this.runCompact.bind(this)

        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SomeBatchesComplete,
            this.boundHandleSomeBatchesComplete
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.ArtworkSettled,
            this.boundHandleArtworkSettled
        )

        // Initialise a fresh metadata map so stale entries from a prior load don't
        // survive into this renderer instance (dispose() also clears it, but construction
        // must be self-sufficient in case dispose() wasn't called cleanly).
        DataManager.getInstance().set(
            DataKey.InstancedLabelMetadata,
            new Map<number, { name: string; appid?: number; position: THREE.Vector3 }>(),
            { domain: DataDomain.Renderer }
        )

        console.debug(`📋 InstancedLabelRenderer created (max: ${this.maxInstances} labels)`)
    }

    public addLabelInstance(
        position: THREE.Vector3,
        gameName: string,
        appid?: number,
        side: ShelfSide = ShelfSide.Front,
        rotation?: THREE.Quaternion
    ): boolean {
        if (!this.isInitialized) {
            this.initialize()
        }

        if (!this.instancedMesh || !this.geometry) {
            console.warn('InstancedLabelRenderer failed to initialize')
            return false
        }

        if (this.nextInstanceIndex >= this.maxInstances) {
            console.warn(`No label slots remaining (${this.maxInstances})`)
            return false
        }

        const index = this.nextInstanceIndex++

        let textureIndex = this.gameNameToTextureIndex.get(gameName)
        if (textureIndex === undefined) {
            try {
                textureIndex = this.textureArrayManager.addTextLabel(gameName)
                this.gameNameToTextureIndex.set(gameName, textureIndex)
            } catch (error) {
                console.warn(`Failed to add texture for game: ${gameName}`, error)
                return false
            }
        }

        // Rotation: Front=rotY+PI so the -Z face (reversed UVs) faces the player and
        // the pre-mirrored canvas texture reads correctly. Back uses identity; DoubleSide
        // material ensures the player always sees a readable face.
        const effectiveRotation = rotation ?? (
            side === ShelfSide.Front
                ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
                : InstancedLabelRenderer.DEFAULT_ROTATION
        )

        const matrix = new THREE.Matrix4()
        matrix.compose(position, effectiveRotation, new THREE.Vector3(1, 1, 1))
        this.instancedMesh.setMatrixAt(index, matrix)

        const textureIndices = this.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
        textureIndices.setX(index, textureIndex)

        this.currentCount = Math.max(this.currentCount, index + 1)

        this.storeLabelMetadata(index, gameName, position, appid)

        return true
    }

    /**
     * Reset all label instance placements without disposing textures.
     * Call before re-sorting so new label boxes can be placed in the new order.
     */
    public clear(): void {
        this.currentCount = 0
        this.nextInstanceIndex = 0
        this.gameNameToTextureIndex.clear()
        if (this.instancedMesh) {
            this.instancedMesh.count = 0
        }
    }

    public updateGPU(): void {
        if (!this.isInitialized || !this.instancedMesh || !this.geometry) return

        this.instancedMesh.instanceMatrix.needsUpdate = true
        this.instancedMesh.count = this.currentCount
        this.instancedMesh.boundingSphere = null  // Force recompute; stale sphere breaks raycasting

        const textureIndices = this.geometry.getAttribute('textureIndex')
        if (textureIndices) textureIndices.needsUpdate = true

        console.debug(`🔄 GPU updated: ${this.currentCount} active label instances`)
    }

    public dispose(): void {
        console.debug('🧹 Disposing InstancedLabelRenderer')

        EventManager.getInstance().deregisterEventHandler(
            GameEventTypes.SomeBatchesComplete,
            this.boundHandleSomeBatchesComplete
        )
        EventManager.getInstance().deregisterEventHandler(
            GameEventTypes.ArtworkSettled,
            this.boundHandleArtworkSettled
        )

        if (this.instancedMesh) {
            const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
            if (scene) scene.remove(this.instancedMesh)
            this.instancedMesh = null
        }

        this.geometry?.dispose()
        this.material?.dispose()
        this.textureArrayManager.dispose()

        this.gameNameToTextureIndex.clear()
        this.isInitialized = false
        this.currentCount = 0
        this.nextInstanceIndex = 0

        // Clear metadata so a new renderer instance doesn't inherit stale instanceId → game
        // entries, which would cause wrong-game-on-click after reload.
        DataManager.getInstance().set(
            DataKey.InstancedLabelMetadata,
            new Map<number, { name: string; position: THREE.Vector3 }>(),
            { domain: DataDomain.Renderer }
        )

        console.debug('✅ InstancedLabelRenderer disposed')
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private initialize(): void {
        if (this.isInitialized) {
            console.warn('InstancedLabelRenderer already initialized')
            return
        }

        try {
            this.material = this.createLabelMaterial(this.textureArrayManager.texture)

            // TODO: get dimensions from config
            this.geometry = new THREE.BoxGeometry(0.3, 0.4, 0.1)
            this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, this.maxInstances)

            this.instancedMesh.name = INSTANCED_LABEL_MESH_NAME
            this.instancedMesh.layers.enable(SceneLayer.Interactable)
            this.instancedMesh.count = 0
            this.instancedMesh.castShadow = true
            this.instancedMesh.receiveShadow = true
            this.instancedMesh.visible = true
            this.instancedMesh.frustumCulled = false
            this.instancedMesh.position.set(0, 0, 0)
            this.instancedMesh.rotation.set(0, 0, 0)
            this.instancedMesh.scale.set(1, 1, 1)

            this.setupInstanceAttributes()

            this.isInitialized = true
            this.addToMainScene()

            console.log('✅ InstancedLabelRenderer initialized')
        } catch (error) {
            console.error('❌ Failed to initialize InstancedLabelRenderer:', error)
            throw error
        }
    }

    private storeLabelMetadata(index: number, gameName: string, position: THREE.Vector3, appid?: number): void {
        const dataManager = DataManager.getInstance()
        let metadata = dataManager.get<Map<number, { name: string; appid?: number; position: THREE.Vector3 }>>(DataKey.InstancedLabelMetadata)

        if (!metadata) {
            metadata = new Map()
            dataManager.set(DataKey.InstancedLabelMetadata, metadata, { domain: DataDomain.Renderer })
        }

        metadata.set(index, { name: gameName, appid, position: position.clone() })
    }

    private handleSomeBatchesComplete(_event: CustomEvent<SomeBatchesCompleteEvent>): void {
        this.updateGPU()
    }

    private runCompact(): void {
        if (!this.isInitialized) return
        const newTexture = this.textureArrayManager.compact()
        if (this.material) {
            this.material.uniforms['textureArray'].value = newTexture
            this.material.needsUpdate = true
        }
    }

    private createLabelMaterial(textureArray: THREE.DataArrayTexture): THREE.ShaderMaterial {
        return new THREE.ShaderMaterial({
            uniforms: { textureArray: { value: textureArray } },
            vertexShader,
            fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        })
    }

    private setupInstanceAttributes(): void {
        if (!this.geometry) return
        const textureIndices = new Float32Array(this.maxInstances).fill(-1)
        this.geometry.setAttribute('textureIndex', new THREE.InstancedBufferAttribute(textureIndices, 1))
    }

    private addToMainScene(): void {
        if (!this.instancedMesh) return
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
        if (scene) {
            scene.add(this.instancedMesh)
        } else {
            console.warn('⚠️ Cannot add to scene: main scene not available in DataManager')
        }
    }
}
