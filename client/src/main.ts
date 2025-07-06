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
import { SteamApiClient } from './steam/SteamApiClient'

class SteamBrickAndMortar {
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private renderer: THREE.WebGLRenderer
    private xrButton: HTMLElement | null
    private loading: HTMLElement | null
    private steamClient: SteamApiClient
    
    // Steam UI elements
    private steamUI: HTMLElement | null
    private steamVanityInput: HTMLInputElement | null
    private loadGamesButton: HTMLButtonElement | null
    private useOfflineButton: HTMLButtonElement | null
    private refreshCacheButton: HTMLButtonElement | null
    private clearCacheButton: HTMLButtonElement | null
    private showCacheStatsButton: HTMLButtonElement | null
    private cacheInfoDiv: HTMLElement | null
    private steamStatus: HTMLElement | null
    private controlsHelp: HTMLElement | null
    
    // Progressive loading UI elements
    private loadingProgress: HTMLElement | null
    private progressFill: HTMLElement | null
    private progressText: HTMLElement | null
    private progressGame: HTMLElement | null
    
    // Steam data state
    private currentSteamData: any = null

    constructor() {
        this.scene = new THREE.Scene()
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.xrButton = document.getElementById('webxr-button')
        this.loading = document.getElementById('loading')
        this.steamClient = new SteamApiClient('https://steam-api-dev.wehrly.com')
        
        // Steam UI elements
        this.steamUI = document.getElementById('steam-ui')
        this.steamVanityInput = document.getElementById('steam-vanity') as HTMLInputElement
        this.loadGamesButton = document.getElementById('load-steam-games') as HTMLButtonElement
        this.useOfflineButton = document.getElementById('use-offline-data') as HTMLButtonElement
        this.refreshCacheButton = document.getElementById('refresh-cache') as HTMLButtonElement
        this.clearCacheButton = document.getElementById('clear-cache') as HTMLButtonElement
        this.showCacheStatsButton = document.getElementById('show-cache-stats') as HTMLButtonElement
        this.cacheInfoDiv = document.getElementById('cache-info')
        this.steamStatus = document.getElementById('steam-status')
        this.controlsHelp = document.getElementById('controls-help')
        
        // Progressive loading UI elements
        this.loadingProgress = document.getElementById('loading-progress')
        this.progressFill = document.getElementById('progress-fill')
        this.progressText = document.getElementById('progress-text')
        this.progressGame = document.getElementById('progress-game')

        this.init()
    }

    private async init() {
        console.log('🎮 Initializing Steam Brick and Mortar WebXR...')
        
        try {
            this.setupRenderer()
            this.setupScene()
            this.setupWebXR()
            this.setupControls()
            this.setupSteamUI()
            await this.checkSteamAPIHealth()
            this.hideLoading()
            this.showSteamUI()
            this.showControlsHelp()
            this.startRenderLoop()
            
            console.log('✅ WebXR environment ready!')
        } catch (error) {
            console.error('❌ Failed to initialize WebXR environment:', error)
            this.showError('Failed to initialize WebXR environment')
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
            this.showWebXRUnsupported()
            return
        }

        try {
            const supported = await navigator.xr.isSessionSupported('immersive-vr')
            if (supported) {
                console.log('✅ WebXR VR sessions supported')
                this.showWebXRButton()
            } else {
                console.warn('⚠️ WebXR VR sessions not supported - desktop mode only')
                this.showWebXRUnsupported()
            }
        } catch (error) {
            console.warn('⚠️ WebXR session support check failed:', error)
            this.showWebXRUnsupported()
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

    private showWebXRButton() {
        if (!this.xrButton) return

        this.xrButton.style.display = 'block'
        this.xrButton.addEventListener('click', async () => {
            try {
                console.log('🥽 Attempting to start WebXR session...')
                
                const session = await navigator.xr!.requestSession('immersive-vr')
                await this.renderer.xr.setSession(session)
                
                console.log('✅ WebXR session started!')
                this.xrButton!.textContent = 'Exit VR'
                
                session.addEventListener('end', () => {
                    console.log('🚪 WebXR session ended')
                    this.xrButton!.textContent = 'Enter VR'
                })
                
            } catch (error) {
                console.error('❌ Failed to start WebXR session:', error)
                this.showError('Failed to enter VR mode')
            }
        })
    }

    private showWebXRUnsupported() {
        if (!this.xrButton) return
        
        this.xrButton.style.display = 'block'
        this.xrButton.textContent = 'VR Not Available'
        if (this.xrButton instanceof HTMLButtonElement) {
            this.xrButton.disabled = true
        }
    }

    private hideLoading() {
        if (this.loading) {
            this.loading.style.display = 'none'
        }
    }

    private showError(message: string) {
        if (this.loading) {
            this.loading.innerHTML = `
                <h1>Error</h1>
                <p>${message}</p>
                <p>Check console for details.</p>
            `
        }
    }

    private setupSteamUI() {
        if (!this.loadGamesButton || !this.steamVanityInput) return
        
        // Add event listener for the Load Games button
        this.loadGamesButton.addEventListener('click', () => {
            this.handleLoadSteamGames()
        })
        
        // Add event listener for the Use Offline button
        if (this.useOfflineButton) {
            this.useOfflineButton.addEventListener('click', () => {
                this.handleUseOfflineData()
            })
        }
        
        // Add event listeners for cache management buttons
        if (this.refreshCacheButton) {
            this.refreshCacheButton.addEventListener('click', () => {
                this.handleRefreshCache()
            })
        }
        
        if (this.clearCacheButton) {
            this.clearCacheButton.addEventListener('click', () => {
                this.handleClearCache()
            })
        }
        
        if (this.showCacheStatsButton) {
            this.showCacheStatsButton.addEventListener('click', () => {
                this.handleShowCacheStats()
            })
        }
        
        // Add Enter key support for the input field
        this.steamVanityInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                this.handleLoadSteamGames()
            }
        })
        
        // Add input change handler to check offline availability
        this.steamVanityInput.addEventListener('input', () => {
            this.checkOfflineAvailability()
        })
        
        // Add placeholder example for UX
        this.steamVanityInput.placeholder = 'e.g., SpiteMonger or steamcommunity.com/id/SpiteMonger'
        
        // Initial cache stats display
        this.updateCacheStatsDisplay()
    }
    
    private async handleLoadSteamGames() {
        if (!this.steamVanityInput || !this.loadGamesButton) return
        
        const vanityInput = this.steamVanityInput.value.trim()
        if (!vanityInput) {
            this.showSteamStatus('Please enter a Steam profile URL or vanity name', 'error')
            return
        }
        
        // Extract vanity name from various URL formats
        const vanityUrl = this.extractVanityFromInput(vanityInput)
        
        this.showSteamStatus('Loading Steam games...', 'loading')
        this.loadGamesButton.disabled = true
        this.showProgressUI(true)
        
        try {
            console.log(`🔍 Loading games for Steam user: ${vanityUrl}`)
            
            // Step 1: Get basic user and game list data
            this.updateProgress(0, 100, 'Fetching game library...')
            const userGames = await this.steamClient.getUserGamesByVanityUrl(vanityUrl)
            
            // Store the data for game generation
            this.currentSteamData = userGames
            
            this.updateProgress(10, 100, `Found ${userGames.game_count} games. Loading details...`)
            
            // Step 2: Use progressive loading for game details and artwork
            const progressOptions = {
                maxRequestsPerSecond: 4, // 4 games per second as requested
                skipCached: true,
                prioritizeByPlaytime: true,
                maxGames: 30, // 🚧 Development limit to avoid excessive API calls
                onProgress: (current: number, total: number, currentGame?: any) => {
                    const percentage = Math.round((current / total) * 90) + 10 // Reserve 10% for initial fetch
                    const gameText = currentGame ? `Loading: ${currentGame.name}` : ''
                    this.updateProgress(percentage, 100, `Loaded ${current}/${total} games`, gameText)
                },
                onGameLoaded: (game: any, index: number) => {
                    // Update game boxes in real-time as they load
                    this.addGameBoxToScene(game, index)
                }
            }
            
            // Remove existing placeholder boxes before progressive loading
            this.clearGameBoxes()
            
            // Start progressive loading
            await this.steamClient.loadGamesProgressively(userGames, progressOptions)
            
            // Show completion message
            this.updateProgress(100, 100, 'Loading complete!')
            this.showSteamStatus(
                `✅ Successfully loaded ${userGames.game_count} games for ${userGames.vanity_url}!`, 
                'success'
            )
            
            console.log(`✅ Progressive loading complete for ${userGames.game_count} games`)
            
            // Update cache display and offline availability
            this.updateCacheStatsDisplay()
            this.checkOfflineAvailability()
            
            // Hide progress after a short delay
            setTimeout(() => {
                this.showProgressUI(false)
            }, 2000)
            
        } catch (error) {
            console.error('❌ Failed to load Steam games:', error)
            this.showSteamStatus(
                `❌ Failed to load games. Please check the Steam profile name and try again.`, 
                'error'
            )
            this.showProgressUI(false)
        } finally {
            this.loadGamesButton.disabled = false
        }
    }
    
    private extractVanityFromInput(input: string): string {
        // Handle various Steam URL formats:
        // - Direct vanity: "SpiteMonger"
        // - Full URL: "https://steamcommunity.com/id/SpiteMonger"
        // - Partial URL: "steamcommunity.com/id/SpiteMonger"
        // - Profile URL: "/id/SpiteMonger"
        
        const vanityMatch = input.match(/(?:steamcommunity\.com\/id\/|\/id\/)?([^\/\s]+)\/?$/i)
        return vanityMatch ? vanityMatch[1] : input
    }
    
    private showProgressUI(show: boolean) {
        if (!this.loadingProgress) return
        
        this.loadingProgress.style.display = show ? 'block' : 'none'
        
        if (!show) {
            // Reset progress when hiding
            this.updateProgress(0, 100, '')
        }
    }
    
    private updateProgress(current: number, total: number, message: string, gameText: string = '') {
        if (!this.progressFill || !this.progressText || !this.progressGame) return
        
        const percentage = Math.max(0, Math.min(100, (current / total) * 100))
        
        this.progressFill.style.width = `${percentage}%`
        this.progressText.textContent = message
        this.progressGame.textContent = gameText
    }
    
    private clearGameBoxes() {
        // Remove existing game boxes
        const existingBoxes = this.scene.children.filter(child => 
            child.userData && child.userData.isGameBox
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
        const colorHue = this.stringToHue(game.name)
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
    
    private showSteamStatus(message: string, type: 'loading' | 'success' | 'error') {
        if (!this.steamStatus) return
        
        this.steamStatus.textContent = message
        this.steamStatus.className = `status-${type}`
        
        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                if (this.steamStatus) {
                    this.steamStatus.className = 'status-hidden'
                }
            }, 5000)
        }
    }
    
    private showSteamUI() {
        if (this.steamUI) {
            this.steamUI.style.display = 'block'
        }
    }
    
    private showControlsHelp() {
        if (this.controlsHelp) {
            this.controlsHelp.style.display = 'block'
        }
    }
    
    private async checkSteamAPIHealth() {
        console.log('🔍 Checking Steam API health...')
        
        try {
            const health = await this.steamClient.checkHealth()
            console.log('✅ Steam API health check passed:', health.status)
            return true
        } catch (error) {
            console.warn('⚠️ Steam API health check failed (but app will continue):', error)
            this.showSteamStatus('⚠️ Steam API may be temporarily unavailable', 'error')
            return false
        }
    }
    
    private updateGameBoxesWithSteamData(userGames: any) {
        console.log('🎮 Updating game boxes with real Steam data...')
        
        // Remove existing placeholder boxes
        const existingBoxes = this.scene.children.filter(child => 
            child.userData && child.userData.isGameBox
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
            const colorHue = this.stringToHue(game.name)
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
    
    private stringToHue(str: string): number {
        // Generate a consistent hue value (0-1) from a string
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash)
        }
        return Math.abs(hash % 360) / 360
    }
    
    // Cache Management Methods
    
    private async handleUseOfflineData() {
        if (!this.steamVanityInput) return
        
        const vanityInput = this.steamVanityInput.value.trim()
        if (!vanityInput) {
            this.showSteamStatus('Please enter a Steam profile name first', 'error')
            return
        }
        
        const vanityUrl = this.extractVanityFromInput(vanityInput)
        const cachedData = this.steamClient.getCachedUserData(vanityUrl)
        
        if (!cachedData) {
            this.showSteamStatus('No offline data available for this user', 'error')
            return
        }
        
        this.showSteamStatus(
            `📦 Using offline data: ${cachedData.game_count} games (cached: ${new Date(cachedData.retrieved_at).toLocaleString()})`,
            'success'
        )
        
        this.currentSteamData = cachedData
        this.updateGameBoxesWithSteamData(cachedData)
        this.updateCacheStatsDisplay()
    }
    
    private async handleRefreshCache() {
        if (!this.steamVanityInput || !this.currentSteamData) return
        
        const vanityInput = this.steamVanityInput.value.trim()
        if (!vanityInput) {
            this.showSteamStatus('Please enter a Steam profile name first', 'error')
            return
        }
        
        const vanityUrl = this.extractVanityFromInput(vanityInput)
        
        this.showSteamStatus('🔄 Refreshing cache...', 'loading')
        this.showProgressUI(true)
        
        try {
            // Step 1: Refresh basic user data 
            this.updateProgress(0, 100, 'Refreshing game library...')
            const refreshedData = await this.steamClient.refreshUserCache(vanityUrl)
            this.currentSteamData = refreshedData
            
            this.updateProgress(20, 100, `Refreshing ${refreshedData.game_count} games...`)
            
            // Step 2: Progressive loading with forced refresh (skipCached: false)
            const progressOptions = {
                maxRequestsPerSecond: 4,
                skipCached: false, // Force refresh all games
                prioritizeByPlaytime: true,
                maxGames: 30, // 🚧 Development limit to avoid excessive API calls
                onProgress: (current: number, total: number, currentGame?: any) => {
                    const percentage = Math.round((current / total) * 80) + 20 // Reserve 20% for initial fetch
                    const gameText = currentGame ? `Refreshing: ${currentGame.name}` : ''
                    this.updateProgress(percentage, 100, `Refreshed ${current}/${total} games`, gameText)
                },
                onGameLoaded: (game: any, index: number) => {
                    // Update game boxes in real-time as they refresh
                    this.addGameBoxToScene(game, index)
                }
            }
            
            // Clear existing boxes before refresh
            this.clearGameBoxes()
            
            // Start progressive refresh
            await this.steamClient.loadGamesProgressively(refreshedData, progressOptions)
            
            this.updateProgress(100, 100, 'Refresh complete!')
            this.showSteamStatus(
                `✅ Cache refreshed: ${refreshedData.game_count} games updated`,
                'success'
            )
            
            this.updateCacheStatsDisplay()
            this.checkOfflineAvailability()
            
            // Hide progress after a short delay
            setTimeout(() => {
                this.showProgressUI(false)
            }, 2000)
            
        } catch (error) {
            console.error('❌ Failed to refresh cache:', error)
            this.showSteamStatus('❌ Failed to refresh cache', 'error')
            this.showProgressUI(false)
        }
    }
    
    private handleClearCache() {
        this.steamClient.clearCache()
        this.showSteamStatus('🗑️ Cache cleared successfully', 'success')
        this.updateCacheStatsDisplay()
        this.checkOfflineAvailability()
    }
    
    private handleShowCacheStats() {
        const stats = this.steamClient.getCacheStats()
        
        if (!this.cacheInfoDiv) return
        
        const sizeKB = Math.round(stats.totalSize / 1024)
        const oldestDate = stats.oldestEntry ? new Date(stats.oldestEntry).toLocaleString() : 'N/A'
        const newestDate = stats.newestEntry ? new Date(stats.newestEntry).toLocaleString() : 'N/A'
        
        this.cacheInfoDiv.innerHTML = `
            <strong>Cache Statistics:</strong><br>
            • Total entries: ${stats.totalEntries}<br>
            • Resolve entries: ${stats.resolveEntries}<br>
            • Games entries: ${stats.gamesEntries}<br>
            • Cache size: ~${sizeKB} KB<br>
            • Oldest entry: ${oldestDate}<br>
            • Newest entry: ${newestDate}
        `
        
        // Toggle visibility
        const isHidden = this.cacheInfoDiv.style.display === 'none'
        this.cacheInfoDiv.style.display = isHidden ? 'block' : 'none'
        
        if (this.showCacheStatsButton) {
            this.showCacheStatsButton.textContent = isHidden ? 'Hide Info' : 'Cache Info'
        }
    }
    
    private checkOfflineAvailability() {
        if (!this.steamVanityInput || !this.useOfflineButton) return
        
        const vanityInput = this.steamVanityInput.value.trim()
        if (!vanityInput) {
            this.useOfflineButton.style.display = 'none'
            return
        }
        
        const vanityUrl = this.extractVanityFromInput(vanityInput)
        const isAvailable = this.steamClient.isAvailableOffline(vanityUrl)
        
        this.useOfflineButton.style.display = isAvailable ? 'inline-block' : 'none'
    }
    
    private updateCacheStatsDisplay() {
        const stats = this.steamClient.getCacheStats()
        
        // Update cache info if it's currently visible
        if (this.cacheInfoDiv && this.cacheInfoDiv.style.display === 'block') {
            this.handleShowCacheStats() // Refresh the display
        }
        
        // Update button text to show entry count
        if (this.showCacheStatsButton) {
            this.showCacheStatsButton.textContent = `Cache Info (${stats.totalEntries})`
        }
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
