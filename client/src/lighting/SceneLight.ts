import type * as THREE from 'three'

export interface SceneLight {
    readonly id: number
    readonly emissiveMaterials: readonly THREE.MeshStandardMaterial[]
}
