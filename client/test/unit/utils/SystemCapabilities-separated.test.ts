/**
 * Tests for SystemCapabilities separated GPU detection
 * 
 * This test demonstrates the new separated hardware renderer and large texture detection.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { 
    SystemCapabilitiesDetector,
    hasHardwareRenderer,
    supportsLargeTextures,
    hasGoodGPU
} from '../../../src/utils/SystemCapabilities'
import type { SystemCapabilities } from '../../../src/utils/SystemCapabilities'

describe('SystemCapabilities Separated Detection', () => {
    let capabilities: SystemCapabilities

    beforeEach(() => {
        // Force re-detection for consistent testing
        capabilities = SystemCapabilitiesDetector.redetect()
    })

    describe('Hardware Renderer Detection', () => {
        it('should detect hardware renderer separately from texture size', () => {
            const hardwareRenderer = hasHardwareRenderer()
            
            expect(typeof hardwareRenderer).toBe('boolean')
            expect(capabilities.hasHardwareRenderer).toBe(hardwareRenderer)
            
            // Hardware renderer should be based on renderer string, not texture size
            if (capabilities.renderer.toLowerCase().includes('software')) {
                expect(hardwareRenderer).toBe(false)
            }
        })
    })

    describe('Large Texture Support Detection', () => {
        it('should detect large texture support separately from renderer type', () => {
            const largeTextures = supportsLargeTextures()
            
            expect(typeof largeTextures).toBe('boolean')
            expect(capabilities.supportsLargeTextures).toBe(largeTextures)
            
            // Large texture support should be based on maxTextureSize >= 4096
            if (capabilities.maxTextureSize >= 4096) {
                expect(largeTextures).toBe(true)
            } else {
                expect(largeTextures).toBe(false)
            }
        })
    })

    describe('Legacy hasGoodGPU Compatibility', () => {
        it('should maintain backward compatibility with hasGoodGPU', () => {
            const goodGPU = hasGoodGPU()
            const hardwareRenderer = hasHardwareRenderer()
            const largeTextures = supportsLargeTextures()
            
            // hasGoodGPU should be the combination of both new capabilities
            expect(goodGPU).toBe(hardwareRenderer && largeTextures)
            expect(capabilities.hasGoodGPU).toBe(goodGPU)
        })
    })

    describe('Capability Requirements Checking', () => {
        it('should allow checking hardware renderer without large texture requirement', () => {
            const hardwareOnly = SystemCapabilitiesDetector.meetsRequirements({
                hasHardwareRenderer: true
            })
            
            const textureOnly = SystemCapabilitiesDetector.meetsRequirements({
                supportsLargeTextures: true
            })
            
            const both = SystemCapabilitiesDetector.meetsRequirements({
                hasHardwareRenderer: true,
                supportsLargeTextures: true
            })
            
            // These should be independent checks
            expect(typeof hardwareOnly).toBe('boolean')
            expect(typeof textureOnly).toBe('boolean')
            expect(typeof both).toBe('boolean')
            
            // If system has both, all checks should pass
            if (capabilities.hasHardwareRenderer && capabilities.supportsLargeTextures) {
                expect(hardwareOnly).toBe(true)
                expect(textureOnly).toBe(true)
                expect(both).toBe(true)
            }
        })
    })

    describe('Capability Interface Completeness', () => {
        it('should include all expected properties', () => {
            expect(capabilities).toHaveProperty('hasWebGL2')
            expect(capabilities).toHaveProperty('hasInstancedArrays')
            expect(capabilities).toHaveProperty('hasHardwareRenderer')
            expect(capabilities).toHaveProperty('supportsLargeTextures')
            expect(capabilities).toHaveProperty('hasGoodGPU')
            expect(capabilities).toHaveProperty('maxTextureSize')
            expect(capabilities).toHaveProperty('renderer')
            
            // All should have appropriate types
            expect(typeof capabilities.hasWebGL2).toBe('boolean')
            expect(typeof capabilities.hasInstancedArrays).toBe('boolean')
            expect(typeof capabilities.hasHardwareRenderer).toBe('boolean')
            expect(typeof capabilities.supportsLargeTextures).toBe('boolean')
            expect(typeof capabilities.hasGoodGPU).toBe('boolean')
            expect(typeof capabilities.maxTextureSize).toBe('number')
            expect(typeof capabilities.renderer).toBe('string')
        })
    })
})