import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../src/core/EventManager'
import { ShelfAnchorRegistry } from '../../../src/scene/shelves/ShelfAnchorRegistry'
import {
    GameRenderEventTypes,
    StorePropsEventTypes,
    UIEventTypes,
    type ShelfSectionRepointedEvent,
    type ShelfReadyEvent,
} from '../../../src/types/InteractionEvents'
import type { LayoutRequestedEvent } from '../../../src/types/EnvironmentEvents'

const placeSignSpy = vi.fn().mockReturnValue(new THREE.Group())
const removeSignByIdSpy = vi.fn()

vi.mock('../../../src/scene/SceneSignManager', () => ({
    SceneSignManager: {
        get instance() {
            return {
                placeSign: placeSignSpy,
                removeSignById: removeSignByIdSpy,
            }
        },
    },
    SignStyles: {
        Category: { backgroundColor: 0x1a3a5c, textColor: 0xffffff, fontSize: 0.18, padding: '0.10 0.18' },
    },
}))

import { LiminalShelfSignPlanner } from '../../../src/scene/LiminalShelfSignPlanner'

function emitLayoutRequested(layoutMode: string): void {
    EventManager.getInstance().emit<LayoutRequestedEvent>(UIEventTypes.LayoutRequested, { layoutMode: layoutMode as any })
}

function emitShelfReady(shelfIndex: number, position = new THREE.Vector3(1, 0, -2), rotationY = 0): void {
    EventManager.getInstance().emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
        shelfIndex, sectionIndex: 0, position, rotationY,
    })
}

function emitShelfSectionRepointed(shelfIndex: number, sectionName: string | null): void {
    EventManager.getInstance().emit<ShelfSectionRepointedEvent>(GameRenderEventTypes.ShelfSectionRepointed, {
        shelfIndex, sectionName,
    })
}

function emitLibraryReloadRequest(): void {
    EventManager.getInstance().emit(StorePropsEventTypes.LibraryReloadRequest, {})
}

describe('LiminalShelfSignPlanner', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        ShelfAnchorRegistry.resetInstance()
        vi.clearAllMocks()
    })

    it('does nothing while not in liminal mode', () => {
        new LiminalShelfSignPlanner()
        emitShelfReady(0)

        emitShelfSectionRepointed(0, 'Action')

        expect(placeSignSpy).not.toHaveBeenCalled()
    })

    it('places a sign once the shelf is known and repointed to a section', () => {
        new LiminalShelfSignPlanner()
        emitLayoutRequested('liminal')
        emitShelfReady(0, new THREE.Vector3(1, 0, -2), Math.PI / 2)

        emitShelfSectionRepointed(0, 'Action')

        expect(placeSignSpy).toHaveBeenCalledTimes(1)
        const [renderKind, descriptor] = placeSignSpy.mock.calls[0]
        expect(renderKind).toBe('canvas')
        expect(descriptor.uniqueIdentifier).toBe('liminal-shelf-sign-0')
        expect(descriptor.text).toBe('Action')
    })

    it('does not place a sign when the shelf is not yet known to ShelfAnchorRegistry', () => {
        new LiminalShelfSignPlanner()
        emitLayoutRequested('liminal')
        // No ShelfReady for shelfIndex 3 — ShelfAnchorRegistry.resolve() returns null.

        emitShelfSectionRepointed(3, 'Action')

        expect(placeSignSpy).not.toHaveBeenCalled()
    })

    it('updates text and re-places the sign on a genuine section change', () => {
        new LiminalShelfSignPlanner()
        emitLayoutRequested('liminal')
        emitShelfReady(0)
        emitShelfSectionRepointed(0, 'Action')
        placeSignSpy.mockClear()
        removeSignByIdSpy.mockClear()

        emitShelfSectionRepointed(0, 'RPG')

        expect(removeSignByIdSpy).toHaveBeenCalledWith('liminal-shelf-sign-0')
        expect(placeSignSpy).toHaveBeenCalledTimes(1)
        expect(placeSignSpy.mock.calls[0][1].text).toBe('RPG')
    })

    it('does not re-place when a recycle keeps the same section (dedupe)', () => {
        new LiminalShelfSignPlanner()
        emitLayoutRequested('liminal')
        emitShelfReady(0)
        emitShelfSectionRepointed(0, 'Action')
        placeSignSpy.mockClear()
        removeSignByIdSpy.mockClear()

        emitShelfSectionRepointed(0, 'Action')

        expect(placeSignSpy).not.toHaveBeenCalled()
        expect(removeSignByIdSpy).not.toHaveBeenCalled()
    })

    it('removes the sign when a shelf\'s section becomes null (empty slot)', () => {
        new LiminalShelfSignPlanner()
        emitLayoutRequested('liminal')
        emitShelfReady(0)
        emitShelfSectionRepointed(0, 'Action')
        placeSignSpy.mockClear()
        removeSignByIdSpy.mockClear()

        emitShelfSectionRepointed(0, null)

        expect(removeSignByIdSpy).toHaveBeenCalledWith('liminal-shelf-sign-0')
        expect(placeSignSpy).not.toHaveBeenCalled()
    })

    it('removes the sign and places none when a shelf\'s section is \'Other\'', () => {
        new LiminalShelfSignPlanner()
        emitLayoutRequested('liminal')
        emitShelfReady(0)
        emitShelfSectionRepointed(0, 'Action')
        placeSignSpy.mockClear()
        removeSignByIdSpy.mockClear()

        emitShelfSectionRepointed(0, 'Other')

        expect(removeSignByIdSpy).toHaveBeenCalledWith('liminal-shelf-sign-0')
        expect(placeSignSpy).not.toHaveBeenCalled()
    })

    it('never places a sign for an empty/\'Other\' section from the start', () => {
        new LiminalShelfSignPlanner()
        emitLayoutRequested('liminal')
        emitShelfReady(0)

        emitShelfSectionRepointed(0, 'Other')

        expect(placeSignSpy).not.toHaveBeenCalled()
        expect(removeSignByIdSpy).not.toHaveBeenCalled()
    })

    it('resets all placed signs on library reload', () => {
        new LiminalShelfSignPlanner()
        emitLayoutRequested('liminal')
        emitShelfReady(0)
        emitShelfReady(1, new THREE.Vector3(3, 0, -2))
        emitShelfSectionRepointed(0, 'Action')
        emitShelfSectionRepointed(1, 'RPG')
        removeSignByIdSpy.mockClear()

        emitLibraryReloadRequest()

        expect(removeSignByIdSpy).toHaveBeenCalledWith('liminal-shelf-sign-0')
        expect(removeSignByIdSpy).toHaveBeenCalledWith('liminal-shelf-sign-1')
        expect(removeSignByIdSpy).toHaveBeenCalledTimes(2)
    })

    it('resets all placed signs when the layout switches away from liminal', () => {
        new LiminalShelfSignPlanner()
        emitLayoutRequested('liminal')
        emitShelfReady(0)
        emitShelfSectionRepointed(0, 'Action')
        removeSignByIdSpy.mockClear()

        emitLayoutRequested('row')

        expect(removeSignByIdSpy).toHaveBeenCalledWith('liminal-shelf-sign-0')
    })

    it('re-emitting the same section after a reset places a fresh sign (dedupe state cleared)', () => {
        new LiminalShelfSignPlanner()
        emitLayoutRequested('liminal')
        emitShelfReady(0)
        emitShelfSectionRepointed(0, 'Action')
        emitLayoutRequested('row')
        emitLayoutRequested('liminal')
        placeSignSpy.mockClear()

        emitShelfSectionRepointed(0, 'Action')

        expect(placeSignSpy).toHaveBeenCalledTimes(1)
    })
})
