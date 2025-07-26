/**
 * Material Utilities - PBR Material Creation and Management
 * 
 * Provides standardized PBR materials for the Blockbuster environment
 * Upgrade from MeshPhongMaterial to MeshStandardMaterial for better visuals
 */

import * as THREE from 'three'
import { BlockbusterColors } from './Colors'

export interface PBRMaterialOptions {
    color?: number | THREE.Color
    roughness?: number
    metalness?: number
    emissive?: number | THREE.Color
    emissiveIntensity?: number
}

export class MaterialUtils {
    /**
     * Create a standard PBR material with Blockbuster-appropriate settings
     */
    static createPBRMaterial(options: PBRMaterialOptions = {}): THREE.MeshStandardMaterial {
        return new THREE.MeshStandardMaterial({
            color: options.color ?? 0x808080,
            roughness: options.roughness ?? 0.8,
            metalness: options.metalness ?? 0.1,
            emissive: options.emissive ?? 0x000000,
            emissiveIntensity: options.emissiveIntensity ?? 0,
        })
    }

    /**
     * Create game box materials with varied colors (PBR version)
     */
    static createGameBoxMaterials(): THREE.MeshStandardMaterial[] {
        const colors = [
            0x4a90e2, // Blue
            0xe74c3c, // Red
            0x2ecc71, // Green  
            0xf39c12, // Orange
            0x9b59b6, // Purple
            0x1abc9c, // Teal
        ]

        return colors.map(color => 
            MaterialUtils.createPBRMaterial({
                color,
                roughness: 0.7,
                metalness: 0.1,
            })
        )
    }

    /**
     * Create game box material with color from game name (PBR version)
     */
    static createGameBoxMaterialFromName(gameNameHue: number): THREE.MeshStandardMaterial {
        const color = new THREE.Color().setHSL(gameNameHue, 0.7, 0.5)
        return MaterialUtils.createPBRMaterial({
            color,
            roughness: 0.7,
            metalness: 0.1,
        })
    }

    /**
     * Create floor material with carpet-like properties
     */
    static createFloorMaterial(): THREE.MeshStandardMaterial {
        return MaterialUtils.createPBRMaterial({
            color: BlockbusterColors.floor,
            roughness: 0.9, // Very rough for carpet texture
            metalness: 0.0, // No metallic properties for carpet
        })
    }

    /**
     * Create wall material with slight texture
     */
    static createWallMaterial(): THREE.MeshStandardMaterial {
        return MaterialUtils.createPBRMaterial({
            color: BlockbusterColors.walls,
            roughness: 0.8, // Slightly rough for painted walls
            metalness: 0.0, // No metallic properties for painted walls
        })
    }

    /**
     * Create ceiling material
     */
    static createCeilingMaterial(): THREE.MeshStandardMaterial {
        return MaterialUtils.createPBRMaterial({
            color: BlockbusterColors.ceiling,
            roughness: 0.9, // Very rough for popcorn texture
            metalness: 0.0, // No metallic properties
        })
    }

    /**
     * Create shelf wood material
     */
    static createShelfWoodMaterial(): THREE.MeshStandardMaterial {
        return MaterialUtils.createPBRMaterial({
            color: BlockbusterColors.shelfWood,
            roughness: 0.6, // Moderate roughness for wood
            metalness: 0.0, // No metallic properties for wood
        })
    }

    /**
     * Create signage material
     */
    static createSignageMaterial(backgroundColor: number, _textColor: number): THREE.MeshStandardMaterial {
        return MaterialUtils.createPBRMaterial({
            color: backgroundColor,
            roughness: 0.3, // Smoother for signage
            metalness: 0.0,
            emissive: backgroundColor,
            emissiveIntensity: 0.1, // Slight glow for signage
        })
    }
}
