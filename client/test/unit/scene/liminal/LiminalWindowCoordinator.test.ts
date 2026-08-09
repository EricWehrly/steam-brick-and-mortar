import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../../src/core/EventManager'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../../../src/core/data/DataTypes'
import {
    GameEventTypes,
    UIEventTypes,
    GameRenderEventTypes,
    StorePropsEventTypes,
    type PlacementRepointRequestedEvent,
    type ShelfUnitRepositionRequestedEvent,
} from '../../../../src/types/InteractionEvents'
import type { SectionsReadyEvent, SectionsReadyForPlacementEvent, LayoutRequestedEvent } from '../../../../src/types/EnvironmentEvents'
import type { Section } from '../../../../src/types/LayoutTypes'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'
import type { InstanceMetadata } from '../../../../src/debug/GameFinder'
import { LiminalWindowCoordinator } from '../../../../src/scene/liminal/LiminalWindowCoordinator'
import type { MockFn } from '../../../utils/test-types'
import {
    LIMINAL_DEPTH_SLOTS,
    computeUnitTransform,
    CORRIDOR_FIRST_SLOT_OFFSET_Z,
    CORRIDOR_UNIT_SPACING_Z,
} from '../../../../src/scene/liminal/LiminalCorridorLayout'
import { LiminalEventTypes, type BoundaryCrossedEvent, computeSlotIndexForWorldZ } from '../../../../src/scene/liminal/LiminalBoundaryTracker'
import { computeSlotsPerShelf } from '../../../../src/scene/props/shared/StockStrategy'
import { RowStockStrategy } from '../../../../src/scene/props/shared/RowLayoutUtils'
import { DEFAULT_SHELF_CONFIG } from '../../../../src/scene/props/shared/SharedPropsTypes'

const SLOTS_PER_UNIT = computeSlotsPerShelf(new RowStockStrategy(), DEFAULT_SHELF_CONFIG.shelfCount)
const EXPECTED_WINDOW_SIZE = LIMINAL_DEPTH_SLOTS * 2 * SLOTS_PER_UNIT

function makeGames(count: number): SteamGameData[] {
    return Array.from({ length: count }, (_, i) => ({
        appid: i + 1,
        name: `Game ${i + 1}`,
        playtime_forever: 0,
        rtime_last_played: 0,
        img_icon_url: '',
        img_logo_url: '',
    } as SteamGameData))
}

function makeSections(gameCount: number, sectionCount: number): Section[] {
    const games = makeGames(gameCount)
    const perSection = Math.ceil(gameCount / sectionCount)
    return Array.from({ length: sectionCount }, (_, i) => ({
        name: `Section ${i}`,
        games: games.slice(i * perSection, (i + 1) * perSection),
        groupMode: 'by-genre' as const,
        sortMode: 'by-playtime' as const,
    }))
}

function emitLayoutRequested(layoutMode: string): void {
    EventManager.getInstance().emit<LayoutRequestedEvent>(UIEventTypes.LayoutRequested, { layoutMode: layoutMode as any })
}

function emitSectionsReady(sections: Section[]): void {
    EventManager.getInstance().emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
        sections,
        groupMode: 'by-genre',
        sortMode: 'by-playtime',
    })
}

function emitSectionsReadyForPlacement(sections: Section[]): void {
    EventManager.getInstance().emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, {
        groupMode: 'by-genre',
        sortMode: 'by-playtime',
        sections: sections.map((section, sectionIndex) => ({
            sectionId: `s${sectionIndex}`,
            sectionIndex,
            section,
        })),
    })
}

describe('LiminalWindowCoordinator', () => {
    let coordinator: LiminalWindowCoordinator
    let sectionsReadySpy: MockFn<[SectionsReadyEvent], void>
    let sectionsReadyForPlacementSpy: MockFn<[SectionsReadyForPlacementEvent], void>

    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()

        // No camera by default: alignWindowToPlayer() no-ops without one, keeping
        // existing tests' reposition/repoint counts unaffected by the player-centering
        // correction — tests that exercise it set a real camera explicitly.
        DataManager.getInstance().set(DataKey.MainCamera, undefined as unknown as THREE.Camera, { domain: DataDomain.Scene })

        // Construct the coordinator first, then register spies — matches production
        // registration order (this class is constructed before ShelfLayoutCoordinator/
        // GameBoxSpawner during bootstrap), which is what makes interception work.
        coordinator = new LiminalWindowCoordinator()

        sectionsReadySpy = vi.fn()
        sectionsReadyForPlacementSpy = vi.fn()
        EventManager.getInstance().registerEventHandler<SectionsReadyEvent>(
            GameEventTypes.SectionsReady,
            (e) => sectionsReadySpy(e.detail)
        )
        EventManager.getInstance().registerEventHandler<SectionsReadyForPlacementEvent>(
            GameEventTypes.SectionsReadyForPlacement,
            (e) => sectionsReadyForPlacementSpy(e.detail)
        )
    })

    it('passes SectionsReady through unmodified when liminal is not active', () => {
        emitLayoutRequested('row')
        const sections = makeSections(50, 3)
        emitSectionsReady(sections)

        expect(sectionsReadySpy).toHaveBeenCalledTimes(1)
        expect(sectionsReadySpy.mock.calls[0][0].sections).toBe(sections)
    })

    it('replaces SectionsReady with a single windowed section when liminal is active', () => {
        emitLayoutRequested('liminal')
        const sections = makeSections(500, 10)
        emitSectionsReadyForPlacement(sections)
        emitSectionsReady(sections)

        expect(sectionsReadySpy).toHaveBeenCalledTimes(1)
        const detail: SectionsReadyEvent = sectionsReadySpy.mock.calls[0][0]
        expect(detail.sections).toHaveLength(1)
        expect(detail.sections[0].games).toHaveLength(EXPECTED_WINDOW_SIZE)
    })

    it('replaces SectionsReadyForPlacement with a single windowed section when liminal is active', () => {
        emitLayoutRequested('liminal')
        emitSectionsReadyForPlacement(makeSections(500, 10))

        expect(sectionsReadyForPlacementSpy).toHaveBeenCalledTimes(1)
        const detail: SectionsReadyForPlacementEvent = sectionsReadyForPlacementSpy.mock.calls[0][0]
        expect(detail.sections).toHaveLength(1)
        expect(detail.sections[0].section.games).toHaveLength(EXPECTED_WINDOW_SIZE)
    })

    it('produces exactly the window size regardless of library size, including libraries smaller than the window', () => {
        emitLayoutRequested('liminal')
        const sections = makeSections(5, 1)
        emitSectionsReadyForPlacement(sections)
        emitSectionsReady(sections)

        const detail: SectionsReadyEvent = sectionsReadySpy.mock.calls[0][0]
        expect(detail.sections[0].games).toHaveLength(EXPECTED_WINDOW_SIZE)
    })

    it('reseeds the window from a fresh sequence on the next SectionsReady (resort/filter change)', () => {
        emitLayoutRequested('liminal')
        const firstSections = makeSections(500, 10)
        emitSectionsReadyForPlacement(firstSections)
        emitSectionsReady(firstSections)
        const first: SectionsReadyEvent = sectionsReadySpy.mock.calls[0][0]
        // Library >= window size: no wraparound, every game in the window is unique.
        expect(new Set(first.sections[0].games.map(g => g.appid)).size).toBe(EXPECTED_WINDOW_SIZE)

        const secondSections = makeSections(30, 2)
        emitSectionsReadyForPlacement(secondSections)
        emitSectionsReady(secondSections)
        const second: SectionsReadyEvent = sectionsReadySpy.mock.calls[1][0]
        const appids = second.sections[0].games.map(g => g.appid)
        expect(appids).toHaveLength(EXPECTED_WINDOW_SIZE)
        // Smaller library than the window: the ring wraps, so the sequence repeats every 30 games.
        expect(appids[30]).toBe(appids[0])
        expect(new Set(appids).size).toBe(30)
    })

    it('stops reacting to SectionsReady once layout switches away from liminal', () => {
        emitLayoutRequested('liminal')
        const initialSections = makeSections(500, 10)
        emitSectionsReadyForPlacement(initialSections)
        emitSectionsReady(initialSections)
        expect(sectionsReadySpy.mock.calls[0][0].sections).toHaveLength(1)

        emitLayoutRequested('arc')
        const sections = makeSections(50, 3)
        emitSectionsReady(sections)

        expect(sectionsReadySpy).toHaveBeenCalledTimes(2)
        expect(sectionsReadySpy.mock.calls[1][0].sections).toBe(sections)
    })

    // Story 1 of docs/plans/liminal-shelf-signs-plan.md: section identity must survive the
    // flatten into the ring, or a later consumer (the shelf-sign planner) shows the wrong
    // category. ringEntries is private and has no public event yet (that's Story 2), so this
    // reaches into the instance directly — same pattern already used elsewhere in this suite
    // for coordinator-internal state.
    describe('RingEntry section identity (Story 1 — thread section identity through the ring)', () => {
        it('pairs each windowed game with the section name it actually came from, including uneven section sizes', () => {
            emitLayoutRequested('liminal')
            // perSection = ceil(25/3) = 9 -> Section 0: appids 1-9, Section 1: appids 10-18,
            // Section 2: appids 19-25 (only 7 games — the uneven remainder).
            const sections = makeSections(25, 3)
            emitSectionsReadyForPlacement(sections)

            const ringEntries = (coordinator as unknown as {
                ringEntries: { game: SteamGameData; sectionName: string }[]
            }).ringEntries

            expect(ringEntries).toHaveLength(25)
            expect(ringEntries.map(entry => entry.sectionName)).toEqual([
                ...Array(9).fill('Section 0'),
                ...Array(9).fill('Section 1'),
                ...Array(7).fill('Section 2'),
            ])
            // Spot-check the boundary itself — an off-by-one in the flatMap would show up here first.
            expect(ringEntries[8]).toMatchObject({ sectionName: 'Section 0', game: { appid: 9 } })
            expect(ringEntries[9]).toMatchObject({ sectionName: 'Section 1', game: { appid: 10 } })
        })
    })

    describe('the treadmill (Story 5 — BoundaryCrossed advances the window)', () => {
        function seedShelfMetadata(): void {
            const artwork = new Map<number, InstanceMetadata>()
            for (let shelfIndex = 0; shelfIndex < LIMINAL_DEPTH_SLOTS * 2; shelfIndex++) {
                const unit = Math.floor(shelfIndex / 2)
                const side = shelfIndex % 2 === 0 ? 'left' : 'right'
                const shelfPosition = computeUnitTransform(unit, side).position
                for (let slot = 0; slot < SLOTS_PER_UNIT; slot++) {
                    const instanceIndex = shelfIndex * SLOTS_PER_UNIT + slot
                    artwork.set(instanceIndex, {
                        name: `seed-${instanceIndex}`,
                        appid: 9000 + instanceIndex,
                        position: shelfPosition.clone(),
                    })
                }
            }
            DataManager.getInstance().set(DataKey.InstancedArtworkMetadata, artwork, { domain: DataDomain.Renderer })
            DataManager.getInstance().set(DataKey.InstancedLabelMetadata, new Map(), { domain: DataDomain.Renderer })
        }

        function emitBoundaryCrossed(direction: 'forward' | 'backward'): void {
            EventManager.getInstance().emit<BoundaryCrossedEvent>(LiminalEventTypes.BoundaryCrossed, { direction })
        }

        function seedWindow(gameCount: number): void {
            const sections = makeSections(gameCount, 1)
            emitSectionsReadyForPlacement(sections)
            emitSectionsReady(sections)
        }

        let repositionSpy: MockFn<[ShelfUnitRepositionRequestedEvent], void>
        let repointSpy: MockFn<[PlacementRepointRequestedEvent], void>

        beforeEach(() => {
            repositionSpy = vi.fn()
            repointSpy = vi.fn()
            EventManager.getInstance().registerEventHandler<ShelfUnitRepositionRequestedEvent>(
                StorePropsEventTypes.ShelfUnitRepositionRequested,
                (e) => repositionSpy(e.detail)
            )
            EventManager.getInstance().registerEventHandler<PlacementRepointRequestedEvent>(
                GameRenderEventTypes.PlacementRepointRequested,
                (e) => repointSpy(e.detail)
            )
        })

        it('does nothing if a crossing happens before any seed', () => {
            emitLayoutRequested('liminal')
            emitBoundaryCrossed('forward')
            expect(repositionSpy).not.toHaveBeenCalled()
            expect(repointSpy).not.toHaveBeenCalled()
        })

        it('does nothing while not in liminal mode', () => {
            emitLayoutRequested('liminal')
            seedShelfMetadata()
            seedWindow(200)
            emitLayoutRequested('row')

            emitBoundaryCrossed('forward')
            expect(repositionSpy).not.toHaveBeenCalled()
            expect(repointSpy).not.toHaveBeenCalled()
        })

        it('repositions only the recycled physical unit\'s 2 shelves, to one past the current far edge', () => {
            emitLayoutRequested('liminal')
            seedShelfMetadata()
            seedWindow(200)

            emitBoundaryCrossed('forward')

            expect(repositionSpy).toHaveBeenCalledTimes(2)
            const byShelf = new Map(repositionSpy.mock.calls.map(([detail]) => [detail.shelfIndex, detail]))
            expect([...byShelf.keys()].sort()).toEqual([0, 1])

            const expectedLeft = computeUnitTransform(LIMINAL_DEPTH_SLOTS, 'left')
            const expectedRight = computeUnitTransform(LIMINAL_DEPTH_SLOTS, 'right')
            expect(byShelf.get(0)?.position).toEqual(expectedLeft.position)
            expect(byShelf.get(0)?.rotationY).toBe(expectedLeft.rotationY)
            expect(byShelf.get(1)?.position).toEqual(expectedRight.position)
            expect(byShelf.get(1)?.rotationY).toBe(expectedRight.rotationY)
        })

        it('repoints exactly the recycled unit\'s boxes (2 * slotsPerUnit), not the whole window', () => {
            emitLayoutRequested('liminal')
            seedShelfMetadata()
            seedWindow(200)

            emitBoundaryCrossed('forward')

            expect(repointSpy).toHaveBeenCalledTimes(2 * SLOTS_PER_UNIT)
            const instanceIndices = repointSpy.mock.calls.map(([detail]) => detail.instanceIndex).sort((a, b) => a - b)
            const expectedIndices = Array.from({ length: 2 * SLOTS_PER_UNIT }, (_, i) => i) // shelves 0,1 own instances 0..17
            expect(instanceIndices).toEqual(expectedIndices)
        })

        it('repoints boxes with the new slot\'s games, sourced from the ring at the new rank', () => {
            emitLayoutRequested('liminal')
            seedShelfMetadata()
            seedWindow(200) // appids 1..200, window = appids 1..90

            emitBoundaryCrossed('forward')
            // Recycled unit (rank 0 -> LIMINAL_DEPTH_SLOTS) shows gamesForSlot(LIMINAL_DEPTH_SLOTS):
            // base = LIMINAL_DEPTH_SLOTS * (2 * SLOTS_PER_UNIT), appids continue past the initial window.
            const base = LIMINAL_DEPTH_SLOTS * 2 * SLOTS_PER_UNIT
            const expectedAppids = Array.from({ length: 2 * SLOTS_PER_UNIT }, (_, i) => base + i + 1) // +1: appids are 1-indexed

            const gotAppids = repointSpy.mock.calls
                .map(([detail]) => detail)
                .sort((a, b) => a.instanceIndex - b.instanceIndex)
                .map(detail => detail.appid)

            expect(gotAppids).toEqual(expectedAppids)
        })

        it('preserves each repointed instance\'s classified kind', () => {
            emitLayoutRequested('liminal')
            seedShelfMetadata() // all seeded as 'artwork', label map empty
            seedWindow(200)

            emitBoundaryCrossed('forward')

            repointSpy.mock.calls.forEach(([detail]) => expect(detail.kind).toBe('artwork'))
        })

        it('recycles the physical unit with the lowest rank on a forward crossing', () => {
            emitLayoutRequested('liminal')
            seedShelfMetadata()
            seedWindow(200)

            emitBoundaryCrossed('forward') // recycles unit 0 (shelves 0,1) -> rank 5
            repositionSpy.mockClear()
            repointSpy.mockClear()

            emitBoundaryCrossed('forward') // now unit 1 (shelves 2,3) has the lowest rank (1) -> recycles next

            const shelfIndices = [...new Set(repositionSpy.mock.calls.map(([detail]) => detail.shelfIndex))].sort()
            expect(shelfIndices).toEqual([2, 3])
        })

        it('recycles the physical unit with the highest rank on a backward crossing', () => {
            emitLayoutRequested('liminal')
            seedShelfMetadata()
            seedWindow(200)

            emitBoundaryCrossed('backward') // recycles unit 4 (shelves 8,9), the max rank, to one before the near edge

            const shelfIndices = [...new Set(repositionSpy.mock.calls.map(([detail]) => detail.shelfIndex))].sort()
            expect(shelfIndices).toEqual([8, 9])

            const expectedLeft = computeUnitTransform(-1, 'left')
            const byShelf = new Map(repositionSpy.mock.calls.map(([detail]) => [detail.shelfIndex, detail]))
            expect(byShelf.get(8)?.position).toEqual(expectedLeft.position)
        })

        it('keeps every physical unit\'s rank correct across a burst of crossings bigger than the whole window (2.5x its scope)', () => {
            emitLayoutRequested('liminal')
            seedShelfMetadata()
            seedWindow(200)

            // A single LiminalBoundaryTracker check can resolve many crossings at
            // once (a teleport, a hitch, or just fast movement) — each one calls
            // advance() in turn. This burst is bigger than the resident window's
            // entire depth-slot scope (2.5x it, +1), so every physical unit gets
            // recycled more than twice before the burst ends.
            const crossingCount = Math.ceil(2.5 * LIMINAL_DEPTH_SLOTS) + 1
            for (let i = 0; i < crossingCount; i++) emitBoundaryCrossed('forward')

            expect(repositionSpy).toHaveBeenCalledTimes(crossingCount * 2)

            // Recycling always retargets the current lowest-rank unit to one past
            // the current highest rank — round-robin across the LIMINAL_DEPTH_SLOTS
            // physical units, in order. Derived independently from that rule (not
            // from the coordinator's own bookkeeping) as this test's ground truth.
            const expectedFinalRankByUnit = new Map<number, number>()
            for (let k = 1; k <= crossingCount; k++) {
                const unit = (k - 1) % LIMINAL_DEPTH_SLOTS
                const rank = (LIMINAL_DEPTH_SLOTS - 1) + k
                expectedFinalRankByUnit.set(unit, rank)
            }

            const lastPositionByShelf = new Map<number, THREE.Vector3>()
            repositionSpy.mock.calls.forEach(([detail]) => lastPositionByShelf.set(detail.shelfIndex, detail.position as THREE.Vector3))

            for (const [unit, expectedRank] of expectedFinalRankByUnit) {
                const leftShelfIndex = unit * 2
                const rightShelfIndex = unit * 2 + 1
                expect(lastPositionByShelf.get(leftShelfIndex)).toEqual(computeUnitTransform(expectedRank, 'left').position)
                expect(lastPositionByShelf.get(rightShelfIndex)).toEqual(computeUnitTransform(expectedRank, 'right').position)
            }
        })

        it('emits no repoint events for a shelf with no classified instances (e.g. artwork not yet settled)', () => {
            emitLayoutRequested('liminal')
            // Empty metadata (not just "unset" — DataManager is a real singleton that
            // could still hold a previous test's maps) simulates nothing classified yet.
            DataManager.getInstance().set(DataKey.InstancedArtworkMetadata, new Map(), { domain: DataDomain.Renderer })
            DataManager.getInstance().set(DataKey.InstancedLabelMetadata, new Map(), { domain: DataDomain.Renderer })
            seedWindow(200)

            emitBoundaryCrossed('forward')

            expect(repositionSpy).toHaveBeenCalledTimes(2) // shelves still reposition
            expect(repointSpy).not.toHaveBeenCalled() // nothing to repoint
        })
    })

    describe('alignWindowToPlayer (initial window centers on the player, not always 5 ahead)', () => {
        let repositionSpy: MockFn<[ShelfUnitRepositionRequestedEvent], void>

        beforeEach(() => {
            repositionSpy = vi.fn()
            EventManager.getInstance().registerEventHandler<ShelfUnitRepositionRequestedEvent>(
                StorePropsEventTypes.ShelfUnitRepositionRequested,
                (e) => repositionSpy(e.detail)
            )
        })

        function setCamera(z: number): void {
            const camera = new THREE.PerspectiveCamera()
            camera.position.set(0, 1.6, z)
            DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        }

        it('shifts every unit so the middle unit lands on the player\'s actual slot at spawn (z=0)', () => {
            setCamera(0) // spawn — computeSlotIndexForWorldZ(0) = -2, not the assumed middle rank of 2
            emitLayoutRequested('liminal')
            seedWindowHelper(200)

            const desiredCenterRank = computeSlotIndexForWorldZ(0)
            const middleUnit = Math.floor(LIMINAL_DEPTH_SLOTS / 2)

            // All 5 units (10 shelves) must have repositioned — the whole window shifts together.
            expect(repositionSpy).toHaveBeenCalledTimes(LIMINAL_DEPTH_SLOTS * 2)

            const byShelf = new Map(repositionSpy.mock.calls.map(([detail]) => [detail.shelfIndex, detail]))
            const expectedMiddleLeft = computeUnitTransform(desiredCenterRank, 'left')
            expect(byShelf.get(middleUnit * 2)?.position).toEqual(expectedMiddleLeft.position)
        })

        it('does not reposition anything when the player is already at the assumed center rank', () => {
            // computeSlotWorldZ(2) = -(4.0 + 2*2.6) = -9.2, which maps back to rank 2 exactly —
            // the initial seed's assumed middle-unit rank, so delta === 0.
            setCamera(-(CORRIDOR_FIRST_SLOT_OFFSET_Z + 2 * CORRIDOR_UNIT_SPACING_Z))
            emitLayoutRequested('liminal')
            seedWindowHelper(200)

            expect(repositionSpy).not.toHaveBeenCalled()
        })

        it('does nothing without a camera available in DataManager', () => {
            DataManager.getInstance().set(DataKey.MainCamera, undefined as unknown as THREE.Camera, { domain: DataDomain.Scene })
            emitLayoutRequested('liminal')
            seedWindowHelper(200)

            expect(repositionSpy).not.toHaveBeenCalled()
        })

        function seedWindowHelper(gameCount: number): void {
            const sections = makeSections(gameCount, 1)
            emitSectionsReadyForPlacement(sections)
            emitSectionsReady(sections)
        }
    })
})
