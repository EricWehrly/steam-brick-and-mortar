import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
    buildShelfGeometryTemplates,
    buildShelfUnitTemplate,
    computeShelfLayout,
    ShelfGeometryType,
} from '../../../../src/scene/instancing/ShelfGeometryBuilder'
import { DEFAULT_SHELF_CONFIG, type ShelfConfig } from '../../../../src/scene/props/SharedPropsUtils'

describe('ShelfGeometryBuilder', () => {
    describe('buildShelfGeometryTemplates', () => {
        it('returns all four geometry types as THREE.BufferGeometry', () => {
            const config = DEFAULT_SHELF_CONFIG as Required<ShelfConfig>
            const templates = buildShelfGeometryTemplates(config)

            expect(templates[ShelfGeometryType.AngledBoard]).toBeInstanceOf(THREE.BufferGeometry)
            expect(templates[ShelfGeometryType.SideBoard]).toBeInstanceOf(THREE.BufferGeometry)
            expect(templates[ShelfGeometryType.ShelfBoard]).toBeInstanceOf(THREE.BufferGeometry)
            expect(templates[ShelfGeometryType.InteriorSurface]).toBeInstanceOf(THREE.BufferGeometry)

            // Basic dimension checks (just to ensure it passed the config through)
            const sideBoard = templates[ShelfGeometryType.SideBoard] as THREE.BoxGeometry
            expect(sideBoard.parameters.width).toBe(config.boardThickness)
            expect(sideBoard.parameters.height).toBe(config.height)
            expect(sideBoard.parameters.depth).toBe(config.depth)
        })
    })

    describe('buildShelfUnitTemplate', () => {
        it('returns correct part count and distribution', () => {
            const config = DEFAULT_SHELF_CONFIG as Required<ShelfConfig>
            const { shelfYPositions, shelfDepthsAndOffsets } = computeShelfLayout(config)

            const template = buildShelfUnitTemplate(config, shelfYPositions, shelfDepthsAndOffsets)

            // 2 angled boards (front/back)
            // 2 side boards (left/right)
            // config.shelfCount shelf boards
            // config.shelfCount interior surfaces
            const expectedCount = 2 + 2 + config.shelfCount * 2
            expect(template).toHaveLength(expectedCount)

            const types = template.map(t => t.type)
            expect(types.filter(t => t === ShelfGeometryType.AngledBoard)).toHaveLength(2)
            expect(types.filter(t => t === ShelfGeometryType.SideBoard)).toHaveLength(2)
            expect(types.filter(t => t === ShelfGeometryType.ShelfBoard)).toHaveLength(config.shelfCount)
            expect(types.filter(t => t === ShelfGeometryType.InteriorSurface)).toHaveLength(config.shelfCount)
        })

        it('assigns custom attributes for dynamic scaling and rotation', () => {
            const config = DEFAULT_SHELF_CONFIG as Required<ShelfConfig>
            const { shelfYPositions, shelfDepthsAndOffsets } = computeShelfLayout(config)

            const template = buildShelfUnitTemplate(config, shelfYPositions, shelfDepthsAndOffsets)

            const angledBoards = template.filter(t => t.type === ShelfGeometryType.AngledBoard)
            expect(angledBoards[0].customAttributes![0].name).toBe('rotationAngle')
            expect(angledBoards[1].customAttributes![0].name).toBe('rotationAngle')

            const shelfBoards = template.filter(t => t.type === ShelfGeometryType.ShelfBoard)
            expect(shelfBoards[0].customAttributes![0].name).toBe('shelfScale')
            expect(shelfBoards[0].customAttributes![0].value).toBeInstanceOf(Array)
            expect(shelfBoards[0].customAttributes![0].value).toHaveLength(2)
        })

        it('flags sideboards appropriately', () => {
            const config = DEFAULT_SHELF_CONFIG as Required<ShelfConfig>
            const { shelfYPositions, shelfDepthsAndOffsets } = computeShelfLayout(config)

            const template = buildShelfUnitTemplate(config, shelfYPositions, shelfDepthsAndOffsets)
            const sideBoards = template.filter(t => t.type === ShelfGeometryType.SideBoard)

            expect(sideBoards).toHaveLength(2)
            expect(sideBoards[0].isSideBoard).toBe(true)
            expect(sideBoards[0].sideboardIsLeft).toBe(true)
            expect(sideBoards[1].isSideBoard).toBe(true)
            expect(sideBoards[1].sideboardIsLeft).toBe(false)
        })
    })
})
