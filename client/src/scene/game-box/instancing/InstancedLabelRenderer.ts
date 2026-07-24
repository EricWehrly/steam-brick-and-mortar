import * as THREE from 'three'
import { LabelTextureArrayManager } from './LabelTextureArrayManager'
import { EventManager } from '../../../core/EventManager'
import {
    GameEventTypes,
    GameRenderEventTypes,
    type PlacementRunResetRequestedEvent,
} from '../../../types/InteractionEvents'
import type { SomeBatchesCompleteEvent } from '../../../types/EnvironmentEvents'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey, DataDomain } from '../../../core/data/DataTypes'
import { SceneLayer } from '../../SceneLayers'
import { PlacementRunResettableInstancedBase } from './PlacementRunResettableInstancedBase'
import vertexShader from './shaders/instanced-label.vert?raw'
import fragmentShader from './shaders/instanced-label.frag?raw'

export interface InstancedLabelConfig {
    maxInstances?: number
    textureSize?: number
    labelWidth?: number
    labelHeight?: number
}

export const INSTANCED_LABEL_MESH_NAME = 'gpu-instanced-game-boxes' as const

export class InstancedLabelRenderer extends PlacementRunResettableInstancedBase {
    private instancedMesh: THREE.InstancedMesh | null = null
    private textureArrayManager: LabelTextureArrayManager
    private geometry: THREE.PlaneGeometry | null = null
    private material: THREE.ShaderMaterial | null = null

    private readonly textureSize: number
    private isInitialized: boolean = false
    private gameNameToTextureIndex: Map<string, number> = new Map()
    private readonly labelMetadata = new Map<number, { name: string; appid?: number; position: THREE.Vector3 }>()

    private readonly boundHandleSomeBatchesComplete: (event: CustomEvent<SomeBatchesCompleteEvent>) => void
    private readonly boundHandleArtworkSettled: () => void
    private readonly boundHandlePlacementRunResetRequested: (event: CustomEvent<PlacementRunResetRequestedEvent>) => void

    private static readonly DEFAULT_ROTATION = new THREE.Quaternion()

    constructor(config: InstancedLabelConfig = {}) {
        super(config.maxInstances || 2000)
        this.textureSize = config.textureSize || 128

        this.textureArrayManager = new LabelTextureArrayManager(this.textureSize, this.maxInstances)

        this.boundHandleSomeBatchesComplete = this.handleSomeBatchesComplete.bind(this)
        this.boundHandleArtworkSettled = this.runCompact.bind(this)
        this.boundHandlePlacementRunResetRequested = this.handlePlacementRunResetRequested.bind(this)

        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SomeBatchesComplete,
            this.boundHandleSomeBatchesComplete
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.ArtworkSettled,
            this.boundHandleArtworkSettled
        )
        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementRunResetRequested,
            this.boundHandlePlacementRunResetRequested
        )

        this.publishLabelMetadataReference()

        console.debug(`📋 InstancedLabelRenderer created (max: ${this.maxInstances} labels)`)
    }

    /**
     * @returns the allocated instance index, or -1 on failure (uninitialized, at
     * capacity, or texture allocation failed).
     */
    public addLabelInstance(
        position: THREE.Vector3,
        gameName: string,
        appid?: number,
        rotation?: THREE.Quaternion
    ): number {
        if (!this.isInitialized) {
            this.initialize()
        }

        if (!this.instancedMesh || !this.geometry) {
            console.warn('InstancedLabelRenderer failed to initialize')
            return -1
        }

        const index = this.allocateInstanceIndex()
        if (index < 0) {
            console.warn(`No label slots remaining (${this.maxInstances})`)
            return -1
        }

        const textureIndex = this.resolveTextureIndex(gameName)
        if (textureIndex === undefined) {
            return -1
        }

        // rotation encodes shelf orientation and front/back side — always passed by callers.
        // Fallback to identity if somehow called without rotation (shouldn't happen in practice).
        const effectiveRotation = rotation ?? InstancedLabelRenderer.DEFAULT_ROTATION

        const matrix = new THREE.Matrix4()
        matrix.compose(position, effectiveRotation, new THREE.Vector3(1, 1, 1))
        this.instancedMesh.setMatrixAt(index, matrix)

        const textureIndices = this.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
        textureIndices.setX(index, textureIndex)

        // Arrangement changes can place labels without emitting SomeBatchesComplete.
        // Keep instance buffers visible immediately so labels don't disappear until
        // a later batch event happens to flush GPU state.
        this.invalidateInstancedMesh(this.instancedMesh)
        textureIndices.needsUpdate = true

        this.storeLabelMetadata(index, gameName, position, appid)

        return index
    }

    /**
     * Repoint an existing label instance to a different game's name/position/rotation,
     * without allocating a new instance slot. Used to recycle a shelf unit whose game
     * resolved via label fallback (liminal mode's treadmill — see
     * docs/plans/liminal-mode-plan.md P4/P10).
     */
    public setInstanceLabel(
        instanceIndex: number,
        position: THREE.Vector3,
        gameName: string,
        appid?: number,
        rotation?: THREE.Quaternion
    ): boolean {
        if (!this.instancedMesh || !this.geometry) {
            console.warn('InstancedLabelRenderer failed to initialize')
            return false
        }
        if (instanceIndex < 0 || instanceIndex >= this.getCurrentInstanceCount()) {
            console.warn(`Cannot repoint label instance ${instanceIndex}: out of range`)
            return false
        }

        const textureIndex = this.resolveTextureIndex(gameName)
        if (textureIndex === undefined) {
            return false
        }

        const effectiveRotation = rotation ?? InstancedLabelRenderer.DEFAULT_ROTATION
        const matrix = new THREE.Matrix4()
        matrix.compose(position, effectiveRotation, new THREE.Vector3(1, 1, 1))
        this.instancedMesh.setMatrixAt(instanceIndex, matrix)

        const textureIndices = this.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
        textureIndices.setX(instanceIndex, textureIndex)

        this.invalidateInstancedMesh(this.instancedMesh)
        textureIndices.needsUpdate = true

        this.storeLabelMetadata(instanceIndex, gameName, position, appid)

        return true
    }

    private resolveTextureIndex(gameName: string): number | undefined {
        let textureIndex = this.gameNameToTextureIndex.get(gameName)
        if (textureIndex === undefined) {
            try {
                textureIndex = this.textureArrayManager.addTextLabel(gameName)
                this.gameNameToTextureIndex.set(gameName, textureIndex)
            } catch (error) {
                console.warn(`Failed to add texture for game: ${gameName}`, error)
                return undefined
            }
        }
        return textureIndex
    }

    public updateGPU(): void {
        if (!this.isInitialized || !this.instancedMesh || !this.geometry) return

        this.invalidateInstancedMesh(this.instancedMesh)  // Force recompute; stale sphere breaks raycasting
        this.invalidateInstanceAttribute(this.geometry, 'textureIndex')

        console.debug(`🔄 GPU updated: ${this.getCurrentInstanceCount()} active label instances`)
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
        EventManager.getInstance().deregisterEventHandler(
            GameRenderEventTypes.PlacementRunResetRequested,
            this.boundHandlePlacementRunResetRequested
        )

        if (this.instancedMesh) {
            const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
            if (scene) scene.remove(this.instancedMesh)
            this.instancedMesh = null
        }

        this.geometry?.dispose()
        this.material?.dispose()
        this.textureArrayManager.dispose()

        this.resetForPlacementRun()
        this.publishLabelMetadataReference()
        this.isInitialized = false

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
        this.labelMetadata.set(index, { name: gameName, appid, position: position.clone() })
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

    private handlePlacementRunResetRequested(_event: CustomEvent<PlacementRunResetRequestedEvent>): void {
        this.resetForPlacementRun()
        this.publishLabelMetadataReference()

        if (this.instancedMesh) {
            this.invalidateInstancedMesh(this.instancedMesh)
        }
        this.invalidateInstanceAttribute(this.geometry, 'textureIndex')
    }

    protected override onPlacementRunReset(): void {
        this.gameNameToTextureIndex.clear()
        this.labelMetadata.clear()
    }

    private publishLabelMetadataReference(): void {
        // Policy: this renderer is the sole owner of DataKey.InstancedLabelMetadata.
        // Publish only at lifecycle boundaries so consumers always observe the authoritative map.
        DataManager.getInstance().set(
            DataKey.InstancedLabelMetadata,
            this.labelMetadata,
            { domain: DataDomain.Renderer }
        )
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
