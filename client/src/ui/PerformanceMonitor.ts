/**
 * Performance Statistics Display
 * 
 * A lightweight performance monitoring component that displays FPS, memory usage,
 * and render time statistics. This is inspired by the popular stats.js library
 * but implemented using browser APIs to avoid external dependencies.
 */

import * as THREE from 'three'

export interface PerformanceStats {
    fps: number
    frameTime: number
    memoryUsed?: number
    memoryTotal?: number
    drawCalls?: number
    triangles?: number
}

export interface PerformanceConfig {
    updateInterval?: number // milliseconds
    precision?: number // decimal places
    showMemory?: boolean
    showDrawCalls?: boolean
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}

interface MemoryInfo {
    usedJSHeapSize: number
    totalJSHeapSize: number
    jsHeapSizeLimit: number
}

interface PerformanceWithMemory extends Performance {
    memory?: MemoryInfo
}

export class PerformanceMonitor {
    private container: HTMLElement
    private fpsDisplay: HTMLElement
    private frameTimeDisplay: HTMLElement
    private memoryDisplay: HTMLElement | null = null
    private drawCallsDisplay: HTMLElement | null = null
    
    private frameCount = 0
    private lastTime = window.performance.now()
    private lastFpsUpdate = window.performance.now()
    private frameTimeHistory: number[] = []
    private animationId: number | null = null
    
    private config: Required<PerformanceConfig>
    
    constructor(config: PerformanceConfig = {}) {
        this.config = {
            updateInterval: config.updateInterval ?? 100,
            precision: config.precision ?? 1,
            showMemory: config.showMemory ?? true,
            showDrawCalls: config.showDrawCalls ?? false,
            position: config.position ?? 'top-left'
        }
        
        this.container = this.createContainer()
        this.fpsDisplay = this.createDisplay('FPS', '0')
        this.frameTimeDisplay = this.createDisplay('MS', '0')
        
        if (this.config.showMemory && this.isMemoryAPISupported()) {
            this.memoryDisplay = this.createDisplay('MB', '0')
        }
        
        if (this.config.showDrawCalls) {
            this.drawCallsDisplay = this.createDisplay('DC', '0')
        }
        
        this.setupStyles()
        document.body.appendChild(this.container)
    }
    
    private createContainer(): HTMLElement {
        const container = document.createElement('div')
        container.id = 'performance-monitor'
        container.style.position = 'fixed'
        container.style.zIndex = '10000'
        container.style.fontFamily = 'Monaco, monospace'
        container.style.fontSize = '10px'
        container.style.lineHeight = '1.2'
        container.style.pointerEvents = 'none'
        container.style.userSelect = 'none'
        return container
    }
    
    private createDisplay(label: string, initialValue: string): HTMLElement {
        const display = document.createElement('div')
        display.style.padding = '2px 4px'
        display.style.margin = '1px 0'
        display.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'
        display.style.color = '#00ff00'
        display.style.border = '1px solid #333'
        display.style.borderRadius = '2px'
        display.innerHTML = `<span style="color: #fff">${label}:</span> ${initialValue}`
        this.container.appendChild(display)
        return display
    }
    
    private setupStyles(): void {
        const { position } = this.config
        
        switch (position) {
            case 'top-left':
                this.container.style.top = '10px'
                this.container.style.left = '10px'
                break
            case 'top-right':
                this.container.style.top = '10px'
                this.container.style.right = '10px'
                break
            case 'bottom-left':
                this.container.style.bottom = '10px'
                this.container.style.left = '10px'
                break
            case 'bottom-right':
                this.container.style.bottom = '10px'
                this.container.style.right = '10px'
                break
        }
    }
    
    private isMemoryAPISupported(): boolean {
        const perf = window.performance as PerformanceWithMemory
        return 'memory' in perf && perf.memory !== undefined && 'usedJSHeapSize' in perf.memory
    }
    
    /**
     * Start monitoring performance
     */
    public start(): void {
        if (this.animationId !== null) return
        
        this.lastTime = window.performance.now()
        this.lastFpsUpdate = window.performance.now()
        this.frameCount = 0
        this.frameTimeHistory = []
        
        const update = () => {
            this.update()
            this.animationId = window.requestAnimationFrame(update)
        }
        
        this.animationId = window.requestAnimationFrame(update)
    }
    
    /**
     * Stop monitoring performance
     */
    public stop(): void {
        if (this.animationId !== null) {
            window.cancelAnimationFrame(this.animationId)
            this.animationId = null
        }
    }
    
    /**
     * Update performance statistics
     */
    private update(): void {
        const now = window.performance.now()
        const deltaTime = now - this.lastTime
        this.lastTime = now
        
        // Track frame time
        this.frameTimeHistory.push(deltaTime)
        if (this.frameTimeHistory.length > 60) {
            this.frameTimeHistory.shift()
        }
        
        this.frameCount++
        
        // Update displays at specified interval
        if (now - this.lastFpsUpdate >= this.config.updateInterval) {
            this.updateDisplays(now)
            this.lastFpsUpdate = now
        }
    }
    
    private updateDisplays(now: number): void {
        const deltaTime = now - this.lastFpsUpdate
        
        // Calculate FPS
        const fps = (this.frameCount * 1000) / deltaTime
        this.updateDisplay(this.fpsDisplay, 'FPS', fps.toFixed(this.config.precision))
        
        // Calculate average frame time
        const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length
        this.updateDisplay(this.frameTimeDisplay, 'MS', avgFrameTime.toFixed(this.config.precision))
        
        // Update memory display if supported
        if (this.memoryDisplay && this.isMemoryAPISupported()) {
            const perf = window.performance as PerformanceWithMemory
            const memInfo = perf.memory
            if (memInfo) {
                const memoryUsed = memInfo.usedJSHeapSize / 1048576 // Convert to MB
                this.updateDisplay(this.memoryDisplay, 'MB', memoryUsed.toFixed(this.config.precision))
            }
        }
        
        // Reset frame count for next interval
        this.frameCount = 0
    }
    
    private updateDisplay(element: HTMLElement, label: string, value: string): void {
        element.innerHTML = `<span style="color: #fff">${label}:</span> ${value}`
        
        // Color coding for FPS
        if (label === 'FPS') {
            const fpsValue = parseFloat(value)
            if (fpsValue >= 55) {
                element.style.color = '#00ff00' // Green for good FPS
            } else if (fpsValue >= 30) {
                element.style.color = '#ffff00' // Yellow for moderate FPS
            } else {
                element.style.color = '#ff0000' // Red for poor FPS
            }
        }
    }
    
    /**
     * Update render statistics from Three.js renderer
     */
    public updateRenderStats(renderer: THREE.WebGLRenderer): void {
        if (!this.drawCallsDisplay) return
        
        const info = renderer.info
        if (info?.render) {
            const drawCalls = info.render.calls
            this.updateDisplay(this.drawCallsDisplay, 'DC', drawCalls.toString())
        }
    }
    
    /**
     * Get current performance statistics
     */
    public getStats(): PerformanceStats {
        const avgFrameTime = this.frameTimeHistory.length > 0 
            ? this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length 
            : 0
        
        const stats: PerformanceStats = {
            fps: avgFrameTime > 0 ? 1000 / avgFrameTime : 0,
            frameTime: avgFrameTime
        }
        
        if (this.isMemoryAPISupported()) {
            const perf = window.performance as PerformanceWithMemory
            const memInfo = perf.memory
            if (memInfo) {
                stats.memoryUsed = memInfo.usedJSHeapSize / 1048576
                stats.memoryTotal = memInfo.totalJSHeapSize / 1048576
            }
        }
        
        return stats
    }
    
    /**
     * Hide the performance monitor
     */
    public hide(): void {
        this.container.style.display = 'none'
    }
    
    /**
     * Show the performance monitor
     */
    public show(): void {
        this.container.style.display = 'block'
    }
    
    /**
     * Toggle visibility of the performance monitor
     */
    public toggle(): void {
        const isVisible = this.container.style.display !== 'none'
        if (isVisible) {
            this.hide()
        } else {
            this.show()
        }
    }
    
    /**
     * Remove the performance monitor from the DOM and stop monitoring
     */
    public dispose(): void {
        this.stop()
        this.container?.parentNode?.removeChild(this.container)
    }
}
