import { InputStateTracker } from './InputStateTracker'

export class InputEventAdapter {
    private isListening = false
    private readonly stateTracker: InputStateTracker

    constructor(stateTracker: InputStateTracker) {
        this.stateTracker = stateTracker
    }

    startListening(): boolean {
        if (this.isListening) {
            return false
        }

        document.addEventListener('mousedown', this.stateTracker.handleMouseDown)
        document.addEventListener('mouseup', this.stateTracker.handleMouseUp)
        document.addEventListener('mousemove', this.stateTracker.handleMouseMove)
        document.addEventListener('keydown', this.stateTracker.handleKeyDown)
        document.addEventListener('keyup', this.stateTracker.handleKeyUp)

        this.isListening = true
        return true
    }

    stopListening(): void {
        if (!this.isListening) {
            return
        }

        document.removeEventListener('mousedown', this.stateTracker.handleMouseDown)
        document.removeEventListener('mouseup', this.stateTracker.handleMouseUp)
        document.removeEventListener('mousemove', this.stateTracker.handleMouseMove)
        document.removeEventListener('keydown', this.stateTracker.handleKeyDown)
        document.removeEventListener('keyup', this.stateTracker.handleKeyUp)

        this.isListening = false
    }
}
