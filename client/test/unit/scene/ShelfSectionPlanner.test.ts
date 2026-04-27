import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../src/core/EventManager'
import {
    GameEventTypes,
    StorePropsEventTypes,
    type ShelfReadyEvent,
    type ShelfLayoutDeterminedEvent,
} from '../../../src/types/InteractionEvents'
import type { SectionsReadyEvent } from '../../../src/types/EnvironmentEvents'
import type { Section } from '../../../src/types/LayoutTypes'
import type { SteamGameData } from '../../../src/scene/game-box/types/GameData'

const placeSignSpy = vi.fn().mockReturnValue(new THREE.Group())
const removeSignByIdSpy = vi.fn()
const clearAllSpy = vi.fn()
const disposeSpy = vi.fn()

vi.mock('../../../src/scene/SceneSignManager', () => ({
    SceneSignManager: {
        get instance() {
            return {
                placeSign: placeSignSpy,
                removeSignById: removeSignByIdSpy,
                clearAll: clearAllSpy,
                dispose: disposeSpy,
            }
        },
    },
    SignStyles: {
        Category: { backgroundColor: 0x1a3a5c, textColor: 0xffffff, fontSize: 0.18, padding: '0.10 0.18' },
    },
}))

import { ShelfSectionPlanner } from '../../../src/scene/ShelfSectionPlanner'

const FAR_POSITION = new THREE.Vector3(10, 0, -20)

function makeGame(appid = 1): SteamGameData {
    return {
        appid,
        name: `Game ${appid}`,
        playtime_forever: 60,
        rtime_last_played: 0,
        img_icon_url: '',
        img_logo_url: '',
    } as SteamGameData
}

function makeSection(name: string, gameCount = 18): Section {
    return {
        name,
        games: Array.from({ length: gameCount }, (_, i) => makeGame(i + 1)),
        groupMode: 'by-recency',
        sortMode: 'by-last-played',
    }
}

function emitSectionsReady(sections: Section[]): void {
    EventManager.getInstance().emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
        sections,
        groupMode: 'by-recency',
        sortMode: 'by-last-played',
    })
}

function emitShelfReady(shelfIndex: number, position = FAR_POSITION, rotationY = 0, sectionIndex = 0): void {
    EventManager.getInstance().emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
        shelfIndex,
        sectionIndex,
        position,
        rotationY,
    })
}

function emitShelfLayoutDetermined(): void {
    EventManager.getInstance().emit<ShelfLayoutDeterminedEvent>(GameEventTypes.ShelfLayoutDetermined, {
        shelfBounds: { minX: -10, maxX: 10, minZ: -20, maxZ: -2 },
        shelfLayout: { rows: 1 },
        stockStrategy: { order: (boards: any[]) => boards } as any,
    })
}

function emitLibraryReloadRequest(): void {
    EventManager.getInstance().emit(StorePropsEventTypes.LibraryReloadRequest, {})
}

describe('ShelfSectionPlanner — sign placement from SectionsReady', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        vi.clearAllMocks()
    })

    it('places a sign for each named section when shelf positions are known', () => {
        new ShelfSectionPlanner()
        emitShelfReady(0, FAR_POSITION, 0, 0)
        emitShelfReady(1, new THREE.Vector3(5, 0, -20), 0, 1)

        emitSectionsReady([
            makeSection('Played Today'),
            makeSection('Played This Week'),
        ])
        emitShelfLayoutDetermined()

        const placedIds = placeSignSpy.mock.calls.map(([, d]) => d.uniqueIdentifier)
        expect(placedIds).toContain('Played Today::start')
        expect(placedIds).toContain('Played This Week::start')
    })

    it('does not place a sign for unnamed (empty name) sections', () => {
        new ShelfSectionPlanner()
        emitShelfReady(0, FAR_POSITION)

        emitSectionsReady([makeSection('')])

        expect(placeSignSpy).not.toHaveBeenCalled()
    })

    it('does not place a sign for "Other" sections', () => {
        new ShelfSectionPlanner()
        emitShelfReady(0, FAR_POSITION)

        emitSectionsReady([makeSection('Other')])

        expect(placeSignSpy).not.toHaveBeenCalled()
    })

    it('clears previous signs before placing new ones on re-sort', () => {
        new ShelfSectionPlanner()
        emitShelfReady(0, FAR_POSITION, 0, 0)
        emitShelfReady(1, new THREE.Vector3(5, 0, -20), 0, 1)

        emitSectionsReady([makeSection('Action'), makeSection('RPG')])
        emitShelfLayoutDetermined()
        vi.clearAllMocks()

        emitSectionsReady([makeSection('Played Today')])
        emitShelfLayoutDetermined()
        expect(removeSignByIdSpy).toHaveBeenCalledWith('Action::start')
        expect(removeSignByIdSpy).toHaveBeenCalledWith('RPG::start')
        expect(placeSignSpy).toHaveBeenCalledWith('canvas', expect.objectContaining({
            uniqueIdentifier: 'Played Today::start',
        }))
    })

    it('anchors sections to shelf ownership, not just shelf index order', () => {
        new ShelfSectionPlanner()
        const pos0 = new THREE.Vector3(0, 0, -5)
        const pos1 = new THREE.Vector3(5, 0, -5)
        emitShelfReady(0, pos0, 0, 1) // shelf 0 owned by section index 1
        emitShelfReady(1, pos1, 0, 0) // shelf 1 owned by section index 0

        emitSectionsReady([makeSection('First', 18), makeSection('Second', 18)])
        emitShelfLayoutDetermined()

        const firstCall = placeSignSpy.mock.calls.find(([, d]) => d.uniqueIdentifier === 'First::start')
        const secondCall = placeSignSpy.mock.calls.find(([, d]) => d.uniqueIdentifier === 'Second::start')
        expect(firstCall).toBeDefined()
        expect(secondCall).toBeDefined()
        // First section (index 0) anchors to shelf with sectionIndex=0 => shelf 1
        expect(firstCall[1].anchorPosition).toEqual(pos1)
        // Second section (index 1) anchors to shelf with sectionIndex=1 => shelf 0
        expect(secondCall[1].anchorPosition).toEqual(pos0)
    })

    it('anchors sections to shelf positions in order', () => {
        new ShelfSectionPlanner()
        const pos0 = new THREE.Vector3(0, 0, -5)
        const pos1 = new THREE.Vector3(5, 0, -5)
        emitShelfReady(0, pos0, 0, 0)
        emitShelfReady(1, pos1, 0, 1)

        emitSectionsReady([makeSection('First', 18), makeSection('Second', 18)])
        emitShelfLayoutDetermined()

        const firstCall = placeSignSpy.mock.calls.find(([, d]) => d.uniqueIdentifier === 'First::start')
        const secondCall = placeSignSpy.mock.calls.find(([, d]) => d.uniqueIdentifier === 'Second::start')
        expect(firstCall).toBeDefined()
        expect(secondCall).toBeDefined()
        // First section anchors at shelf 0
        expect(firstCall[1].anchorPosition).toEqual(pos0)
        // Second section anchors at shelf 1
        expect(secondCall[1].anchorPosition).toEqual(pos1)
    })

    it('clears signs and anchor caches on setup request', () => {
        new ShelfSectionPlanner()
        emitShelfReady(0, FAR_POSITION)
        emitSectionsReady([makeSection('Action')])
        emitShelfLayoutDetermined()
        expect(placeSignSpy).toHaveBeenCalledTimes(1)

        EventManager.getInstance().emit(StorePropsEventTypes.SetupRequest, { source: 'system' } as any)
        expect(removeSignByIdSpy).toHaveBeenCalledWith('Action::start')

        vi.clearAllMocks()
        emitSectionsReady([makeSection('Action')])
        expect(placeSignSpy).not.toHaveBeenCalled()
    })

    it('clears signs and caches on library reload request', () => {
        new ShelfSectionPlanner()
        emitShelfReady(0, FAR_POSITION)
        emitSectionsReady([makeSection('Action')])
        emitShelfLayoutDetermined()
        expect(placeSignSpy).toHaveBeenCalledTimes(1)

        emitLibraryReloadRequest()
        expect(removeSignByIdSpy).toHaveBeenCalledWith('Action::start')
    })

    it('places signs when ShelfLayoutDetermined arrives after SectionsReady', () => {
        new ShelfSectionPlanner()
        emitSectionsReady([makeSection('Action')])

        emitShelfReady(0, FAR_POSITION, 0, 0)
        emitShelfLayoutDetermined()

        expect(placeSignSpy).toHaveBeenCalledWith('canvas', expect.objectContaining({
            uniqueIdentifier: 'Action::start',
        }))
    })

    it('uses fresh shelf anchors after setup request on layout rebuild', () => {
        new ShelfSectionPlanner()

        const oldPosition = new THREE.Vector3(0, 0, -5)
        emitShelfReady(0, oldPosition, 0, 0)
        emitSectionsReady([makeSection('Action')])
        emitShelfLayoutDetermined()
        const firstPlacement = placeSignSpy.mock.calls.find(([, detail]) => detail.uniqueIdentifier === 'Action::start')
        expect(firstPlacement?.[1].anchorPosition).toEqual(oldPosition)

        EventManager.getInstance().emit(StorePropsEventTypes.SetupRequest, { source: 'system' } as any)

        const newPosition = new THREE.Vector3(20, 0, -12)
        emitShelfReady(0, newPosition, 0, 0)
        emitSectionsReady([makeSection('Action')])
        emitShelfLayoutDetermined()

        const latestPlacement = placeSignSpy.mock.calls.filter(([, detail]) => detail.uniqueIdentifier === 'Action::start').at(-1)
        expect(latestPlacement?.[1].anchorPosition).toEqual(newPosition)
    })

    it('does not throw if SectionsReady fires before any ShelfReady', () => {
        new ShelfSectionPlanner()
        expect(() => {
            emitSectionsReady([makeSection('Action')])
        }).not.toThrow()
        expect(placeSignSpy).not.toHaveBeenCalled()
    })
})
