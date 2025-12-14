/**
 * System Capabilities Detection
 * 
 * Simple utilities for detecting system capabilities that handlers can use
 * to decide whether to register as replacement handlers.
 * 
 * Used by handlers for self-registration logic, NOT by the event system.
 */

import { Logger } from '../utils/Logger'

export interface SystemCapabilities {
    hasWebGL2: boolean
    hasInstancedArrays: boolean
    hasHardwareRenderer: boolean
    supportsLargeTextures: boolean
    hasGoodGPU: boolean // Deprecated: use hasHardwareRenderer && supportsLargeTextures
    maxTextureSize: number
    renderer: string
    // TODO: Add more capabilities as needed:
    // TODO: - hasVertexArrayObjects: boolean
    // TODO: - hasFloatTextures: boolean  
    // TODO: - maxDrawBuffers: number
    // TODO: - hasVR: boolean
}

export class SystemCapabilitiesDetector {
    private static readonly logger = Logger.createLogFunctions(SystemCapabilitiesDetector.name)
    private static cachedCapabilities: SystemCapabilities | null = null
    
    /**
     * Detect system capabilities (cached after first call)
     */
    public static detect(): SystemCapabilities {
        if (SystemCapabilitiesDetector.cachedCapabilities) {
            return SystemCapabilitiesDetector.cachedCapabilities
        }
        
        const capabilities = SystemCapabilitiesDetector.detectCapabilities()
        SystemCapabilitiesDetector.cachedCapabilities = capabilities
        
        SystemCapabilitiesDetector.logger.info('System capabilities detected:', capabilities)
        return capabilities
    }
    
    /**
     * Force re-detection of capabilities (for testing or dynamic changes)
     */
    public static redetect(): SystemCapabilities {
        SystemCapabilitiesDetector.cachedCapabilities = null
        return SystemCapabilitiesDetector.detect()
    }
    
    private static detectCapabilities(): SystemCapabilities {
        // Create a test canvas to check WebGL capabilities
        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl2')
        const gl1 = canvas.getContext('webgl')
        
        const hasWebGL2 = !!gl
        const hasInstancedArrays = hasWebGL2 || !!(gl1 && gl1.getExtension('ANGLE_instanced_arrays'))
        
        let maxTextureSize = 0
        let renderer = 'unknown'
        let hasHardwareRenderer = false
        let supportsLargeTextures = false
        let hasGoodGPU = false
        
        if (gl || gl1) {
            const context = gl || gl1
            maxTextureSize = context.getParameter(context.MAX_TEXTURE_SIZE)
            
            // Get renderer info if available
            const debugInfo = context.getExtension('WEBGL_debug_renderer_info')
            if (debugInfo) {
                renderer = context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown'
            }
            
            // Separate hardware and texture size detection
            hasHardwareRenderer = !renderer.toLowerCase().includes('software')
            supportsLargeTextures = maxTextureSize >= 4096
            
            // Legacy compatibility: "good GPU" means both hardware renderer and large textures
            hasGoodGPU = hasHardwareRenderer && supportsLargeTextures
        }
        
        // Clean up test canvas
        canvas.remove()
        
        return {
            hasWebGL2,
            hasInstancedArrays,
            hasHardwareRenderer,
            supportsLargeTextures,
            hasGoodGPU,
            maxTextureSize,
            renderer
        }
    }
    
    /**
     * Check if system meets specific capability requirements
     */
    public static meetsRequirements(requirements: Partial<SystemCapabilities>): boolean {
        const capabilities = SystemCapabilitiesDetector.detect()
        
        for (const [key, requiredValue] of Object.entries(requirements)) {
            const actualValue = capabilities[key as keyof SystemCapabilities]
            
            if (typeof requiredValue === 'boolean' && actualValue !== requiredValue) {
                return false
            }
            
            if (typeof requiredValue === 'number' && (actualValue as number) < requiredValue) {
                return false
            }
        }
        
        return true
    }
}

// Convenience functions for common capability checks
export const hasWebGL2 = (): boolean => SystemCapabilitiesDetector.detect().hasWebGL2
export const hasInstancedArrays = (): boolean => SystemCapabilitiesDetector.detect().hasInstancedArrays
export const hasHardwareRenderer = (): boolean => SystemCapabilitiesDetector.detect().hasHardwareRenderer
export const supportsLargeTextures = (): boolean => SystemCapabilitiesDetector.detect().supportsLargeTextures
export const hasGoodGPU = (): boolean => SystemCapabilitiesDetector.detect().hasGoodGPU

// Export the detection function for convenience
export const detectSystemCapabilities = SystemCapabilitiesDetector.detect