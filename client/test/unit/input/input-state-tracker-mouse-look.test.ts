/**
 * InputStateTracker - mouse-look accumulation gate
 *
 * The gate generalizes from "right mouse button held" to "mouse-look is
 * active", which also includes pointer lock being engaged (task 5 groundwork).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { InputStateTracker } from '../../../src/input/InputStateTracker'

function makeMoveEvent(movementX: number, movementY: number): MouseEvent {
    return { movementX, movementY, clientX: 0, clientY: 0 } as unknown as MouseEvent
}

function setPointerLockElement(element: Element | null): void {
    Object.defineProperty(document, 'pointerLockElement', {
        value: element,
        configurable: true
    })
}

describe('InputStateTracker mouse-look gate', () => {
    afterEach(() => {
        setPointerLockElement(null)
    })

    it('does not accumulate deltas when neither right-click nor pointer lock is active', () => {
        const tracker = new InputStateTracker({})

        tracker.handleMouseMove(makeMoveEvent(10, 5))

        expect(tracker.consumeMouseDeltaX()).toBe(0)
        expect(tracker.consumeMouseDeltaY()).toBe(0)
    })

    it('accumulates X and Y while the right mouse button is held', () => {
        const tracker = new InputStateTracker({})

        tracker.handleMouseDown({ button: 2, clientX: 0, clientY: 0 } as MouseEvent)
        tracker.handleMouseMove(makeMoveEvent(10, 5))

        expect(tracker.consumeMouseDeltaX()).toBe(10)
        expect(tracker.consumeMouseDeltaY()).toBe(5)
    })

    it('accumulates X and Y while pointer lock is engaged, even without a button held', () => {
        const tracker = new InputStateTracker({})
        setPointerLockElement(document.createElement('canvas'))

        tracker.handleMouseMove(makeMoveEvent(-8, 3))

        expect(tracker.consumeMouseDeltaX()).toBe(-8)
        expect(tracker.consumeMouseDeltaY()).toBe(3)
    })

    it('consuming a delta resets it to zero', () => {
        const tracker = new InputStateTracker({})
        tracker.handleMouseDown({ button: 2, clientX: 0, clientY: 0 } as MouseEvent)
        tracker.handleMouseMove(makeMoveEvent(10, 5))

        tracker.consumeMouseDeltaX()
        tracker.consumeMouseDeltaY()

        expect(tracker.consumeMouseDeltaX()).toBe(0)
        expect(tracker.consumeMouseDeltaY()).toBe(0)
    })
})
