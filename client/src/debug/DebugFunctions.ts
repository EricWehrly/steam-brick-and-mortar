/**
 * Debug Functions - Centralized Debug Tools for GameBox Rendering
 * 
 * Provides debug utilities for inspecting GPU instanced rendering system
 * Uses dependency injection to access renderers without tight coupling
 */

export interface DebugRenderer {
    getInstancedLabelRenderer(): any | undefined
    getInstancedArtworkRenderer(): any | undefined
    getLabelInstanceIndex(): number
    getArtworkInstanceIndex(): number
}

export class DebugFunctions {
    private renderer: DebugRenderer

    constructor(renderer: DebugRenderer) {
        this.renderer = renderer
        this.exposeGlobalFunctions()
    }

    /**
     * Export texture array as downloadable PNG for visual inspection
     */
    public exportTextureArray(): void {
        const artworkRenderer = this.renderer.getInstancedArtworkRenderer()
        if (artworkRenderer) {
            artworkRenderer.debugExportTextureArray()
            artworkRenderer.debugLogTextureArrayState()
        } else {
            console.warn('🔍 InstancedArtworkRenderer not available')
        }
    }

    /**
     * Force GPU updates for both renderers
     */
    public forceGPUUpdate(): void {
        console.log('🔍 [DEBUG] Forcing GPU updates...')
        
        const labelRenderer = this.renderer.getInstancedLabelRenderer()
        const artworkRenderer = this.renderer.getInstancedArtworkRenderer()
        
        if (labelRenderer) {
            labelRenderer.updateGPU()
        }
        
        if (artworkRenderer) {
            artworkRenderer.updateGPU()
        }
    }

    /**
     * Log detailed renderer state information
     */
    public logRendererState(): void {
        console.log('🔍 [DEBUG] Renderer state:')
        
        const labelRenderer = this.renderer.getInstancedLabelRenderer()
        const artworkRenderer = this.renderer.getInstancedArtworkRenderer()
        
        console.log('🔍 [DEBUG] Label Renderer:', labelRenderer ? 'Available' : 'Not available')
        if (labelRenderer) {
            console.log('🔍 [DEBUG] Label Instance Index:', this.renderer.getLabelInstanceIndex())
        }
        
        console.log('🔍 [DEBUG] Artwork Renderer:', artworkRenderer ? 'Available' : 'Not available')
        if (artworkRenderer) {
            console.log('🔍 [DEBUG] Artwork Instance Index:', this.renderer.getArtworkInstanceIndex())
        }
    }

    /**
     * Get information about artwork selection settings
     */
    public getArtworkSelectionInfo(): void {
        console.log('🔍 [DEBUG] Artwork selection info:')
        console.log('🔍 [DEBUG] Current setting: Every 20th game gets artwork')
        console.log('🔍 [DEBUG] To see changes, reload the page after modifying StorePropsRenderer')
    }

    /**
     * Expose debug functions to global window object for console access
     */
    private exposeGlobalFunctions(): void {
        if (typeof window !== 'undefined') {
            (window as any).steamDebug = {
                exportTextureArray: () => this.exportTextureArray(),
                logRendererState: () => this.logRendererState(),
                forceGPUUpdate: () => this.forceGPUUpdate(),
                getArtworkSelectionInfo: () => this.getArtworkSelectionInfo()
            }
            
            console.log('🎯 [DEBUG] Global debug functions exposed:')
            console.log('🎯 [DEBUG]   steamDebug.exportTextureArray() - Download texture array as image')
            console.log('🎯 [DEBUG]   steamDebug.logRendererState() - Log detailed renderer state')
            console.log('🎯 [DEBUG]   steamDebug.forceGPUUpdate() - Force GPU sync')
            console.log('🎯 [DEBUG]   steamDebug.getArtworkSelectionInfo() - Artwork selection details')
        }
    }

    /**
     * Remove global debug functions (cleanup)
     */
    public dispose(): void {
        if (typeof window !== 'undefined') {
            delete (window as any).steamDebug
            console.log('🧹 Global debug functions removed')
        }
    }
}