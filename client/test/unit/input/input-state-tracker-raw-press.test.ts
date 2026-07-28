/**
 * InputStateTracker - raw key press callback
 *
 * onRawKeyDown feeds InputActionResolver's raw-press resolution directly from the real keydown
 * event, bypassing the per-frame poll entirely for keyboard triggers. Must ignore OS auto-repeat
 * (event.repeat) - mouse has no equivalent callback, since a real mouse click already has its own
 * independent dispatch entirely separate from the binding system (see SystemUICoordinator).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InputStateTracker } from '../../../src/input/InputStateTracker'
import type { InputCallbacks } from '../../../src/input/InputContracts'

function makeKeyEvent(code: string, repeat: boolean, target: EventTarget | null = document.body): KeyboardEvent {
    return { code, repeat, target } as unknown as KeyboardEvent
}

describe('InputStateTracker raw key press callback', () => {
    let tracker: InputStateTracker
    let onRawKeyDown: ReturnType<typeof vi.fn<(code: string) => void>>

    beforeEach(() => {
        onRawKeyDown = vi.fn<(code: string) => void>()
        const callbacks: InputCallbacks = { onRawKeyDown }
        tracker = new InputStateTracker(callbacks)
    })

    it('fires onRawKeyDown for a fresh (non-repeat) keydown', () => {
        tracker.handleKeyDown(makeKeyEvent('Escape', false))

        expect(onRawKeyDown).toHaveBeenCalledWith('Escape')
    })

    it('does not fire onRawKeyDown for an OS auto-repeat keydown', () => {
        tracker.handleKeyDown(makeKeyEvent('Escape', false))
        onRawKeyDown.mockClear()

        tracker.handleKeyDown(makeKeyEvent('Escape', true))

        expect(onRawKeyDown).not.toHaveBeenCalled()
    })

    it('does not fire onRawKeyDown when the event target is a text input (focus guard)', () => {
        tracker.handleKeyDown(makeKeyEvent('Escape', false, document.createElement('input')))

        expect(onRawKeyDown).not.toHaveBeenCalled()
    })
})
