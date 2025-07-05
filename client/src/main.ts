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

    constructor() {
        this.scene = new THREE.Scene()
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.xrButton = document.getElementById('webxr-button')
        this.loading = document.getElementById('loading')
        this.steamClient = new SteamApiClient('https://steam-api-dev.wehrly.com')

        this.init()
    }

    private async init() {
        console.log('🎮 Initializing Steam Brick and Mortar WebXR...')
        
        try {
            this.setupRenderer()
            this.setupScene()
            this.setupWebXR()
            this.setupControls()
            await this.testSteamIntegration()
            this.hideLoading()
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

    private async testSteamIntegration() {
        console.log('🔍 Testing Steam API integration...')
        
        try {
            // Test 1: Health check
            const health = await this.steamClient.checkHealth()
            console.log('✅ Steam API health check passed:', health.status)
            
            // Test 2: Resolve SpiteMonger account and fetch games
            console.log('🔍 Testing with SpiteMonger account...')
            const userGames = await this.steamClient.getUserGamesByVanityUrl('SpiteMonger')
            console.log(`✅ Successfully fetched ${userGames.game_count} games for ${userGames.vanity_url}`)
            
            // Show sample games if available
            if (userGames.games && userGames.games.length > 0) {
                const sampleGames = userGames.games.slice(0, 3).map(game => game.name)
                console.log('📦 Sample games:', sampleGames)
            }
            
            // Store for later use in game generation
            (window as any).steamTestData = userGames
            
            console.log('🎉 Steam API integration working perfectly!')
            return true
        } catch (error) {
            console.warn('⚠️ Steam API integration test failed (but app will continue):', error)
            return false
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
