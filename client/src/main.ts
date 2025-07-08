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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { SteamApiClient } from './steam'
import { ValidationUtils } from './utils'
import { UIManager, type UIManagerEvents } from './ui'

class SteamBrickAndMortar {
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private renderer: THREE.WebGLRenderer
    private steamClient: SteamApiClient
    private uiManager: UIManager
    
    // Steam data state
    private currentSteamData: any = null
    private currentGameIndex: number = 0

    constructor() {
        this.scene = new THREE.Scene()
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.steamClient = new SteamApiClient('https://steam-api-dev.wehrly.com')
        
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
            this.setupRenderer()
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

    private setupRenderer() {
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.setPixelRatio(window.devicePixelRatio)
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        this.renderer.shadowMap.enabled = true
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
        
        // Enable WebXR
        this.renderer.xr.enabled = true
        
        document.body.appendChild(this.renderer.domElement)
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight
            this.camera.updateProjectionMatrix()
            this.renderer.setSize(window.innerWidth, window.innerHeight)
        })
    }

    private setupScene() {
        // Basic lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
        this.scene.add(ambientLight)
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
        directionalLight.position.set(5, 10, 5)
        directionalLight.castShadow = true
        directionalLight.shadow.mapSize.width = 1024
        directionalLight.shadow.mapSize.height = 1024
        this.scene.add(directionalLight)

        // Load shelf model
        this.loadShelfModel()

        // Small test cube for reference (can be removed later)
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 })
        const cube = new THREE.Mesh(geometry, material)
        cube.position.set(2, 0, -1) // Move to side so it doesn't interfere with shelf
        cube.castShadow = true
        this.scene.add(cube)

        // Floor plane
        const floorGeometry = new THREE.PlaneGeometry(20, 20)
        const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x808080 })
        const floor = new THREE.Mesh(floorGeometry, floorMaterial)
        floor.rotation.x = -Math.PI / 2
        floor.position.y = -2
        floor.receiveShadow = true
        this.scene.add(floor)

        // Position camera
        this.camera.position.set(0, 1.6, 0) // Average human eye height
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

            this.camera.rotation.y -= deltaX * 0.005
            this.camera.rotation.x -= deltaY * 0.005

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
            if (keys.w) this.camera.translateZ(-speed)
            if (keys.s) this.camera.translateZ(speed)
            if (keys.a) this.camera.translateX(-speed)
            if (keys.d) this.camera.translateX(speed)
        }
    }

    private updateMovement: () => void = () => {}

    private async handleWebXRToggle() {
        try {
            console.log('🥽 Attempting to start WebXR session...')
            
            const session = await navigator.xr!.requestSession('immersive-vr')
            await this.renderer.xr.setSession(session)
            
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
        const extractedVanity = ValidationUtils.extractVanityFromInput(vanityUrl)
        
        this.uiManager.showSteamStatus('Loading Steam games...', 'loading')
        this.uiManager.showProgress(true)
        
        try {
            console.log(`🔍 Loading games for Steam user: ${extractedVanity}`)
            
            // Step 1: Get basic user and game list data
            this.uiManager.updateProgress(0, 100, 'Fetching game library...')
            const resolveResponse = await this.steamClient.resolveVanityUrl(extractedVanity)
            const userGames = await this.steamClient.getUserGames(resolveResponse.steamid)
            
            // Store the data for game generation
            this.currentSteamData = userGames
            
            this.uiManager.updateProgress(10, 100, `Found ${userGames.game_count} games. Loading details...`)
            
            // Step 2: Use progressive loading for game details and artwork
            const progressOptions = {
                maxGames: 30, // 🚧 Development limit to avoid excessive API calls
                onProgress: (current: number, total: number) => {
                    const percentage = Math.round((current / total) * 90) + 10 // Reserve 10% for initial fetch
                    this.uiManager.updateProgress(percentage, 100, `Loaded ${current}/${total} games`)
                },
                onGameLoaded: (game: any) => {
                    // Update game boxes in real-time as they load
                    this.addGameBoxToScene(game, this.currentGameIndex++)
                }
            }
            
            // Remove existing placeholder boxes before progressive loading
            this.clearGameBoxes()
            
            // Start progressive loading
            await this.steamClient.loadGamesProgressively(userGames, progressOptions)
            
            // Show completion message
            this.uiManager.updateProgress(100, 100, 'Loading complete!')
            this.uiManager.showSteamStatus(
                `✅ Successfully loaded ${userGames.game_count} games for ${userGames.vanity_url}!`, 
                'success'
            )
            
            console.log(`✅ Progressive loading complete for ${userGames.game_count} games`)
            
            // Update cache display and offline availability
            this.updateCacheStatsDisplay()
            this.uiManager.checkOfflineAvailability(extractedVanity)
            
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
        // Remove existing game boxes
        const existingBoxes = this.scene.children.filter(child => 
            child.userData?.isGameBox
        )
        existingBoxes.forEach(box => this.scene.remove(box))
        console.log(`🗑️ Cleared ${existingBoxes.length} existing game boxes`)
    }
    
    private addGameBoxToScene(game: any, index: number) {
        // Game case dimensions
        const boxWidth = 0.15
        const boxHeight = 0.2
        const boxDepth = 0.02
        
        const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth)
        
        // Position configuration  
        const shelfSurfaceY = -0.8
        const shelfCenterZ = -3
        const shelfCenterX = 0
        
        // Calculate position for this game box
        const maxGamesToShow = 12 // Limit for visual clarity
        const spacingX = 0.16
        const startX = -(Math.min(maxGamesToShow, 12) - 1) * spacingX / 2
        
        // Only show if within our display limit
        if (index >= maxGamesToShow) {
            return
        }
        
        // Create a material with color based on game name
        const colorHue = ValidationUtils.stringToHue(game.name)
        const material = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color().setHSL(colorHue, 0.7, 0.5)
        })
        
        const gameBox = new THREE.Mesh(boxGeometry, material)
        
        // Mark as game box with Steam data
        gameBox.userData = { 
            isGameBox: true, 
            steamGame: game,
            appId: game.appid,
            name: game.name,
            playtime: game.playtime_forever
        }
        
        // Position the box
        gameBox.position.set(
            shelfCenterX + startX + (index * spacingX),
            shelfSurfaceY + boxHeight / 2,
            shelfCenterZ + 0.08
        )
        
        // Enable shadows
        gameBox.castShadow = true
        gameBox.receiveShadow = true
        
        // Add to scene
        this.scene.add(gameBox)
        
        console.log(`📦 Added game box ${index}: ${game.name}`)
    }
    
    private async checkSteamAPIHealth() {
        console.log('🔍 Steam API health check skipped in simplified client')
        return true
    }
    
    private updateGameBoxesWithSteamData(userGames: any) {
        console.log('🎮 Updating game boxes with real Steam data...')
        
        // Remove existing placeholder boxes
        const existingBoxes = this.scene.children.filter(child => 
            child.userData?.isGameBox
        )
        existingBoxes.forEach(box => this.scene.remove(box))
        
        // Create new game boxes from Steam data
        this.createGameBoxesFromSteamData(userGames.games || [])
    }

    private async loadShelfModel() {
        const loader = new GLTFLoader()
        
        try {
            console.log('📦 Loading shelf model...')
            
            // Load the shelf model from our public assets
            const gltf = await loader.loadAsync('/models/blockbuster_shelf.glb')
            
            const shelfModel = gltf.scene
            
            // Position the shelf in the scene
            shelfModel.position.set(0, -1, -3) // Center it and place it in front of camera
            shelfModel.scale.setScalar(1) // Adjust scale if needed
            
            // Enable shadows for all meshes in the shelf model
            shelfModel.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true
                    child.receiveShadow = true
                }
            })
            
            this.scene.add(shelfModel)
            console.log('✅ Shelf model loaded successfully!')
            
            // Add placeholder game boxes on the shelf
            this.createPlaceholderGameBoxes()
            
        } catch (error) {
            console.error('❌ Failed to load shelf model:', error)
            console.warn('⚠️ Continuing without shelf model - check file path and format')
        }
    }

    private createPlaceholderGameBoxes() {
        console.log('📦 Creating placeholder game boxes...')
        
        // Game case dimensions (roughly based on standard game box sizes)
        const boxWidth = 0.15    // Width of game case
        const boxHeight = 0.2    // Height of game case  
        const boxDepth = 0.02    // Depth/thickness of game case
        
        // Create geometry and materials for game boxes
        const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth)
        
        // Create different colored materials for visual variety
        const materials = [
            new THREE.MeshPhongMaterial({ color: 0x4a90e2 }), // Blue
            new THREE.MeshPhongMaterial({ color: 0xe74c3c }), // Red  
            new THREE.MeshPhongMaterial({ color: 0x2ecc71 }), // Green
            new THREE.MeshPhongMaterial({ color: 0xf39c12 }), // Orange
            new THREE.MeshPhongMaterial({ color: 0x9b59b6 }), // Purple
            new THREE.MeshPhongMaterial({ color: 0x1abc9c }), // Teal
        ]
        
        // Position boxes on the shelf
        // Assuming shelf surface is roughly at y = -0.8 (shelf at -1, plus some height)
        const shelfSurfaceY = -0.8
        const shelfCenterZ = -3
        const shelfCenterX = 0
        
        // Create a row of game boxes
        const numBoxes = 6
        const spacingX = 0.18 // Space between boxes
        const startX = -(numBoxes - 1) * spacingX / 2 // Center the row
        
        for (let i = 0; i < numBoxes; i++) {
            const gameBox = new THREE.Mesh(boxGeometry, materials[i % materials.length])
            
            // Mark as game box for identification
            gameBox.userData = { isGameBox: true, isPlaceholder: true }
            
            // Position each box
            gameBox.position.set(
                shelfCenterX + startX + (i * spacingX),  // X: spread across shelf
                shelfSurfaceY + boxHeight / 2,           // Y: rest on shelf surface
                shelfCenterZ + 0.1                       // Z: slightly forward from shelf back
            )
            
            // Enable shadows
            gameBox.castShadow = true
            gameBox.receiveShadow = true
            
            // Add some subtle random rotation for natural look
            gameBox.rotation.y = (Math.random() - 0.5) * 0.1 // Small random Y rotation
            
            this.scene.add(gameBox)
        }
        
        console.log(`✅ Created ${numBoxes} placeholder game boxes on shelf`)
    }
    
    private createGameBoxesFromSteamData(games: any[]) {
        console.log(`🎮 Creating game boxes from ${games.length} Steam games...`)
        
        if (!games || games.length === 0) {
            console.warn('⚠️ No games provided, keeping placeholder boxes')
            return
        }
        
        // Game case dimensions (same as placeholder)
        const boxWidth = 0.15
        const boxHeight = 0.2
        const boxDepth = 0.02
        
        const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth)
        
        // Position configuration
        const shelfSurfaceY = -0.8
        const shelfCenterZ = -3
        const shelfCenterX = 0
        
        // Determine how many games to show (limit for performance and visual clarity)
        const maxGamesToShow = Math.min(games.length, 12) // Show up to 12 games
        const spacingX = 0.16 // Slightly tighter spacing for more games
        const startX = -(maxGamesToShow - 1) * spacingX / 2
        
        // Get games with recent playtime first, then alphabetical
        const sortedGames = [...games]
            .filter(game => game.playtime_forever > 0) // Prioritize played games
            .sort((a, b) => b.playtime_forever - a.playtime_forever) // Most played first
            .slice(0, maxGamesToShow)
        
        // If we don't have enough played games, fill with unplayed games
        if (sortedGames.length < maxGamesToShow) {
            const unplayedGames = games
                .filter(game => game.playtime_forever === 0)
                .sort((a, b) => a.name.localeCompare(b.name))
                .slice(0, maxGamesToShow - sortedGames.length)
            
            sortedGames.push(...unplayedGames)
        }
        
        // Create game boxes
        sortedGames.forEach((game, index) => {
            // Create a material with a color based on game name (for now)
            const colorHue = ValidationUtils.stringToHue(game.name)
            const material = new THREE.MeshPhongMaterial({ 
                color: new THREE.Color().setHSL(colorHue, 0.7, 0.5)
            })
            
            const gameBox = new THREE.Mesh(boxGeometry, material)
            
            // Mark as game box with Steam data
            gameBox.userData = { 
                isGameBox: true, 
                steamGame: game,
                appId: game.appid,
                name: game.name,
                playtime: game.playtime_forever
            }
            
            // Position the box
            gameBox.position.set(
                shelfCenterX + startX + (index * spacingX),
                shelfSurfaceY + boxHeight / 2,
                shelfCenterZ + 0.1
            )
            
            // Enable shadows
            gameBox.castShadow = true
            gameBox.receiveShadow = true
            
            // Add slight random rotation
            gameBox.rotation.y = (Math.random() - 0.5) * 0.05
            
            this.scene.add(gameBox)
        })
        
        console.log(`✅ Created ${sortedGames.length} game boxes from Steam library`)
    }
    
    // Cache Management Methods
    
    private async handleUseOfflineData(vanityUrl: string) {
        // For now, just show a message that offline mode is not available in simplified client
        this.uiManager.showSteamStatus('Offline mode not available in simplified client', 'error')
    }
    
    private async handleRefreshCache() {
        // For the simplified client, just reload the data normally
        this.uiManager.showSteamStatus('🔄 Reloading data...', 'loading')
        
        if (this.currentSteamData && this.currentSteamData.vanity_url) {
            // Re-trigger the load process
            await this.handleLoadSteamGames(this.currentSteamData.vanity_url)
        } else {
            this.uiManager.showSteamStatus('No data to refresh', 'error')
        }
    }
    
    private handleClearCache() {
        this.steamClient.clearCache()
        this.uiManager.showSteamStatus('🗑️ Cache cleared successfully', 'success')
        this.updateCacheStatsDisplay()
    }
    
    private handleShowCacheStats() {
        const stats = this.steamClient.getCacheStats()
        this.uiManager.updateCacheStats(stats)
    }
    
    private updateCacheStatsDisplay() {
        const stats = this.steamClient.getCacheStats()
        this.uiManager.updateCacheStats(stats)
    }

    private startRenderLoop() {
        this.renderer.setAnimationLoop(() => {
            this.updateMovement()
            
            // Rotate the test cube
            const cube = this.scene.getObjectByName('cube') || this.scene.children.find(obj => obj instanceof THREE.Mesh)
            if (cube) {
                cube.rotation.x += 0.01
                cube.rotation.y += 0.01
            }
            
            this.renderer.render(this.scene, this.camera)
        })
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new SteamBrickAndMortar()
})
