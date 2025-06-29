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

class SteamBrickAndMortar {
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private renderer: THREE.WebGLRenderer
    private xrButton: HTMLElement | null
    private loading: HTMLElement | null

    constructor() {
        this.scene = new THREE.Scene()
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.xrButton = document.getElementById('webxr-button')
        this.loading = document.getElementById('loading')

        this.init()
    }

    private async init() {
        console.log('🎮 Initializing Steam Brick and Mortar WebXR...')
        
        try {
            this.setupRenderer()
            this.setupScene()
            this.setupWebXR()
            this.setupControls()
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

        // Simple test geometry - a colorful cube
        const geometry = new THREE.BoxGeometry(1, 1, 1)
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 })
        const cube = new THREE.Mesh(geometry, material)
        cube.position.set(0, 0, -3)
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
