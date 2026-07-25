import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
    buildPosterFrame,
    pickPosterSizePreset,
    FRAME_DEPTH_METERS,
    FRAME_OUTER_WIDTH_METERS,
} from '../../../../../src/scene/props/wall-art/PosterFrameBuilder'

function fakeTexture(width: number, height: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return new THREE.CanvasTexture(canvas)
}

function findImagePlane(group: THREE.Group): THREE.Mesh {
    const image = group.children.find(
        child => child instanceof THREE.Mesh && (child.material as THREE.MeshStandardMaterial).map
    )
    if (!image) throw new Error('image plane not found in built frame group')
    return image as THREE.Mesh
}

describe('pickPosterSizePreset', () => {
    it('picks widescreen for a 16:10 desktop-capture aspect', () => {
        expect(pickPosterSizePreset(2560 / 1600).name).toBe('widescreen')
    })

    it('picks standard for an aspect closer to 4:3 than to 16:10', () => {
        expect(pickPosterSizePreset(4 / 3).name).toBe('standard')
    })

    it('picks standard for a portrait aspect (nearer 4:3 than 16:10 by log-ratio)', () => {
        expect(pickPosterSizePreset(0.75).name).toBe('standard')
    })
})

describe('buildPosterFrame', () => {
    it('builds a molding border, mat board, and image plane', () => {
        const group = buildPosterFrame(fakeTexture(1600, 1000))
        expect(group.children).toHaveLength(6)
    })

    it('spans the fixed outer width and the nearest preset\'s derived height', () => {
        const group = buildPosterFrame(fakeTexture(1600, 1000)) // aspect 1.6 -> widescreen
        group.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(group)
        const size = box.getSize(new THREE.Vector3())

        expect(size.x).toBeCloseTo(FRAME_OUTER_WIDTH_METERS)
        expect(size.y).toBeCloseTo(FRAME_OUTER_WIDTH_METERS / (16 / 10))
        expect(size.z).toBeCloseTo(FRAME_DEPTH_METERS)
    })

    it('fills the aperture with no letterboxing when the image exactly matches its preset', () => {
        const group = buildPosterFrame(fakeTexture(2560, 1600)) // exactly 16:10
        const image = findImagePlane(group)
        const params = (image.geometry as THREE.PlaneGeometry).parameters

        expect(params.width).toBeCloseTo(2.376) // FRAME_OUTER_WIDTH_METERS * (1 - 2*0.06)
        expect(params.height).toBeCloseTo(2.376 / (16 / 10))
    })

    it('contain-fits a portrait image inside the standard preset without upscaling', () => {
        const group = buildPosterFrame(fakeTexture(600, 800)) // aspect 0.75 -> standard
        const image = findImagePlane(group)
        const params = (image.geometry as THREE.PlaneGeometry).parameters

        expect(params.width).toBeCloseTo(1.3365)
        expect(params.height).toBeCloseTo(1.782)
    })
})
