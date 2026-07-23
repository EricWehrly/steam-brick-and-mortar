/**
 * InputStateTracker - focus guard
 *
 * Regression test for the document-level keydown leak: typing into a text
 * input/textarea/contenteditable element must not register as a movement key.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InputStateTracker } from '../../../src/input/InputStateTracker'
import type { InputCallbacks } from '../../../src/input/InputContracts'

function makeKeyEvent(code: string, target: EventTarget | null): KeyboardEvent {
    return { code, target } as unknown as KeyboardEvent
}

describe('InputStateTracker focus guard', () => {
    let tracker: InputStateTracker
    let onKeyPress: ReturnType<typeof vi.fn<(key: string) => void>>
    let onKeyRelease: ReturnType<typeof vi.fn<(key: string) => void>>

    beforeEach(() => {
        onKeyPress = vi.fn<(key: string) => void>()
        onKeyRelease = vi.fn<(key: string) => void>()
        const callbacks: InputCallbacks = { onKeyPress, onKeyRelease }
        tracker = new InputStateTracker(callbacks)
    })

    it('ignores keydown when the event target is a text input', () => {
        tracker.handleKeyDown(makeKeyEvent('KeyW', document.createElement('input')))

        expect(tracker.getKeysPressed().has('KeyW')).toBe(false)
        expect(tracker.getInputState().keys.w).toBe(false)
        expect(onKeyPress).not.toHaveBeenCalled()
    })

    it('ignores keydown when the event target is a textarea', () => {
        tracker.handleKeyDown(makeKeyEvent('KeyA', document.createElement('textarea')))

        expect(tracker.getKeysPressed().has('KeyA')).toBe(false)
    })

    it('ignores keydown when the event target is contenteditable', () => {
        const div = document.createElement('div')
        div.contentEditable = 'true'

        tracker.handleKeyDown(makeKeyEvent('KeyS', div))

        expect(tracker.getKeysPressed().has('KeyS')).toBe(false)
    })

    it('processes keydown normally when the event target is not editable', () => {
        tracker.handleKeyDown(makeKeyEvent('KeyW', document.body))

        expect(tracker.getKeysPressed().has('KeyW')).toBe(true)
        expect(tracker.getInputState().keys.w).toBe(true)
        expect(onKeyPress).toHaveBeenCalledWith('w')
    })

    it('always processes keyup, even once focus has moved to an input, so a key never gets stuck', () => {
        tracker.handleKeyDown(makeKeyEvent('KeyW', document.body))
        expect(tracker.getInputState().keys.w).toBe(true)

        tracker.handleKeyUp(makeKeyEvent('KeyW', document.createElement('input')))

        expect(tracker.getInputState().keys.w).toBe(false)
        expect(tracker.getKeysPressed().has('KeyW')).toBe(false)
        expect(onKeyRelease).toHaveBeenCalledWith('w')
    })
})
