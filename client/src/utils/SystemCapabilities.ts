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
    /** True when KHR_parallel_shader_compile is available — compileAsync() is non-blocking */
    hasParallelShaderCompile: boolean
    // TODO: Add more capabilities as needed:
    // TODO: - hasVertexArrayObjects: boolean
    // TODO: - hasFloatTextures: boolean  
    // TODO: - maxDrawBuffers: number
    // TODO: - hasVR: boolean
}

export class SystemCapabilitiesDetector {
    private static readonly logger = Logger.createLogFunctions(SystemCapabilitiesDetector.name)
    private static cachedCapabilities: SystemCapabilities | null = null
    private static readonly LARGE_TEXTURE_THRESHOLD = 4096
    
    /**
     * Detect system capabilities (cached after first call)
     */
    public static detect(): SystemCapabilities {
        if (SystemCapabilitiesDetector.cachedCapabilities) {
            return SystemCapabilitiesDetector.cachedCapabilities
        }
        
        const capabilities = SystemCapabilitiesDetector.detectCapabilities()
        SystemCapabilitiesDetector.cachedCapabilities = capabilities
        
        SystemCapabilitiesDetector.logger.debug('System capabilities detected:', capabilities)
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
        const hasInstancedArrays = hasWebGL2 || !!(gl1 && typeof gl1.getExtension === 'function' && gl1.getExtension('ANGLE_instanced_arrays'))
        
        let maxTextureSize = 0
        let renderer = 'unknown'
        let hasHardwareRenderer = false
        let supportsLargeTextures = false
        let hasGoodGPU = false
        let hasParallelShaderCompile = false
        
        const context = gl || gl1
        if (context) {
            const canQueryParameters = typeof context.getParameter === 'function'
            const canGetExtensions = typeof context.getExtension === 'function'
            if (!canQueryParameters || !canGetExtensions) {
                SystemCapabilitiesDetector.logger.warn('WebGL context missing expected query APIs; using conservative capability defaults')
            }

            maxTextureSize = SystemCapabilitiesDetector.readMaxTextureSize(context, canQueryParameters)
            renderer = SystemCapabilitiesDetector.readRenderer(context, canQueryParameters, canGetExtensions)
            
            // KHR_parallel_shader_compile — when present, compileAsync() offloads shader linking
            // to the driver background thread and resolves without blocking the main thread.
            hasParallelShaderCompile = canGetExtensions && !!context.getExtension('KHR_parallel_shader_compile')
            
            // TODO: Validate this heuristic with real-world telemetry once the app reaches a broader user base.
            // For now, keep current behavior to avoid changing handler selection semantics.
            hasHardwareRenderer = !renderer.toLowerCase().includes('software')
            supportsLargeTextures = maxTextureSize >= SystemCapabilitiesDetector.LARGE_TEXTURE_THRESHOLD

            SystemCapabilitiesDetector.logUnknownRendererMetrics(renderer, {
                hasWebGL2,
                hasInstancedArrays,
                maxTextureSize
            })
            
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
            renderer,
            hasParallelShaderCompile
        }
    }

    private static readMaxTextureSize(
        context: WebGLRenderingContext | WebGL2RenderingContext,
        canQueryParameters: boolean
    ): number {
        if (!canQueryParameters || context.MAX_TEXTURE_SIZE === undefined) {
            return 0
        }

        return context.getParameter(context.MAX_TEXTURE_SIZE)
    }

    private static readRenderer(
        context: WebGLRenderingContext | WebGL2RenderingContext,
        canQueryParameters: boolean,
        canGetExtensions: boolean
    ): string {
        if (!canGetExtensions || !canQueryParameters) {
            return 'unknown'
        }

        const debugInfo = context.getExtension('WEBGL_debug_renderer_info')
        if (!debugInfo) {
            return 'unknown'
        }

        return context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? 'unknown'
    }

    private static logUnknownRendererMetrics(
        renderer: string,
        details: { hasWebGL2: boolean; hasInstancedArrays: boolean; maxTextureSize: number }
    ): void {
        if (renderer !== 'unknown') {
            return
        }

        SystemCapabilitiesDetector.logger.debug('Renderer reported as unknown; tracking values for future heuristic tuning', details)
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
export const hasParallelShaderCompile = (): boolean => SystemCapabilitiesDetector.detect().hasParallelShaderCompile

// Export the detection function for convenience
export const detectSystemCapabilities = SystemCapabilitiesDetector.detect
