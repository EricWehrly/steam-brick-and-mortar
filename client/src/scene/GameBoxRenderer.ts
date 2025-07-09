/**
 * Game Box Renderer - Game Box 3D Object Management
 * 
 * Handles:
 * - Create and position game boxes
 * - Handle game box animations
 * - Manage placeholder vs real game boxes
 */

import * as THREE from 'three'
import { ValidationUtils } from '../utils'

export interface GameBoxDimensions {
    width: number
    height: number
    depth: number
}

export interface GameBoxPosition {
    x: number
    y: number
    z: number
}

export interface ShelfConfiguration {
    surfaceY: number
    centerZ: number
    centerX: number
    maxGames: number
    spacing: number
}

export interface SteamGameData {
    appid: string | number
    name: string
    playtime_forever: number
    playtime_2weeks?: number
    img_icon_url?: string
    img_logo_url?: string
    artwork?: {
        icon: string
        logo: string
        header: string
        library: string
    }
}

export class GameBoxRenderer {
    private static readonly DEFAULT_DIMENSIONS: GameBoxDimensions = {
        width: 0.15,
        height: 0.2,
        depth: 0.02
    }

    private static readonly DEFAULT_SHELF_CONFIG: ShelfConfiguration = {
        surfaceY: -0.8,
        centerZ: -3,
        centerX: 0,
        maxGames: 12,
        spacing: 0.16
    }

    private dimensions: GameBoxDimensions
    private shelfConfig: ShelfConfiguration
    private gameBoxGeometry: THREE.BoxGeometry

    constructor(
        dimensions: Partial<GameBoxDimensions> = {},
        shelfConfig: Partial<ShelfConfiguration> = {}
    ) {
        this.dimensions = { ...GameBoxRenderer.DEFAULT_DIMENSIONS, ...dimensions }
        this.shelfConfig = { ...GameBoxRenderer.DEFAULT_SHELF_CONFIG, ...shelfConfig }
        
        this.gameBoxGeometry = new THREE.BoxGeometry(
            this.dimensions.width,
            this.dimensions.height,
            this.dimensions.depth
        )
    }

    /**
     * Create placeholder game boxes
     */
    public createPlaceholderBoxes(scene: THREE.Scene, count: number = 6): THREE.Mesh[] {
        console.log(`📦 Creating ${count} placeholder game boxes...`)
        
        const materials = this.createPlaceholderMaterials()
        const boxes: THREE.Mesh[] = []
        
        const startX = this.calculateStartX(count)
        
        for (let i = 0; i < count; i++) {
            const gameBox = new THREE.Mesh(
                this.gameBoxGeometry, 
                materials[i % materials.length]
            )
            
            // Mark as placeholder game box
            gameBox.userData = { 
                isGameBox: true, 
                isPlaceholder: true 
            }
            
            // Position the box
            const position = this.calculateBoxPosition(i, startX)
            gameBox.position.set(position.x, position.y, position.z)
            
            // Enable shadows
            gameBox.castShadow = true
            gameBox.receiveShadow = true
            
            // Add subtle random rotation for natural look
            gameBox.rotation.y = (Math.random() - 0.5) * 0.1
            
            scene.add(gameBox)
            boxes.push(gameBox)
        }
        
        console.log(`✅ Created ${count} placeholder game boxes`)
        return boxes
    }

    /**
     * Create a game box from Steam data
     */
    public createGameBox(
        scene: THREE.Scene, 
        game: SteamGameData, 
        index: number
    ): THREE.Mesh | null {
        // Check if we're within display limits
        if (index >= this.shelfConfig.maxGames) {
            return null
        }

        // Create material with color based on game name
        const colorHue = ValidationUtils.stringToHue(game.name)
        const material = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color().setHSL(colorHue, 0.7, 0.5)
        })
        
        const gameBox = new THREE.Mesh(this.gameBoxGeometry, material)
        
        // Mark as game box with Steam data
        gameBox.userData = { 
            isGameBox: true, 
            steamGame: game,
            appId: game.appid,
            name: game.name,
            playtime: game.playtime_forever
        }
        
        // Position the box
        const startX = this.calculateStartX(this.shelfConfig.maxGames)
        const position = this.calculateBoxPosition(index, startX)
        gameBox.position.set(position.x, position.y, position.z)
        
        // Enable shadows
        gameBox.castShadow = true
        gameBox.receiveShadow = true
        
        // Add to scene
        scene.add(gameBox)
        
        console.log(`📦 Added game box ${index}: ${game.name}`)
        return gameBox
    }

    /**
     * Create game boxes from Steam library data
     */
    public createGameBoxesFromSteamData(
        scene: THREE.Scene, 
        games: SteamGameData[]
    ): THREE.Mesh[] {
        console.log(`🎮 Creating game boxes from ${games.length} Steam games...`)
        
        if (!games || games.length === 0) {
            console.warn('⚠️ No games provided for game box creation')
            return []
        }

        // Sort and limit games
        const sortedGames = this.sortAndLimitGames(games)
        const boxes: THREE.Mesh[] = []
        
        // Create game boxes
        sortedGames.forEach((game, index) => {
            const box = this.createGameBox(scene, game, index)
            if (box) {
                boxes.push(box)
            }
        })
        
        console.log(`✅ Created ${boxes.length} game boxes from Steam library`)
        return boxes
    }

    /**
     * Clear all game boxes from the scene
     */
    public clearGameBoxes(scene: THREE.Scene): number {
        const existingBoxes = scene.children.filter(child => 
            child.userData?.isGameBox
        )
        existingBoxes.forEach(box => scene.remove(box))
        console.log(`🗑️ Cleared ${existingBoxes.length} existing game boxes`)
        return existingBoxes.length
    }

    /**
     * Update shelf configuration
     */
    public updateShelfConfig(newConfig: Partial<ShelfConfiguration>) {
        this.shelfConfig = { ...this.shelfConfig, ...newConfig }
    }

    /**
     * Update box dimensions (requires recreating geometry)
     */
    public updateDimensions(newDimensions: Partial<GameBoxDimensions>) {
        this.dimensions = { ...this.dimensions, ...newDimensions }
        this.gameBoxGeometry.dispose()
        this.gameBoxGeometry = new THREE.BoxGeometry(
            this.dimensions.width,
            this.dimensions.height,
            this.dimensions.depth
        )
    }

    private createPlaceholderMaterials(): THREE.MeshPhongMaterial[] {
        return [
            new THREE.MeshPhongMaterial({ color: 0x4a90e2 }), // Blue
            new THREE.MeshPhongMaterial({ color: 0xe74c3c }), // Red  
            new THREE.MeshPhongMaterial({ color: 0x2ecc71 }), // Green
            new THREE.MeshPhongMaterial({ color: 0xf39c12 }), // Orange
            new THREE.MeshPhongMaterial({ color: 0x9b59b6 }), // Purple
            new THREE.MeshPhongMaterial({ color: 0x1abc9c }), // Teal
        ]
    }

    private calculateStartX(numBoxes: number): number {
        return -(numBoxes - 1) * this.shelfConfig.spacing / 2
    }

    private calculateBoxPosition(index: number, startX: number): GameBoxPosition {
        return {
            x: this.shelfConfig.centerX + startX + (index * this.shelfConfig.spacing),
            y: this.shelfConfig.surfaceY + this.dimensions.height / 2,
            z: this.shelfConfig.centerZ + 0.08
        }
    }

    private sortAndLimitGames(games: SteamGameData[]): SteamGameData[] {
        // Get games with recent playtime first, then alphabetical
        const playedGames = games
            .filter(game => game.playtime_forever > 0)
            .sort((a, b) => b.playtime_forever - a.playtime_forever)
            .slice(0, this.shelfConfig.maxGames)
        
        // If we don't have enough played games, fill with unplayed games
        if (playedGames.length < this.shelfConfig.maxGames) {
            const unplayedGames = games
                .filter(game => game.playtime_forever === 0)
                .sort((a, b) => a.name.localeCompare(b.name))
                .slice(0, this.shelfConfig.maxGames - playedGames.length)
            
            playedGames.push(...unplayedGames)
        }
        
        return playedGames
    }

    /**
     * Dispose of resources
     */
    public dispose() {
        this.gameBoxGeometry.dispose()
    }
}
