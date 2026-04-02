/**
 * Legacy Game Box Renderer
 * 
 * Individual mesh creation with canvas-based text labels.
 * No GPU instancing - each game box is a separate THREE.Mesh.
 * Used for maximum compatibility with older hardware.
 */

import * as THREE from 'three'
import type { SteamGameData } from './types/GameData'
import type {
    GameBoxDimensions,
    GameBoxTextureOptions
} from './types/GameBoxOptions'
import { GameBoxTextureManager } from './GameBoxTextureManager'
import { GameBoxLayoutUtils } from './GameBoxLayoutUtils'
import { SceneLayer } from '../SceneLayers'
import { SharedMaterialManager, MaterialType } from '../../utils/SharedMaterialManager'
import type { IGameBoxRenderer, GameBoxRequest } from '../IGameBoxRenderer'

export class LegacyGameBoxRenderer implements IGameBoxRenderer {

    private static readonly DEFAULT_DIMENSIONS: GameBoxDimensions = {
        width: 0.3,   // 30cm width
        height: 0.4,  // 40cm height 
        depth: 0.08   // 8cm depth
    }

    private dimensions: GameBoxDimensions
    private gameBoxGeometry: THREE.BoxGeometry
    private textureManager: GameBoxTextureManager
    private materialManager: SharedMaterialManager
    private materialManagerInitialized = false

    constructor() {
        this.dimensions = { ...LegacyGameBoxRenderer.DEFAULT_DIMENSIONS }
        
        this.gameBoxGeometry = new THREE.BoxGeometry(
            this.dimensions.width,
            this.dimensions.height,
            this.dimensions.depth
        )
        
        this.materialManager = SharedMaterialManager.getInstance()
        this.textureManager = new GameBoxTextureManager()
        
        console.debug(`📦 LegacyGameBoxRenderer initialized with dimensions: ${this.dimensions.width}x${this.dimensions.height}x${this.dimensions.depth}`)
    }

    private ensureMaterialManagerInitialized(): void {
        if (!this.materialManagerInitialized) {
            this.materialManager.initialize()
            this.materialManagerInitialized = true
            console.log('🎨 SharedMaterialManager initialized (legacy renderer)')
        }
    }

    public createGameBox(
        game: SteamGameData,
        position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
        textureOptions?: GameBoxTextureOptions,
        name?: string
    ): THREE.Mesh {
        const gameBox = this.createGameBoxCore(game, position, name)
        
        if (textureOptions) {
            this.textureManager.applyTexture(gameBox, textureOptions)
        }
        
        console.debug(`📦 Created legacy game box: ${gameBox.name} at position (${gameBox.position.x.toFixed(2)}, ${gameBox.position.y.toFixed(2)}, ${gameBox.position.z.toFixed(2)})`)
        return gameBox
    }

    private createGameBoxCore(
        game: SteamGameData,
        position: THREE.Vector3,
        name?: string
    ): THREE.Mesh {
        this.ensureMaterialManagerInitialized()
        const material = this.materialManager.getMaterial(MaterialType.FallbackGameBox)
        
        const gameBox = new THREE.Mesh(this.gameBoxGeometry, material)
        gameBox.position.copy(position)
        gameBox.name = name || `game-${game.name?.replace(/[^a-zA-Z0-9]/g, '-') || 'unknown'}`
        gameBox.layers.enable(SceneLayer.Interactable)
        
        gameBox.userData = {
            isGameBox: true,
            gameData: game,
            gameId: GameBoxLayoutUtils.getGameId(game),
            name: game.name,
            playtime: GameBoxLayoutUtils.getGamePlaytime(game)
        }
        
        gameBox.castShadow = true
        gameBox.receiveShadow = true
        
        this.addTextLabel(gameBox, game.name)
        
        return gameBox
    }

    private addTextLabel(gameBox: THREE.Mesh, gameName: string): void {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            console.warn('Could not get 2D canvas context for text label')
            return
        }
        
        const textureSize = 512
        canvas.width = textureSize
        canvas.height = textureSize
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 48px Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(gameName, canvas.width / 2, canvas.height / 2)
        
        const texture = new THREE.CanvasTexture(canvas)
        texture.needsUpdate = true
        
        const textGeometry = new THREE.PlaneGeometry(0.25, 0.25)
        const textMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        })
        
        const textMesh = new THREE.Mesh(textGeometry, textMaterial)
        textMesh.position.set(0, 0, 0.051)
        textMesh.name = `${gameBox.name}-label`
        
        gameBox.add(textMesh)
        
        gameBox.userData.labelTexture = texture
        gameBox.userData.labelMesh = textMesh
    }

    public createBatchGameBoxes(requests: GameBoxRequest[]): THREE.Mesh[] {
        return requests.map(request => 
            this.createGameBox(
                request.game,
                request.position,
                request.textureOptions,
                request.name
            )
        )
    }

    public hasInstancedLabelRenderer(): boolean {
        return false
    }

    public getDimensions(): GameBoxDimensions {
        return { ...this.dimensions }
    }

    public dispose(): void {
        console.debug('🧹 Disposing LegacyGameBoxRenderer resources')
        
        this.gameBoxGeometry.dispose()
        this.textureManager.dispose()
        
        console.log('✅ LegacyGameBoxRenderer disposed')
    }
}
