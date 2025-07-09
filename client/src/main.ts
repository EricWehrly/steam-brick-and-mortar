/**
 * Steam Brick and Mortar - WebXR Main Entry Point
 * 
 * Progressive WebXR implementation:
 * 1. Basic 3D scene with Three.js
 * 2. WebXR capability detection and session management
 * 3. Load Blender-generated shelf models
 * 4. VR interaction system
 * 5. Steam integration (later phase)
 */

import * as THREE from 'three'
import { ValidationUtils } from './utils'
import { UIManager } from './ui'
import { SceneManager, AssetLoader, GameBoxRenderer, type SteamGameData } from './scene'
import { SteamIntegration, type ProgressCallbacks } from './steam-integration'

class SteamBrickAndMortar {
    private sceneManager: SceneManager
    private assetLoader: AssetLoader
    private gameBoxRenderer: GameBoxRenderer
    private steamIntegration: SteamIntegration
    private uiManager: UIManager
    
    // Current game index for rendering
    private currentGameIndex: number = 0

    constructor() {
        this.sceneManager = new SceneManager({
            antialias: true,
            enableShadows: true,
            shadowMapType: THREE.PCFSoftShadowMap,
            outputColorSpace: THREE.SRGBColorSpace
        })
        this.assetLoader = new AssetLoader()
        this.gameBoxRenderer = new GameBoxRenderer()
        this.steamIntegration = new SteamIntegration({
            apiBaseUrl: 'https://steam-api-dev.wehrly.com',
            maxGames: 30
        })
        
        // Initialize UI Manager with event handlers
        this.uiManager = new UIManager({
            steamLoadGames: (vanityUrl: string) => this.handleLoadSteamGames(vanityUrl),
            steamUseOffline: (vanityUrl: string) => this.handleUseOfflineData(vanityUrl),
            steamRefreshCache: () => this.handleRefreshCache(),
            steamClearCache: () => this.handleClearCache(),
            steamShowCacheStats: () => this.handleShowCacheStats(),
            webxrEnterVR: () => this.handleWebXRToggle()
        })

        this.init()
    }

    private async init() {
        console.log('🎮 Initializing Steam Brick and Mortar WebXR...')
        
        try {
            this.setupScene()
            this.setupWebXR()
            this.setupControls()
            this.uiManager.init()
            this.uiManager.hideLoading()
            this.startRenderLoop()
            
            console.log('✅ WebXR environment ready!')
        } catch (error) {
            console.error('❌ Failed to initialize WebXR environment:', error)
            this.uiManager.showError('Failed to initialize WebXR environment')
        }
    }

    private async setupScene() {
        // Create floor
        this.sceneManager.createFloor()
        
        // Load shelf model
        await this.loadShelfModel()
        
        // Add test cube for reference
        this.addTestCube()
        
        console.log('✅ Scene setup complete')
    }

    private async loadShelfModel() {
        try {
            console.log('📦 Loading shelf model...')
            const shelfModel = await this.assetLoader.loadShelfModel()
            this.sceneManager.addToScene(shelfModel)
            
            // Add placeholder game boxes
            this.gameBoxRenderer.createPlaceholderBoxes(this.sceneManager.getScene())
            
            console.log('✅ Shelf model loaded successfully!')
        } catch (error) {
            console.error('❌ Failed to load shelf model:', error)
            console.warn('⚠️ Continuing without shelf model - check file path and format')
        }
    }

    private addTestCube() {
        // Small test cube for reference (can be removed later)
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 })
        const cube = new THREE.Mesh(geometry, material)
        cube.position.set(2, 0, -1) // Move to side so it doesn't interfere with shelf
        cube.castShadow = true
        cube.name = 'cube' // For animation reference
        this.sceneManager.addToScene(cube)
    }

    private async setupWebXR() {
        // Check WebXR support
        if (!navigator.xr) {
            console.warn('⚠️ WebXR not supported - falling back to desktop mode')
            this.uiManager.setWebXRSupported(false)
            return
        }

        try {
            const supported = await navigator.xr.isSessionSupported('immersive-vr')
            if (supported) {
                console.log('✅ WebXR VR sessions supported')
                this.uiManager.setWebXRSupported(true)
            } else {
                console.warn('⚠️ WebXR VR sessions not supported - desktop mode only')
                this.uiManager.setWebXRSupported(false)
            }
        } catch (error) {
            console.warn('⚠️ WebXR session support check failed:', error)
            this.uiManager.setWebXRSupported(false)
        }
    }

    private setupControls() {
        // Basic mouse/keyboard controls for desktop testing
        let mouseDown = false
        let mouseX = 0
        let mouseY = 0

        document.addEventListener('mousedown', (event) => {
            mouseDown = true
            mouseX = event.clientX
            mouseY = event.clientY
        })

        document.addEventListener('mouseup', () => {
            mouseDown = false
        })

        document.addEventListener('mousemove', (event) => {
            if (!mouseDown) return

            const deltaX = event.clientX - mouseX
            const deltaY = event.clientY - mouseY
            const camera = this.sceneManager.getCamera()

            camera.rotation.y -= deltaX * 0.005
            camera.rotation.x -= deltaY * 0.005

            mouseX = event.clientX
            mouseY = event.clientY
        })

        // WASD movement
        const keys = { w: false, a: false, s: false, d: false }
        
        document.addEventListener('keydown', (event) => {
            switch (event.code) {
                case 'KeyW': keys.w = true; break
                case 'KeyA': keys.a = true; break
                case 'KeyS': keys.s = true; break
                case 'KeyD': keys.d = true; break
            }
        })

        document.addEventListener('keyup', (event) => {
            switch (event.code) {
                case 'KeyW': keys.w = false; break
                case 'KeyA': keys.a = false; break
                case 'KeyS': keys.s = false; break
                case 'KeyD': keys.d = false; break
            }
        })

        // Movement update in render loop
        this.updateMovement = () => {
            const speed = 0.1
            const camera = this.sceneManager.getCamera()
            if (keys.w) camera.translateZ(-speed)
            if (keys.s) camera.translateZ(speed)
            if (keys.a) camera.translateX(-speed)
            if (keys.d) camera.translateX(speed)
        }
    }

    private updateMovement: () => void = () => {}

    private async handleWebXRToggle() {
        try {
            console.log('🥽 Attempting to start WebXR session...')
            
            if (!navigator.xr) {
                throw new Error('WebXR not available')
            }
            
            const session = await navigator.xr.requestSession('immersive-vr')
            await this.sceneManager.getRenderer().xr.setSession(session)
            
            console.log('✅ WebXR session started!')
            this.uiManager.setWebXRSessionActive(true)
            
            session.addEventListener('end', () => {
                console.log('🚪 WebXR session ended')
                this.uiManager.setWebXRSessionActive(false)
            })
            
        } catch (error) {
            console.error('❌ Failed to start WebXR session:', error)
            this.uiManager.showError('Failed to enter VR mode')
        }
    }

    private async handleLoadSteamGames(vanityUrl: string) {
        // Reset current game index
        this.currentGameIndex = 0
        
        // Remove existing placeholder boxes before loading
        this.clearGameBoxes()
        
        this.uiManager.showProgress(true)
        
        try {
            // Use SteamIntegration with progress callbacks
            const progressCallbacks: ProgressCallbacks = {
                onProgress: (current: number, total: number, message: string) => {
                    this.uiManager.updateProgress(current, total, message)
                },
                onGameLoaded: (game) => {
                    // Update game boxes in real-time as they load
                    this.addGameBoxToScene(game, this.currentGameIndex++)
                },
                onStatusUpdate: (message: string, type: 'loading' | 'success' | 'error') => {
                    this.uiManager.showSteamStatus(message, type)
                }
            }
            
            await this.steamIntegration.loadGamesForUser(vanityUrl, progressCallbacks)
            
            // Update cache display and offline availability
            this.updateCacheStatsDisplay()
            this.uiManager.checkOfflineAvailability(ValidationUtils.extractVanityFromInput(vanityUrl))
            
            // Hide progress after a short delay
            setTimeout(() => {
                this.uiManager.showProgress(false)
            }, 2000)
            
        } catch (error) {
            console.error('❌ Failed to load Steam games:', error)
            this.uiManager.showSteamStatus(
                `❌ Failed to load games. Please check the Steam profile name and try again.`, 
                'error'
            )
            this.uiManager.showProgress(false)
        }
    }
    
    private clearGameBoxes() {
        // Remove existing game boxes using scene manager
        const clearedCount = this.sceneManager.clearObjectsByUserData('isGameBox')
        console.log(`🗑️ Cleared ${clearedCount} existing game boxes`)
    }
    
    private addGameBoxToScene(game: SteamGameData, index: number) {
        // Create game box using the game box renderer
        const gameBox = this.gameBoxRenderer.createGameBox(this.sceneManager.getScene(), game, index)
        if (gameBox) {
            this.currentGameIndex = index + 1
        }
    }
    
    private async checkSteamAPIHealth() {
        console.log('🔍 Steam API health check skipped in simplified client')
        return true
    }
    
    private updateGameBoxesWithSteamData(userGames: { games?: SteamGameData[] }) {
        console.log('🎮 Updating game boxes with real Steam data...')
        
        // Remove existing placeholder boxes
        this.gameBoxRenderer.clearGameBoxes(this.sceneManager.getScene())
        
        // Create new game boxes from Steam data
        this.createGameBoxesFromSteamData(userGames.games ?? [])
    }

    private createGameBoxesFromSteamData(games: SteamGameData[]) {
        // Use the game box renderer to create boxes from Steam data
        this.gameBoxRenderer.createGameBoxesFromSteamData(this.sceneManager.getScene(), games)
    }

    // Cache Management Methods
    
    private async handleUseOfflineData(vanityUrl: string) {
        // Check if offline data is available using SteamIntegration
        const hasOfflineData = this.steamIntegration.hasOfflineData(vanityUrl)
        
        if (!hasOfflineData) {
            this.uiManager.showSteamStatus('Offline mode not available in simplified client', 'error')
        } else {
            // Future: Load offline data
            this.uiManager.showSteamStatus('Loading offline data...', 'loading')
        }
    }
    
    private async handleRefreshCache() {
        try {
            const progressCallbacks: ProgressCallbacks = {
                onProgress: (current: number, total: number, message: string) => {
                    this.uiManager.updateProgress(current, total, message)
                },
                onGameLoaded: (game) => {
                    this.addGameBoxToScene(game, this.currentGameIndex++)
                },
                onStatusUpdate: (message: string, type: 'loading' | 'success' | 'error') => {
                    this.uiManager.showSteamStatus(message, type)
                }
            }
            
            await this.steamIntegration.refreshData(progressCallbacks)
            this.updateCacheStatsDisplay()
        } catch (error) {
            console.error('❌ Failed to refresh cache:', error)
        }
    }
    
    private handleClearCache() {
        this.steamIntegration.clearCache()
        this.uiManager.showSteamStatus('🗑️ Cache cleared successfully', 'success')
        this.updateCacheStatsDisplay()
    }
    
    private handleShowCacheStats() {
        const stats = this.steamIntegration.getCacheStats()
        this.uiManager.updateCacheStats(stats)
    }
    
    private updateCacheStatsDisplay() {
        const stats = this.steamIntegration.getCacheStats()
        this.uiManager.updateCacheStats(stats)
    }

    private startRenderLoop() {
        this.sceneManager.startRenderLoop(() => {
            this.updateMovement()
            
            // Rotate the test cube
            const scene = this.sceneManager.getScene()
            const cube = scene.getObjectByName('cube') || scene.children.find(obj => obj instanceof THREE.Mesh)
            if (cube) {
                cube.rotation.x += 0.01
                cube.rotation.y += 0.01
            }
        })
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new SteamBrickAndMortar()
})
