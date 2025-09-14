/**
 * DebugPanel - Development and diagnostic tools
 * 
 * Provides debug information for development and troubleshooting:
 * - Three.js scene object counts
 * - Performance metrics and memory usage
 * - Cache statistics and diagnostics
 * - Console access toggle
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import { renderTemplate } from '../../../utils/TemplateEngine'
import debugPanelTemplate from '../templates/debug-panel.html?raw'
import '../../../styles/pause-menu/debug-panel.css'
import { SteamLauncher, type LaunchResult } from '../../../steam/SteamLauncher'

export interface DebugStats {
    // Three.js Scene Stats
    sceneObjects: {
        total: number
        meshes: number
        lights: number
        cameras: number
        textures: number
        materials: number
        geometries: number
    }
    
    // Performance Stats
    performance: {
        fps: number
        frameTime: number
        memoryUsed: number
        memoryTotal: number
        triangles: number
        drawCalls: number
    }
    
    // Cache Stats
    cache: {
        imageCount: number
        imageCacheSize: number
        gameDataCount: number
        gameDataSize: number
        quotaUsed: number
        quotaTotal: number
    }
    
    // System Info
    system: {
        userAgent: string
        webxrSupported: boolean
        webglVersion: string
        maxTextureSize: number
        vendor: string
        renderer: string
    }
}

export class DebugPanel extends PauseMenuPanel {
    readonly id = 'debug'
    readonly title = 'Debug'
    readonly icon = '🔧'

    private updateInterval: number | null = null
    private stats: DebugStats = this.getInitialStats()
    private currentStats: DebugStats | null = null
    private onGetDebugStats?: () => Promise<DebugStats>
    private consoleVisible = false

    constructor(config: PauseMenuPanelConfig = {}) {
        super(config)
    }

    /**
     * Initialize the panel with callback for getting debug stats
     */
    initialize(callbacks: { onGetDebugStats?: () => Promise<DebugStats> }): void {
        this.onGetDebugStats = callbacks.onGetDebugStats
    }

    render(): string {
        // Flatten the hierarchical stats data for the simple template engine
        const templateData = {
            // Console state
            consoleActiveClass: this.consoleVisible ? 'primary' : 'secondary',
            consoleButtonText: this.consoleVisible ? '🙈 Hide Console' : '👁️ Show Console',
            consoleVisibilityClass: this.consoleVisible ? 'visible' : 'hidden',
            
            // Scene objects (flattened)
            sceneObjectsTotal: this.stats.sceneObjects.total,
            sceneObjectsMeshes: this.stats.sceneObjects.meshes,
            sceneObjectsLights: this.stats.sceneObjects.lights,
            sceneObjectsCameras: this.stats.sceneObjects.cameras,
            sceneObjectsTextures: this.stats.sceneObjects.textures,
            sceneObjectsMaterials: this.stats.sceneObjects.materials,
            sceneObjectsGeometries: this.stats.sceneObjects.geometries,
            
            // Performance (flattened and formatted)
            performanceFpsClass: this.getPerformanceClass('fps'),
            performanceFps: this.stats.performance.fps.toFixed(1),
            performanceFrameTime: this.stats.performance.frameTime.toFixed(2) + 'ms',
            performanceMemoryClass: this.getPerformanceClass('memory'),
            performanceMemoryUsed: this.formatBytes(this.stats.performance.memoryUsed),
            performanceMemoryTotal: this.formatBytes(this.stats.performance.memoryTotal),
            performanceTriangles: this.stats.performance.triangles.toLocaleString(),
            performanceDrawCallsClass: this.getPerformanceClass('drawCalls'),
            performanceDrawCalls: this.stats.performance.drawCalls,
            
            // Cache (flattened and formatted)
            cacheImageCount: this.stats.cache.imageCount,
            cacheImageSize: this.formatBytes(this.stats.cache.imageCacheSize),
            cacheGameDataCount: this.stats.cache.gameDataCount,
            cacheGameDataSize: this.formatBytes(this.stats.cache.gameDataSize),
            cacheQuotaClass: this.getPerformanceClass('quota'),
            cacheQuotaUsage: this.formatQuotaUsage(),
            
            // System (flattened and formatted)
            systemWebxrClass: this.stats.system.webxrSupported ? 'good' : 'warning',
            systemWebxrText: this.stats.system.webxrSupported ? '✅ Available' : '❌ Not Available',
            systemWebglVersion: this.stats.system.webglVersion,
            systemMaxTextureSize: this.stats.system.maxTextureSize + 'px',
            systemVendor: this.stats.system.vendor,
            systemRenderer: this.stats.system.renderer
        }
        
        return renderTemplate(debugPanelTemplate, templateData)
    }

    attachEvents(): void {
        const refreshButton = document.getElementById('refresh-debug')
        if (refreshButton) {
            refreshButton.addEventListener('click', () => this.refreshStats())
        }

        const consoleButton = document.getElementById('toggle-console')
        if (consoleButton) {
            consoleButton.addEventListener('click', () => this.toggleConsole())
        }

        const steamLaunchButton = document.getElementById('test-steam-launch')
        if (steamLaunchButton) {
            steamLaunchButton.addEventListener('click', () => this.testSteamLaunch())
        }

        const exportButton = document.getElementById('export-debug')
        if (exportButton) {
            exportButton.addEventListener('click', () => this.exportDebugInfo())
        }

        const clearConsoleButton = document.getElementById('clear-console')
        if (clearConsoleButton) {
            clearConsoleButton.addEventListener('click', () => this.clearConsole())
        }
    }

    private async refreshStats(): Promise<void> {
        if (this.onGetDebugStats) {
            try {
                this.stats = await this.onGetDebugStats()
                this.currentStats = this.stats
                this.refresh()
                console.log('🔧 Debug stats refreshed')
            } catch (error) {
                console.error('Failed to refresh debug stats:', error)
            }
        }
    }

    private toggleConsole(): void {
        this.consoleVisible = !this.consoleVisible
        this.refresh()
        
        if (this.consoleVisible) {
            this.setupConsoleCapture()
        } else {
            this.removeConsoleCapture()
        }
    }

    private setupConsoleCapture(): void {
        // Capture console output and display in debug console
        const originalLog = console.log
        const originalWarn = console.warn
        const originalError = console.error

        const addToConsole = (type: string, ...args: unknown[]) => {
            const consoleOutput = document.getElementById('console-output')
            if (consoleOutput) {
                const line = document.createElement('div')
                line.className = `console-line ${type}`
                line.textContent = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`
                consoleOutput.appendChild(line)
                consoleOutput.scrollTop = consoleOutput.scrollHeight
            }
        }

        console.log = (...args: unknown[]) => {
            originalLog.apply(console, args)
            addToConsole('info', ...args)
        }

        console.warn = (...args: unknown[]) => {
            originalWarn.apply(console, args)
            addToConsole('warning', ...args)
        }

        console.error = (...args: unknown[]) => {
            originalError.apply(console, args)
            addToConsole('error', ...args)
        }
    }

    private removeConsoleCapture(): void {
        // Note: In a real implementation, you'd need to store the original functions
        // and restore them here. For now, this is a placeholder.
    }

    private clearConsole(): void {
        const consoleOutput = document.getElementById('console-output')
        if (consoleOutput) {
            consoleOutput.innerHTML = '<div class="console-line info">Console cleared.</div>'
        }
    }

    private async testSteamLaunch(): Promise<void> {
        console.log('🎮 Testing Steam game launch functionality...')
        
        // Show immediate feedback
        this.addConsoleMessage('info', '🎮 Testing Steam launch with Hexcells Infinite...')
        
        try {
            // Test the Steam launcher
            const result: LaunchResult = await SteamLauncher.testSteamLaunch()
            
            // Log the result
            if (result.success) {
                if (result.method === 'protocol') {
                    console.log('✅ Steam protocol test successful')
                    this.addConsoleMessage('info', '✅ Steam protocol working! Game should launch in Steam.')
                } else if (result.method === 'store') {
                    console.log('⚠️ Steam protocol unavailable, fallback used')  
                    this.addConsoleMessage('warning', '⚠️ Steam protocol not available - opened store page.')
                }
            } else {
                console.error('❌ Steam launch test failed')
                this.addConsoleMessage('error', '❌ Steam launch test failed - check if Steam is installed.')
            }
            
            // Also log environment info for debugging
            const envInfo = SteamLauncher.getEnvironmentInfo()
            console.log('🔍 Environment info:', envInfo)
            this.addConsoleMessage('info', `🔍 Browser: ${envInfo.userAgent.substring(0, 50)}...`)
            this.addConsoleMessage('info', `🔐 Secure context: ${envInfo.isSecureContext}`)
            
        } catch (error) {
            console.error('💥 Steam launch test error:', error)
            this.addConsoleMessage('error', `💥 Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    /**
     * Add a message to the debug console
     */
    private addConsoleMessage(type: 'info' | 'warning' | 'error', message: string): void {
        const consoleOutput = document.getElementById('console-output')
        if (consoleOutput) {
            const line = document.createElement('div')
            line.className = `console-line ${type}`
            line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`
            consoleOutput.appendChild(line)
            consoleOutput.scrollTop = consoleOutput.scrollHeight
        }
    }

    private exportDebugInfo(): void {
        const debugInfo = {
            timestamp: new Date().toISOString(),
            stats: this.stats,
            userAgent: navigator.userAgent,
            url: window.location.href,
            localStorage: Object.keys(localStorage).length
        }

        const debugJson = JSON.stringify(debugInfo, null, 2)
        const blob = new Blob([debugJson], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        
        const a = document.createElement('a')
        a.href = url
        a.download = `debug-info-${Date.now()}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        console.log('🔧 Debug information exported')
    }

    private getInitialStats(): DebugStats {
        return {
            sceneObjects: {
                total: 0,
                meshes: 0,
                lights: 0,
                cameras: 0,
                textures: 0,
                materials: 0,
                geometries: 0
            },
            performance: {
                fps: 0,
                frameTime: 0,
                memoryUsed: 0,
                memoryTotal: 0,
                triangles: 0,
                drawCalls: 0
            },
            cache: {
                imageCount: 0,
                imageCacheSize: 0,
                gameDataCount: 0,
                gameDataSize: 0,
                quotaUsed: 0,
                quotaTotal: 0
            },
            system: {
                userAgent: navigator.userAgent,
                webxrSupported: false,
                webglVersion: 'Unknown',
                maxTextureSize: 0,
                vendor: 'Unknown',
                renderer: 'Unknown'
            }
        }
    }

    private getPerformanceClass(metric: string): string {
        switch (metric) {
            case 'fps':
                if (this.stats.performance.fps < 30) return 'warning'
                if (this.stats.performance.fps < 45) return 'caution'
                return 'good'
            case 'memory': {
                const memoryPercent = this.stats.performance.memoryUsed / this.stats.performance.memoryTotal
                if (memoryPercent > 0.9) return 'warning'
                if (memoryPercent > 0.7) return 'caution'
                return 'good'
            }
            case 'drawCalls':
                if (this.stats.performance.drawCalls > 1000) return 'warning'
                if (this.stats.performance.drawCalls > 500) return 'caution'
                return 'good'
            case 'quota': {
                const quotaPercent = this.stats.cache.quotaUsed / this.stats.cache.quotaTotal
                if (quotaPercent > 0.9) return 'warning'
                if (quotaPercent > 0.7) return 'caution'
                return 'good'
            }
            default:
                return ''
        }
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    private formatQuotaUsage(): string {
        const used = this.formatBytes(this.stats.cache.quotaUsed)
        const total = this.formatBytes(this.stats.cache.quotaTotal)
        const percent = ((this.stats.cache.quotaUsed / this.stats.cache.quotaTotal) * 100).toFixed(1)
        return `${used} / ${total} (${percent}%)`
    }

    onShow(): void {
        // Start auto-refresh when panel is visible
        this.updateInterval = window.setInterval(() => {
            this.refreshStats()
        }, 2000)

        // Initial refresh
        this.refreshStats()
    }

    onHide(): void {
        // Stop auto-refresh when panel is hidden
        if (this.updateInterval !== null) {
            window.clearInterval(this.updateInterval)
            this.updateInterval = null
        }

        // Hide console if visible
        if (this.consoleVisible) {
            this.consoleVisible = false
            this.removeConsoleCapture()
        }
    }

    private refresh(): void {
        if (this.container && this.isVisible) {
            // Only refresh if panel is actually visible to avoid interfering with tab switching
            this.updateStatsDisplay()
        }
    }

    private updateStatsDisplay(): void {
        if (!this.container) return
        
        // Instead of replacing innerHTML, update individual stat elements
        // This prevents disrupting the DOM structure and tab switching
        if (this.currentStats) {
            this.updateSceneStats(this.currentStats.sceneObjects)
            this.updatePerformanceStats(this.currentStats.performance)
            this.updateCacheStats(this.currentStats.cache)
            this.updateSystemStats(this.currentStats.system)
        }
    }

    private updateSceneStats(stats: DebugStats['sceneObjects']): void {
        const updateStat = (id: string, value: number) => {
            const element = document.getElementById(id)
            if (element) element.textContent = value.toString()
        }
        
        updateStat('stat-total-objects', stats.total)
        updateStat('stat-meshes', stats.meshes)
        updateStat('stat-lights', stats.lights)
        updateStat('stat-cameras', stats.cameras)
        updateStat('stat-textures', stats.textures)
        updateStat('stat-materials', stats.materials)
        updateStat('stat-geometries', stats.geometries)
    }

    private updatePerformanceStats(stats: DebugStats['performance']): void {
        const updateStat = (id: string, value: number, suffix: string = '') => {
            const element = document.getElementById(id)
            if (element) element.textContent = value.toString() + suffix
        }
        
        updateStat('stat-fps', Math.round(stats.fps))
        updateStat('stat-frame-time', parseFloat(stats.frameTime.toFixed(2)), 'ms')
        updateStat('stat-memory-used', Math.round(stats.memoryUsed / 1024 / 1024), 'MB')
        updateStat('stat-memory-total', Math.round(stats.memoryTotal / 1024 / 1024), 'MB')
        updateStat('stat-triangles', stats.triangles)
        updateStat('stat-draw-calls', stats.drawCalls)
    }

    private updateCacheStats(stats: DebugStats['cache']): void {
        const updateStat = (id: string, value: number, suffix: string = '') => {
            const element = document.getElementById(id)
            if (element) element.textContent = value.toString() + suffix
        }
        
        const updateQuotaUsage = () => {
            const element = document.getElementById('stat-quota-used')
            if (element) {
                const used = this.formatBytes(stats.quotaUsed)
                const total = this.formatBytes(stats.quotaTotal)
                const percent = ((stats.quotaUsed / stats.quotaTotal) * 100).toFixed(1)
                element.textContent = `${used} / ${total} (${percent}%)`
            }
        }
        
        updateStat('stat-image-count', stats.imageCount)
        updateStat('stat-image-cache-size', Math.round(stats.imageCacheSize / 1024 / 1024), 'MB')
        updateStat('stat-game-data-count', stats.gameDataCount)
        updateStat('stat-game-data-size', Math.round(stats.gameDataSize / 1024), 'KB')
        updateQuotaUsage()
    }

    private updateSystemStats(stats: DebugStats['system']): void {
        const updateStat = (id: string, value: string | number) => {
            const element = document.getElementById(id)
            if (element) element.textContent = value.toString()
        }
        
        updateStat('stat-webxr-supported', stats.webxrSupported ? 'Yes' : 'No')
        updateStat('stat-webgl-version', stats.webglVersion)
        updateStat('stat-max-texture-size', stats.maxTextureSize + 'px')
        updateStat('stat-vendor', stats.vendor)
        updateStat('stat-renderer', stats.renderer)
    }

    private fullRefresh(): void {
        // Full refresh that rebuilds the entire panel - only use when necessary
        if (this.container && this.isVisible) {
            this.container.innerHTML = this.render()
            this.attachEvents()
        }
    }

    dispose(): void {
        if (this.updateInterval !== null) {
            window.clearInterval(this.updateInterval)
        }
        this.removeConsoleCapture()
        this.onGetDebugStats = undefined
    }
}
