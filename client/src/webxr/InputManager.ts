/**
 * Input Manager
 * 
 * Handles all input for both desktop and VR modes:
 * - Desktop mouse/keyboard controls
 * - VR controller input (future)
 * - Movement and interaction logic
 */

import * as THREE from 'three'

export interface InputState {
    keys: {
        w: boolean
        a: boolean
        s: boolean
        d: boolean
        q: boolean
        e: boolean
        space: boolean
        c: boolean
    }
    mouse: {
        down: boolean
        x: number
        y: number
    }
}

export interface MovementOptions {
    speed: number
    mouseSensitivity: number
}

export interface InputCallbacks {
    onMouseMove?: (deltaX: number, deltaY: number) => void
    onKeyPress?: (key: string) => void
    onKeyRelease?: (key: string) => void
}

/**
 * Manages input for desktop and VR modes
 */
export class InputManager {
    private inputState: InputState = {
        keys: { w: false, a: false, s: false, d: false, q: false, e: false, space: false, c: false },
        mouse: { down: false, x: 0, y: 0 }
    }
    
    // Progressive movement tracking
    private keyPressTime: { [key: string]: number } = {}
    // TODO: make momentum transferable to adjacent directions (W <-> A/D <-> S)
    private readonly ACCELERATION_TIME = 2500 // 2.5 seconds to reach max speed
    private readonly MAX_SPEED_MULTIPLIER = 1.4
    
    private options: MovementOptions = {
        speed: 0.1,
        mouseSensitivity: 0.005
    }
    
    private callbacks: InputCallbacks = {}
    private isListeningToEvents = false

    constructor(options: Partial<MovementOptions> = {}, callbacks: InputCallbacks = {}) {
        this.options = { ...this.options, ...options }
        this.callbacks = callbacks
    }

    /**
     * Start listening to input events
     */
    startListening(): void {
        if (this.isListeningToEvents) {
            console.warn('⚠️ InputManager already listening to events')
            return
        }

        this.setupMouseControls()
        this.setupKeyboardControls()
        this.isListeningToEvents = true
        
        console.log('🎮 Input controls activated')
    }

    /**
     * Stop listening to input events
     */
    stopListening(): void {
        if (!this.isListeningToEvents) {
            return
        }

        this.removeEventListeners()
        this.isListeningToEvents = false
        
        console.log('🎮 Input controls deactivated')
    }

    /**
     * Setup mouse controls for camera movement
     */
    private setupMouseControls(): void {
        document.addEventListener('mousedown', this.handleMouseDown)
        document.addEventListener('mouseup', this.handleMouseUp)
        document.addEventListener('mousemove', this.handleMouseMove)
    }

    /**
     * Setup keyboard controls for movement
     */
    private setupKeyboardControls(): void {
        document.addEventListener('keydown', this.handleKeyDown)
        document.addEventListener('keyup', this.handleKeyUp)
    }

    /**
     * Remove all event listeners
     */
    private removeEventListeners(): void {
        document.removeEventListener('mousedown', this.handleMouseDown)
        document.removeEventListener('mouseup', this.handleMouseUp)
        document.removeEventListener('mousemove', this.handleMouseMove)
        document.removeEventListener('keydown', this.handleKeyDown)
        document.removeEventListener('keyup', this.handleKeyUp)
    }

    private handleMouseDown = (event: MouseEvent): void => {
        this.inputState.mouse.down = true
        this.inputState.mouse.x = event.clientX
        this.inputState.mouse.y = event.clientY
    }

    private handleMouseUp = (): void => {
        this.inputState.mouse.down = false
    }

    private handleMouseMove = (event: MouseEvent): void => {
        if (!this.inputState.mouse.down) return

        const deltaX = event.clientX - this.inputState.mouse.x
        const deltaY = event.clientY - this.inputState.mouse.y

        this.inputState.mouse.x = event.clientX
        this.inputState.mouse.y = event.clientY

        this.callbacks.onMouseMove?.(deltaX, deltaY)
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        switch (event.code) {
            case 'KeyW': 
                if (!this.inputState.keys.w) {
                    this.inputState.keys.w = true
                    this.keyPressTime['w'] = Date.now()
                    this.callbacks.onKeyPress?.('w')
                }
                break
            case 'KeyA': 
                if (!this.inputState.keys.a) {
                    this.inputState.keys.a = true
                    this.keyPressTime['a'] = Date.now()
                    this.callbacks.onKeyPress?.('a')
                }
                break
            case 'KeyS': 
                if (!this.inputState.keys.s) {
                    this.inputState.keys.s = true
                    this.keyPressTime['s'] = Date.now()
                    this.callbacks.onKeyPress?.('s')
                }
                break
            case 'KeyD': 
                if (!this.inputState.keys.d) {
                    this.inputState.keys.d = true
                    this.keyPressTime['d'] = Date.now()
                    this.callbacks.onKeyPress?.('d')
                }
                break
            case 'KeyQ': 
                if (!this.inputState.keys.q) {
                    this.inputState.keys.q = true
                    this.callbacks.onKeyPress?.('q')
                }
                break
            case 'KeyE': 
                if (!this.inputState.keys.e) {
                    this.inputState.keys.e = true
                    this.callbacks.onKeyPress?.('e')
                }
                break
            case 'Space': 
                if (!this.inputState.keys.space) {
                    this.inputState.keys.space = true
                    this.keyPressTime['space'] = Date.now()
                    this.callbacks.onKeyPress?.('space')
                }
                break
            case 'KeyC': 
                if (!this.inputState.keys.c) {
                    this.inputState.keys.c = true
                    this.keyPressTime['c'] = Date.now()
                    this.callbacks.onKeyPress?.('c')
                }
                break
        }
    }

    private handleKeyUp = (event: KeyboardEvent): void => {
        switch (event.code) {
            case 'KeyW': 
                this.inputState.keys.w = false
                delete this.keyPressTime['w']
                this.callbacks.onKeyRelease?.('w')
                break
            case 'KeyA': 
                this.inputState.keys.a = false
                delete this.keyPressTime['a']
                this.callbacks.onKeyRelease?.('a')
                break
            case 'KeyS': 
                this.inputState.keys.s = false
                delete this.keyPressTime['s']
                this.callbacks.onKeyRelease?.('s')
                break
            case 'KeyD': 
                this.inputState.keys.d = false
                delete this.keyPressTime['d']
                this.callbacks.onKeyRelease?.('d')
                break
            case 'KeyQ': 
                this.inputState.keys.q = false
                this.callbacks.onKeyRelease?.('q')
                break
            case 'KeyE': 
                this.inputState.keys.e = false
                this.callbacks.onKeyRelease?.('e')
                break
            case 'Space': 
                this.inputState.keys.space = false
                delete this.keyPressTime['space']
                this.callbacks.onKeyRelease?.('space')
                break
            case 'KeyC': 
                this.inputState.keys.c = false
                delete this.keyPressTime['c']
                this.callbacks.onKeyRelease?.('c')
                break
        }
    }

    /**
     * Calculate progressive speed based on how long key has been held
     */
    private getProgressiveSpeed(key: string): number {
        const pressTime = this.keyPressTime[key]
        if (!pressTime) return 0
        
        const heldTime = Date.now() - pressTime
        const progress = Math.min(heldTime / this.ACCELERATION_TIME, 1) // 0 to 1 over 1.5s
        
        // Start at minimal speed, ramp up to 1.2x base speed
        const minSpeed = this.options.speed * 0.1 // Smallest increment
        const maxSpeed = this.options.speed * this.MAX_SPEED_MULTIPLIER
        
        return minSpeed + (maxSpeed - minSpeed) * progress
    }

    /**
     * Apply WASD + Space/C movement to a camera with progressive acceleration
     */
    updateCameraMovement(camera: THREE.Camera): void {
        if (this.inputState.keys.w) camera.translateZ(-this.getProgressiveSpeed('w'))
        if (this.inputState.keys.s) camera.translateZ(this.getProgressiveSpeed('s'))
        if (this.inputState.keys.a) camera.translateX(-this.getProgressiveSpeed('a'))
        if (this.inputState.keys.d) camera.translateX(this.getProgressiveSpeed('d'))
        if (this.inputState.keys.space) camera.translateY(this.getProgressiveSpeed('space')) // Move up
        if (this.inputState.keys.c) camera.translateY(-this.getProgressiveSpeed('c')) // Move down
    }

    /**
     * Apply mouse movement to camera rotation (Y-axis only)
     */
    updateCameraRotation(camera: THREE.Camera, deltaX: number, deltaY: number): void {
        // Mouse left/right only affects Y-axis rotation (yaw)
        camera.rotation.y -= deltaX * this.options.mouseSensitivity
        // Note: deltaY is ignored - pitch controls removed from mouse
    }

    /**
     * Apply Q/E key roll rotation to a camera - DISABLED for better UX
     */
    updateCameraRoll(camera: THREE.Camera): void {
        // Rotation controls disabled - they were difficult to work with
        // if (this.inputState.keys.q) camera.rotation.z += this.options.speed * 2 // Roll left
        // if (this.inputState.keys.e) camera.rotation.z -= this.options.speed * 2 // Roll right
    }

    /**
     * Get current input state
     */
    getInputState(): InputState {
        return { ...this.inputState }
    }

    /**
     * Update movement options
     */
    setMovementOptions(options: Partial<MovementOptions>): void {
        this.options = { ...this.options, ...options }
    }

    /**
     * Update callbacks
     */
    setCallbacks(callbacks: InputCallbacks): void {
        this.callbacks = { ...this.callbacks, ...callbacks }
    }

    /**
     * Check if any movement keys are pressed
     */
    isMoving(): boolean {
        const { keys } = this.inputState
        return keys.w || keys.a || keys.s || keys.d || keys.q || keys.e
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.stopListening()
        this.callbacks = {}
    }
}
