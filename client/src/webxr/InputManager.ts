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
        keys: { w: false, a: false, s: false, d: false },
        mouse: { down: false, x: 0, y: 0 }
    }
    
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
                    this.callbacks.onKeyPress?.('w')
                }
                break
            case 'KeyA': 
                if (!this.inputState.keys.a) {
                    this.inputState.keys.a = true
                    this.callbacks.onKeyPress?.('a')
                }
                break
            case 'KeyS': 
                if (!this.inputState.keys.s) {
                    this.inputState.keys.s = true
                    this.callbacks.onKeyPress?.('s')
                }
                break
            case 'KeyD': 
                if (!this.inputState.keys.d) {
                    this.inputState.keys.d = true
                    this.callbacks.onKeyPress?.('d')
                }
                break
        }
    }

    private handleKeyUp = (event: KeyboardEvent): void => {
        switch (event.code) {
            case 'KeyW': 
                this.inputState.keys.w = false
                this.callbacks.onKeyRelease?.('w')
                break
            case 'KeyA': 
                this.inputState.keys.a = false
                this.callbacks.onKeyRelease?.('a')
                break
            case 'KeyS': 
                this.inputState.keys.s = false
                this.callbacks.onKeyRelease?.('s')
                break
            case 'KeyD': 
                this.inputState.keys.d = false
                this.callbacks.onKeyRelease?.('d')
                break
        }
    }

    /**
     * Apply WASD movement to a camera
     */
    updateCameraMovement(camera: THREE.Camera): void {
        if (this.inputState.keys.w) camera.translateZ(-this.options.speed)
        if (this.inputState.keys.s) camera.translateZ(this.options.speed)
        if (this.inputState.keys.a) camera.translateX(-this.options.speed)
        if (this.inputState.keys.d) camera.translateX(this.options.speed)
    }

    /**
     * Apply mouse movement to camera rotation
     */
    updateCameraRotation(camera: THREE.Camera, deltaX: number, deltaY: number): void {
        camera.rotation.y -= deltaX * this.options.mouseSensitivity
        camera.rotation.x -= deltaY * this.options.mouseSensitivity
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
        return keys.w || keys.a || keys.s || keys.d
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.stopListening()
        this.callbacks = {}
    }
}
