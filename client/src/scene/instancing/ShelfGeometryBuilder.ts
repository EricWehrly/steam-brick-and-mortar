/**
 * ShelfGeometryBuilder
 *
 * Pure functions for building shelf geometry templates and shelf unit part templates.
 * Extracted from InstancedShelfRenderer for testability and separation of concerns.
 */

import * as THREE from 'three'
import { ShelfCalculationUtils, type ShelfConfig } from '../props/SharedPropsUtils'

// ─── Geometry types ────────────────────────────────────────────────────────────

export enum ShelfGeometryType {
    AngledBoard = 'angledBoard',
    SideBoard = 'sideBoard',
    ShelfBoard = 'shelfBoard',
    InteriorSurface = 'interior'
}

export interface ShelfPartTemplate {
    type: ShelfGeometryType
    offset: THREE.Vector3
    rotation?: THREE.Quaternion
    scale?: THREE.Vector3
    customAttributes?: { name: string; value: number | number[] }[]
    isSideBoard?: boolean
    sideboardIsLeft?: boolean
}

// ─── Builder functions ─────────────────────────────────────────────────────────

/**
 * Build one BufferGeometry per ShelfGeometryType using the given shelf config.
 */
export function buildShelfGeometryTemplates(
    config: Required<ShelfConfig>
): Record<ShelfGeometryType, THREE.BufferGeometry> {
    const { width, height, depth, boardThickness } = config

    return {
        [ShelfGeometryType.AngledBoard]: new THREE.BoxGeometry(width, height, boardThickness),
        [ShelfGeometryType.SideBoard]: new THREE.BoxGeometry(boardThickness, height, depth),
        [ShelfGeometryType.ShelfBoard]: new THREE.BoxGeometry(width, boardThickness, depth),
        [ShelfGeometryType.InteriorSurface]: new THREE.BoxGeometry(
            width * 0.98,
            boardThickness * 0.1,
            depth * 0.98
        ),
    }
}

/**
 * Build the per-shelf-unit part template (stamp pattern used when placing each shelf).
 * This is computed once and reused for every shelf unit position.
 */
export function buildShelfUnitTemplate(
    config: Required<ShelfConfig>,
    shelfYPositions: number[],
    shelfDepthsAndOffsets: Array<{ shelfDepth: number; forwardOffset: number }>
): ShelfPartTemplate[] {
    const angleRad = (config.angle * Math.PI) / 180
    const boardSeparation = config.depth * 0.8

    const template: ShelfPartTemplate[] = []

    // Angled boards (front and back)
    template.push({
        type: ShelfGeometryType.AngledBoard,
        offset: new THREE.Vector3(0, config.height / 2, boardSeparation / 2),
        rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(-angleRad, 0, 0)),
        customAttributes: [{ name: 'rotationAngle', value: -config.angle }]
    })

    template.push({
        type: ShelfGeometryType.AngledBoard,
        offset: new THREE.Vector3(0, config.height / 2, -boardSeparation / 2),
        rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(angleRad, 0, 0)),
        customAttributes: [{ name: 'rotationAngle', value: config.angle }]
    })

    // Side boards (left and right)
    template.push({
        type: ShelfGeometryType.SideBoard,
        offset: new THREE.Vector3(-config.width / 2 - config.boardThickness * 0.5, config.height / 2, 0),
        isSideBoard: true,
        sideboardIsLeft: true
    })

    template.push({
        type: ShelfGeometryType.SideBoard,
        offset: new THREE.Vector3(config.width / 2 + config.boardThickness * 0.5, config.height / 2, 0),
        isSideBoard: true,
        sideboardIsLeft: false
    })

    // Horizontal shelves and interior surfaces
    for (let i = 0; i < config.shelfCount; i++) {
        const shelfY = shelfYPositions[i]
        const widthAtHeight = config.width - 2 * (config.height - shelfY) * Math.tan(angleRad)
        const { shelfDepth, forwardOffset } = shelfDepthsAndOffsets[i]

        const widthScale = widthAtHeight / config.width
        const depthScale = shelfDepth / config.depth

        // Shelf board
        template.push({
            type: ShelfGeometryType.ShelfBoard,
            offset: new THREE.Vector3(0, shelfY, forwardOffset),
            scale: new THREE.Vector3(widthScale, 1, depthScale),
            customAttributes: [{ name: 'shelfScale', value: [widthScale, depthScale] }]
        })

        // Interior surface
        template.push({
            type: ShelfGeometryType.InteriorSurface,
            offset: new THREE.Vector3(0, shelfY + config.boardThickness * 0.55, forwardOffset),
            scale: new THREE.Vector3(widthScale, 1, depthScale),
            customAttributes: [{ name: 'surfaceScale', value: [widthScale, depthScale] }]
        })
    }

    return template
}

/**
 * Convenience: compute shelfYPositions and shelfDepthsAndOffsets from a config.
 * Matches the logic in InstancedShelfRenderer constructor.
 */
export function computeShelfLayout(config: Required<ShelfConfig>): {
    shelfYPositions: number[]
    shelfDepthsAndOffsets: Array<{ shelfDepth: number; forwardOffset: number }>
} {
    const shelfYPositions = ShelfCalculationUtils.calculateAllShelfYPositions({
        height: config.height,
        shelfCount: config.shelfCount,
        shelfVerticalOffset: config.shelfVerticalOffset,
    })

    const shelfDepthsAndOffsets: Array<{ shelfDepth: number; forwardOffset: number }> = []
    for (let i = 0; i < config.shelfCount; i++) {
        shelfDepthsAndOffsets.push(
            ShelfCalculationUtils.calculateShelfDepthAndOffset(i, {
                depth: config.depth,
                boardThickness: config.boardThickness,
                shelfCount: config.shelfCount,
                shelfExtensionPerLevel: config.shelfExtensionPerLevel,
            })
        )
    }

    return { shelfYPositions, shelfDepthsAndOffsets }
}
