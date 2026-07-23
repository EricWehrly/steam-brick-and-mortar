import type { InputCallbacks, InputKey, InputState, MovementOptions } from './InputContracts'
import { KEY_CODE_TO_INPUT_KEY } from './InputContracts'
import { DOMUtils } from '../utils/DOMUtils'

export class InputStateTracker {
    private static readonly RIGHT_MOUSE_BUTTON = 2

    private inputState: InputState = {
        keys: { w: false, a: false, s: false, d: false, q: false, e: false, space: false, c: false },
        mouse: { down: false, x: 0, y: 0 }
    }

    private keyPressTime: { [key: string]: number } = {}
    private readonly keysPressed = new Set<string>()
    private readonly mouseButtonsPressed = new Set<number>()
    private pendingMouseDeltaX = 0
    private pendingMouseDeltaY = 0
    private callbacks: InputCallbacks

    constructor(callbacks: InputCallbacks) {
        this.callbacks = callbacks
    }

    handleMouseDown = (event: MouseEvent): void => {
        this.inputState.mouse.down = true
        this.inputState.mouse.x = event.clientX
        this.inputState.mouse.y = event.clientY
        this.mouseButtonsPressed.add(event.button)
    }

    handleMouseUp = (event: MouseEvent): void => {
        this.inputState.mouse.down = false
        this.mouseButtonsPressed.delete(event.button)
    }

    handleMouseMove = (event: MouseEvent): void => {
        this.inputState.mouse.x = event.clientX
        this.inputState.mouse.y = event.clientY
        if (this.isMouseLookActive()) {
            this.pendingMouseDeltaX += event.movementX
            this.pendingMouseDeltaY += event.movementY
        }
    }

    handleKeyDown = (event: KeyboardEvent): void => {
        if (DOMUtils.isEditableElement(event.target)) {
            return
        }

        this.keysPressed.add(event.code)
        this.updateTrackedKeyState(event.code, this.setKeyPressed)
    }

    handleKeyUp = (event: KeyboardEvent): void => {
        this.keysPressed.delete(event.code)
        this.updateTrackedKeyState(event.code, this.setKeyReleased)
    }

    getInputState(): InputState {
        return { ...this.inputState }
    }

    isMoving(): boolean {
        const { keys } = this.inputState
        return keys.w || keys.a || keys.s || keys.d || keys.q || keys.e
    }

    getProgressiveSpeed(key: string, options: MovementOptions, accelerationTime: number, maxSpeedMultiplier: number): number {
        const pressTime = this.keyPressTime[key]
        if (!pressTime) {
            return 0
        }

        const heldTime = Date.now() - pressTime
        const progress = Math.min(heldTime / accelerationTime, 1)

        const minSpeed = options.speed * 0.1
        const maxSpeed = options.speed * maxSpeedMultiplier

        return minSpeed + (maxSpeed - minSpeed) * progress
    }

    getKeysPressed(): ReadonlySet<string> {
        return this.keysPressed
    }

    getMouseButtonsPressed(): ReadonlySet<number> {
        return this.mouseButtonsPressed
    }

    consumeMouseDeltaX(): number {
        const delta = this.pendingMouseDeltaX
        this.pendingMouseDeltaX = 0
        return delta
    }

    consumeMouseDeltaY(): number {
        const delta = this.pendingMouseDeltaY
        this.pendingMouseDeltaY = 0
        return delta
    }

    isShiftPressed(): boolean {
        return this.keysPressed.has('ShiftLeft') || this.keysPressed.has('ShiftRight')
    }

    clearCallbacks(): void {
        this.callbacks = {}
    }

    clear(): void {
        this.keysPressed.clear()
        this.mouseButtonsPressed.clear()
    }

    private isMouseLookActive(): boolean {
        return this.mouseButtonsPressed.has(InputStateTracker.RIGHT_MOUSE_BUTTON) || Boolean(document.pointerLockElement)
    }

    private updateTrackedKeyState(code: string, updater: (key: InputKey) => void): void {
        const inputKey = KEY_CODE_TO_INPUT_KEY[code]
        if (!inputKey) {
            return
        }

        updater.call(this, inputKey)
    }

    private setKeyPressed(key: InputKey): void {
        if (!this.inputState.keys[key]) {
            this.inputState.keys[key] = true
            this.keyPressTime[key] = Date.now()
            this.callbacks.onKeyPress?.(key)
        }
    }

    private setKeyReleased(key: InputKey): void {
        this.inputState.keys[key] = false
        delete this.keyPressTime[key]
        this.callbacks.onKeyRelease?.(key)
    }
}
