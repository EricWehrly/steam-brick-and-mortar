/**
 * FrameBudgetScheduler - Frame-budget-aware task scheduler
 * 
 * Defers non-critical work (like texture array copies) to frames where we have
 * headroom, preventing frame drops during heavy operations.
 * 
 * Key features:
 * - Ultra-lightweight frame time tracking (O(1) rolling average)
 * - Budget-aware task scheduling
 * - Time-based anti-starvation (no frame counting overhead)
 * - Self-tuning based on target FPS
 * 
 * Usage:
 *   scheduler.schedule(() => arrayData.set(pixels, offset), { estimatedMs: 0.5 })
 */

import { Logger } from './Logger'

export interface TaskOptions {
    /** Estimated execution time in ms (helps budget planning) */
    estimatedMs?: number
    /** Task priority - higher priority tasks execute first */
    priority?: 'low' | 'normal' | 'high'
    /** Maximum time to defer before forcing execution (default: ~16.6 seconds) */
    maxDeferMs?: number
}

interface QueuedTask {
    fn: () => void
    estimatedMs: number
    priority: number  // 0=low, 1=normal, 2=high
    maxDeferMs: number
    queuedAt: number
}

export interface SchedulerStats {
    currentFps: number
    targetFps: number
    rollingAvgFrameTime: number
    pendingTasks: number
    tasksExecutedLastFrame: number
    totalTasksDeferred: number
    totalTasksForced: number
    budgetThreshold: number
}

export interface FrameBudgetSchedulerConfig {
    /** Target frames per second (default: 60) */
    targetFps?: number
    /** Fraction of remaining frame budget to use (default: 0.8) */
    budgetThreshold?: number
    /** Maximum tasks to process per frame (default: 10) */
    maxTasksPerFrame?: number
    /** Default max defer time in ms (default: 16666 = ~1000 frames at 60fps) */
    defaultMaxDeferMs?: number
    /** Number of frames to track for rolling average (default: 60) */
    ringBufferSize?: number
}

const PRIORITY_MAP = { low: 0, normal: 1, high: 2 } as const

export class FrameBudgetScheduler {
    private static instance: FrameBudgetScheduler | null = null
    // Support test mocks that may only provide Logger.withContext()
    public static logger = typeof Logger.createLogFunctions === 'function'
        ? Logger.createLogFunctions(FrameBudgetScheduler.name)
        : Logger.withContext(FrameBudgetScheduler.name)
    
    // Configuration
    private targetFps: number
    private targetFrameTime: number
    private budgetThreshold: number
    private maxTasksPerFrame: number
    private defaultMaxDeferMs: number
    
    // Frame time tracking (ultra-lightweight)
    private frameTimeRing: Float32Array
    private ringIndex = 0
    private rollingSum = 0
    private frameCount = 0  // Track how many samples we have (for startup)
    private lastFrameTime = 0
    private frameStartTime = 0
    
    // Task queue
    private pendingTasks: QueuedTask[] = []
    private needsSort = false  // Only sort when we add different priorities
    
    // Stats
    private tasksExecutedLastFrame = 0
    private totalTasksDeferred = 0
    private totalTasksForced = 0
    
    private constructor(config: FrameBudgetSchedulerConfig = {}) {
        this.targetFps = config.targetFps ?? 60
        this.targetFrameTime = 1000 / this.targetFps
        this.budgetThreshold = config.budgetThreshold ?? 0.8
        this.maxTasksPerFrame = config.maxTasksPerFrame ?? 1  // take longer, ride smoother
        this.defaultMaxDeferMs = config.defaultMaxDeferMs ?? 400
        
        const ringSize = config.ringBufferSize ?? 60
        this.frameTimeRing = new Float32Array(ringSize)
        
        FrameBudgetScheduler.logger.lifecycle(`Initialized: target ${this.targetFps}fps, budget threshold ${this.budgetThreshold * 100}%`)
    }
    
    public static getInstance(config?: FrameBudgetSchedulerConfig): FrameBudgetScheduler {
        if (!FrameBudgetScheduler.instance) {
            FrameBudgetScheduler.instance = new FrameBudgetScheduler(config)
        }
        return FrameBudgetScheduler.instance
    }
    
    /**
     * Call at the START of each frame (before rendering)
     * This updates frame time tracking and processes pending tasks
     */
    public onFrameStart(now: number): void {
        // Calculate delta from last frame
        if (this.lastFrameTime > 0) {
            const delta = now - this.lastFrameTime
            this.updateFrameTime(delta)
        }
        
        this.lastFrameTime = now
        this.frameStartTime = now
        this.tasksExecutedLastFrame = 0
        
        // Process pending tasks at frame start (when we have full budget)
        this.processPendingTasks(now)
    }
    
    /**
     * Optional: call at the END of each frame to process more tasks if budget remains
     */
    public onFrameEnd(): void {
        // Could process more tasks here if we have leftover budget
        // For now, we only process at frame start for simplicity
    }
    
    private updateFrameTime(delta: number): void {
        // Subtract old value from sum, add new value
        this.rollingSum -= this.frameTimeRing[this.ringIndex]
        this.rollingSum += delta
        this.frameTimeRing[this.ringIndex] = delta
        
        // Advance ring index
        this.ringIndex = (this.ringIndex + 1) % this.frameTimeRing.length
        
        // Track sample count for accurate average during startup
        if (this.frameCount < this.frameTimeRing.length) {
            this.frameCount++
        }
    }
    
    public getRollingAvgFrameTime(): number {
        if (this.frameCount === 0) return this.targetFrameTime
        return this.rollingSum / this.frameCount
    }
    
    public getCurrentFps(): number {
        const avgFrameTime = this.getRollingAvgFrameTime()
        return avgFrameTime > 0 ? 1000 / avgFrameTime : this.targetFps
    }
    
    public hasBudget(estimatedMs: number = 1): boolean {
        const elapsed = performance.now() - this.frameStartTime
        const remaining = this.targetFrameTime - elapsed
        const usableBudget = remaining * this.budgetThreshold
        
        return usableBudget >= estimatedMs
    }
    
    public getRemainingBudget(): number {
        const elapsed = performance.now() - this.frameStartTime
        return Math.max(0, (this.targetFrameTime - elapsed) * this.budgetThreshold)
    }
    
    public schedule(task: () => void, options: TaskOptions = {}): void {
        const priority = PRIORITY_MAP[options.priority ?? 'normal']
        
        const queuedTask: QueuedTask = {
            fn: task,
            estimatedMs: options.estimatedMs ?? 1,
            priority,
            maxDeferMs: options.maxDeferMs ?? this.defaultMaxDeferMs,
            queuedAt: performance.now()
        }
        
        this.pendingTasks.push(queuedTask)
        
        // Mark that we need to sort if this isn't normal priority
        if (priority !== 1) {
            this.needsSort = true
        }
        
        this.totalTasksDeferred++
    }
    
    public scheduleAsync<T>(task: () => T, options: TaskOptions = {}): Promise<T> {
        return new Promise((resolve, reject) => {
            this.schedule(() => {
                try {
                    resolve(task())
                } catch (e) {
                    reject(e)
                }
            }, options)
        })
    }
    
    private processPendingTasks(now: number): void {
        if (this.pendingTasks.length === 0) return
        
        // Sort by priority if needed (descending - high priority first)
        if (this.needsSort) {
            this.pendingTasks.sort((a, b) => b.priority - a.priority)
            this.needsSort = false
        }
        
        let tasksExecuted = 0
        
        while (this.pendingTasks.length > 0 && tasksExecuted < this.maxTasksPerFrame) {
            const task = this.pendingTasks[0]
            
            // Anti-starvation: check if task has been waiting too long
            // This is O(1): one subtraction, one comparison
            const waitTime = now - task.queuedAt
            const forceExecution = waitTime > task.maxDeferMs
            
            if (forceExecution) {
                FrameBudgetScheduler.logger.warn(`Task forced after ${waitTime.toFixed(0)}ms wait (limit: ${task.maxDeferMs}ms) - system may be overloaded`)
                this.totalTasksForced++
            }
            
            // Check budget (skip if forced)
            if (!forceExecution && !this.hasBudget(task.estimatedMs)) {
                break  // No budget and not forced - wait for next frame
            }
            
            // Execute task
            this.pendingTasks.shift()
            try {
                task.fn()
            } catch (e) {
                    FrameBudgetScheduler.logger.error('Task execution failed:', e)
            }
            tasksExecuted++
        }
        
        this.tasksExecutedLastFrame = tasksExecuted
    }
    
    public tryExecuteOrSchedule(task: () => void, options: TaskOptions = {}): boolean {
        if (this.hasBudget(options.estimatedMs ?? 1)) {
            task()
            return true
        }
        this.schedule(task, options)
        return false
    }
    
    public getStats(): SchedulerStats {
        return {
            currentFps: this.getCurrentFps(),
            targetFps: this.targetFps,
            rollingAvgFrameTime: this.getRollingAvgFrameTime(),
            pendingTasks: this.pendingTasks.length,
            tasksExecutedLastFrame: this.tasksExecutedLastFrame,
            totalTasksDeferred: this.totalTasksDeferred,
            totalTasksForced: this.totalTasksForced,
            budgetThreshold: this.budgetThreshold
        }
    }
    
    public setTargetFps(fps: number): void {
        this.targetFps = fps
        this.targetFrameTime = 1000 / fps
        FrameBudgetScheduler.logger.lifecycle(`Target FPS changed to ${fps}`)
    }
    
    public setBudgetThreshold(threshold: number): void {
        this.budgetThreshold = Math.max(0.1, Math.min(1.0, threshold))
        FrameBudgetScheduler.logger.lifecycle(`Budget threshold changed to ${(this.budgetThreshold * 100).toFixed(0)}%`)
    }
    
    public setMaxTasksPerFrame(max: number): void {
        this.maxTasksPerFrame = Math.max(1, Math.min(20, max))
        FrameBudgetScheduler.logger.lifecycle(`Max tasks per frame changed to ${this.maxTasksPerFrame}`)
    }
    
    public clearPendingTasks(): void {
        const count = this.pendingTasks.length
        this.pendingTasks = []
        if (count > 0) {
            FrameBudgetScheduler.logger.warn(`Cleared ${count} pending tasks`)
        }
    }
    
    public diagnose(): void {
        const stats = this.getStats()
        console.group('📊 FrameBudgetScheduler Stats')
        console.log(`FPS: ${stats.currentFps.toFixed(1)} / ${stats.targetFps} target`)
        console.log(`Avg frame time: ${stats.rollingAvgFrameTime.toFixed(2)}ms`)
        console.log(`Budget threshold: ${(stats.budgetThreshold * 100).toFixed(0)}%`)
        console.log(`Remaining budget: ${this.getRemainingBudget().toFixed(2)}ms`)
        console.log(`Pending tasks: ${stats.pendingTasks}`)
        console.log(`Tasks last frame: ${stats.tasksExecutedLastFrame}`)
        console.log(`Total deferred: ${stats.totalTasksDeferred}`)
        console.log(`Total forced: ${stats.totalTasksForced}`)
        console.groupEnd()
    }
    
    public resetStats(): void {
        this.totalTasksDeferred = 0
        this.totalTasksForced = 0
        this.tasksExecutedLastFrame = 0
    }
    
    public dispose(): void {
        this.clearPendingTasks()
        FrameBudgetScheduler.instance = null
        FrameBudgetScheduler.logger.lifecycle('Disposed')
    }
}
