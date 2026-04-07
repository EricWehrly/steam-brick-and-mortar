import * as THREE from 'three'
import { ShelfCalculationUtils } from './ShelfCalculations'
import { DEFAULT_SHELF_CONFIG, type ShelfSurface } from './SharedPropsTypes'

export class ShelfSurfaceUtils {
    static findShelfSurfaces(shelfUnit: THREE.Group | null, useHardcodedSurfaces: boolean = false, shelfPosition?: THREE.Vector3): ShelfSurface[] {
        if (useHardcodedSurfaces || !shelfUnit) {
            return ShelfSurfaceUtils.getStandardShelfSurfaces()
        }
        
        return ShelfSurfaceUtils.findDynamicShelfSurfaces(shelfUnit, shelfPosition)
    }
    
    private static getStandardShelfSurfaces(): ShelfSurface[] {
        const config = DEFAULT_SHELF_CONFIG
        const surfaces: ShelfSurface[] = []
        
        const shelfYPositions = ShelfCalculationUtils.calculateAllShelfYPositions({
            height: config.height,
            shelfCount: config.shelfCount,
            shelfVerticalOffset: config.shelfVerticalOffset
        })
        
        shelfYPositions.forEach(shelfY => {
            surfaces.push({
                topY: shelfY + config.boardThickness * 0.55,
                frontZ: -0.5,
                backZ: 0.5,
                centerX: 0,
                width: config.width
            })
        })
        
        // Sort top-to-bottom: partially-filled shelves fill from eye level down
        // TD [shelf-surface-sort]: no unit test for this sort order yet - add when ShelfSurface tests exist
        return surfaces.sort((a, b) => b.topY - a.topY)
    }
    
    private static findDynamicShelfSurfaces(shelfUnit: THREE.Group, shelfPosition?: THREE.Vector3): ShelfSurface[] {
        const surfaces: ShelfSurface[] = []
        
        shelfUnit.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry) {
                const box = new THREE.Box3().setFromObject(child)
                const size = box.getSize(new THREE.Vector3())
                
                if (size.x > 1.5 && size.y < 0.1 && size.z > 0.3) {
                    const relativeTopY = shelfPosition ? box.max.y - shelfPosition.y : box.max.y
                    
                    surfaces.push({
                        topY: relativeTopY,
                        frontZ: box.min.z,
                        backZ: box.max.z,
                        centerX: (box.min.x + box.max.x) / 2,
                        width: size.x
                    })
                }
            }
        })
        
        const uniqueSurfaces = surfaces.filter((surface, index, array) => {
            return index === 0 || Math.abs(surface.topY - array[index - 1].topY) > 0.02
        })
        
        return uniqueSurfaces.sort((a, b) => b.topY - a.topY)
    }
}
