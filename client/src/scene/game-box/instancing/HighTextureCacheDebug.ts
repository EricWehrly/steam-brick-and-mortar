import { HighTextureCache, HighTextureState, type HighTextureCacheConfig } from './HighTextureCache'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Truncate game name for console display */
const truncName = (name: string, len: number = 20): string => name.slice(0, len)

export class HighTextureCacheDebug extends HighTextureCache {
    
    constructor(config: Partial<HighTextureCacheConfig> = {}) {
        super(config)
        this.registerConsoleCommands()
    }

    private registerConsoleCommands(): void {
        ;(window as any).highTextureCache = this

        // Timing diagnostics
        ;(window as any).diagnoseTimings = () => this.diagnoseTimings()
        ;(window as any).clearTimings = () => this.clearTimingSamples()

        // Index/slot diagnostics  
        ;(window as any).diagnoseIndexes = (centerIndex = 64, radius = 3) => this.diagnoseIndexCluster(centerIndex, radius)
        ;(window as any).diagnoseMismatches = () => this.diagnoseIndexMismatches()
        ;(window as any).diagnoseLoadState = () => this.diagnoseLoadState()
        ;(window as any).dumpIndexMapping = (count = 50) => this.dumpIndexMapping(count)

        // Profiling
        ;(window as any).runProfilingTest = (count = 10) => this.runProfilingTest(count)
        ;(window as any).enableProfiling = () => this.enableProfiling()
        ;(window as any).diagnoseProfile = () => this.diagnoseProfile()
        
        // Operation costs
        ;(window as any).measureTextureCosts = () => this.measureOperationCosts()
    }

    // ========================================================================
    // Index/Slot Diagnostics
    // ========================================================================

    /**
     * Diagnostic: Get detailed state for games around a specific index
     * Useful for debugging index mapping issues
     */
    public diagnoseIndexCluster(centerIndex: number, radius: number = 3): void {
        const games = this.getGames()
        const slotToGame = this.getSlotToGame()
        const config = this.getConfig()
        const loadQueue = this.getLoadQueue()
        const loadingPromises = this.getLoadingPromises()

        console.group(`≡ƒöì Index Cluster Diagnosis: ${centerIndex} ┬▒ ${radius}`)
        
        const start = Math.max(0, centerIndex - radius)
        const end = centerIndex + radius
        
        console.log('\nGame entries:')
        for (let i = start; i <= end; i++) {
            const entry = games.get(i)
            if (entry) {
                const slotInfo = entry.highSlot >= 0 ? `slot ${entry.highSlot}` : 'no slot'
                const lastAccessStr = entry.lastAccessTime > 0 
                    ? `${((Date.now() - entry.lastAccessTime) / 1000).toFixed(1)}s ago` 
                    : 'never'
                console.log(`  [${i}] "${truncName(entry.gameName, 25)}" | state: ${entry.state} | ${slotInfo} | lastAccess: ${lastAccessStr}`)
            } else {
                console.log(`  [${i}] NOT REGISTERED`)
            }
        }
        
        console.log('\nSlot ΓåÆ Game mapping (occupied slots):')
        const occupiedSlots: string[] = []
        for (let slot = 0; slot < config.totalSlots; slot++) {
            const gameIdx = slotToGame[slot]
            if (gameIdx >= start && gameIdx <= end) {
                const entry = games.get(gameIdx)
                occupiedSlots.push(`  slot ${slot} ΓåÆ game ${gameIdx} "${truncName(entry?.gameName ?? '?')}"`)
            }
        }
        if (occupiedSlots.length > 0) {
            occupiedSlots.forEach(s => console.log(s))
        } else {
            console.log('  (no games in this range have slots)')
        }
        
        console.log('\nQueue state:')
        const queuedInRange = loadQueue.filter(idx => idx >= start && idx <= end)
        if (queuedInRange.length > 0) {
            console.log(`  Queued: ${queuedInRange.join(', ')}`)
        } else {
            console.log('  (no games in this range are queued)')
        }
        
        const loadingInRange = Array.from(loadingPromises.keys()).filter(idx => idx >= start && idx <= end)
        if (loadingInRange.length > 0) {
            console.log(`  Loading: ${loadingInRange.join(', ')}`)
        } else {
            console.log('  (no games in this range are loading)')
        }
        
        console.groupEnd()
    }

    /**
     * Diagnostic: Compare all index tracking locations
     * Returns games where there's a mismatch between tracked locations
     */
    public diagnoseIndexMismatches(): { gameIndex: number; issues: string[] }[] {
        const games = this.getGames()
        const slotToGame = this.getSlotToGame()
        const config = this.getConfig()
        const mismatches: { gameIndex: number; issues: string[] }[] = []
        
        for (const [gameIndex, entry] of games) {
            const issues: string[] = []
            
            // Check 1: If entry says it has a slot, does slotToGame agree?
            if (entry.highSlot >= 0) {
                const slotOwner = slotToGame[entry.highSlot]
                if (slotOwner !== gameIndex) {
                    issues.push(`entry.highSlot=${entry.highSlot} but slotToGame[${entry.highSlot}]=${slotOwner}`)
                }
            }
            
            // Check 2: If entry is LOADED, does it have a valid slot?
            if (entry.state === HighTextureState.LOADED && entry.highSlot < 0) {
                issues.push(`state=LOADED but highSlot=${entry.highSlot}`)
            }
            
            // Check 3: If entry is EMPTY, it shouldn't have a slot
            if (entry.state === HighTextureState.EMPTY && entry.highSlot >= 0) {
                issues.push(`state=EMPTY but highSlot=${entry.highSlot}`)
            }
            
            if (issues.length > 0) {
                mismatches.push({ gameIndex, issues })
            }
        }
        
        // Check reverse: slots that point to games that don't acknowledge them
        for (let slot = 0; slot < config.totalSlots; slot++) {
            const gameIndex = slotToGame[slot]
            if (gameIndex >= 0 && !games.has(gameIndex)) {
                mismatches.push({ 
                    gameIndex, 
                    issues: [`slot ${slot} points to game ${gameIndex} but game not registered`] 
                })
            }
        }
        
        if (mismatches.length === 0) {
            console.log('Γ£à No index mismatches found')
        } else {
            console.group(`Γ¥î Found ${mismatches.length} index mismatches`)
            for (const m of mismatches) {
                console.log(`  Game ${m.gameIndex}: ${m.issues.join(', ')}`)
            }
            console.groupEnd()
        }
        
        return mismatches
    }

    /**
     * Diagnostic: Show queue and loading state
     */
    public diagnoseLoadState(): void {
        const games = this.getGames()
        const config = this.getConfig()
        const loadQueue = this.getLoadQueue()
        const loadingPromises = this.getLoadingPromises()
        const stats = this.getInternalStats()

        console.group('≡ƒôª Load State Diagnosis')
        
        console.log(`Active loads: ${loadingPromises.size}/${config.maxConcurrentLoads}`)
        if (loadingPromises.size > 0) {
            const loading = Array.from(loadingPromises.keys())
            loading.forEach(idx => {
                const entry = games.get(idx)
                console.log(`  Loading: game ${idx} "${truncName(entry?.gameName ?? '?')}"`)
            })
        }
        
        console.log(`\nQueue length: ${loadQueue.length}`)
        if (loadQueue.length > 0) {
            const first5 = loadQueue.slice(0, 5)
            first5.forEach((idx, pos) => {
                const entry = games.get(idx)
                console.log(`  [${pos}] game ${idx} "${truncName(entry?.gameName ?? '?')}"`)
            })
            if (loadQueue.length > 5) {
                console.log(`  ... and ${loadQueue.length - 5} more`)
            }
        }
        
        console.log(`\nSlot usage: ${this.countUsedSlots()}/${config.totalSlots}`)
        console.log(`Stats: ${stats.cacheHits} hits, ${stats.cacheMisses} misses, ${stats.evictions} evictions`)
        
        console.groupEnd()
    }

    /**
     * Diagnostic: Dump full indexΓåÆgame mapping for first N entries
     */
    public dumpIndexMapping(count: number = 50): void {
        const games = this.getGames()

        console.group(`≡ƒôï Index ΓåÆ Game Mapping (first ${count})`)
        
        const entries = Array.from(games.entries())
            .sort((a, b) => a[0] - b[0])
            .slice(0, count)
        
        console.log('Index | State   | Slot | Game Name')
        console.log('------|---------|------|----------')
        for (const [idx, entry] of entries) {
            const slot = entry.highSlot >= 0 ? String(entry.highSlot).padStart(4) : '  - '
            const state = entry.state.padEnd(7)
            console.log(`${String(idx).padStart(5)} | ${state} | ${slot} | ${entry.gameName}`)
        }
        
        console.groupEnd()
    }

    // ========================================================================
    // Profiling & Timing Diagnostics  
    // ========================================================================

    /**
     * Enable detailed profiling (captures more timing data per load)
     */
    public enableProfiling(): void {
        this.setProfilingEnabled(true)
        this.clearProfilingSamples()
        console.log('≡ƒö¼ Profiling enabled - load some textures then call diagnoseProfile()')
    }
    
    /**
     * Disable profiling
     */
    public disableProfiling(): void {
        this.setProfilingEnabled(false)
        console.log('≡ƒö¼ Profiling disabled')
    }

    /**
     * Analyze detailed profiling data to identify bottlenecks
     */
    public diagnoseProfile(): void {
        const samples = this.getProfilingSamples().filter(s => s.pixelCacheHit)

        console.group('≡ƒö¼ Detailed Profiling Analysis (Main Thread Impact)')
        
        if (!this.isProfilingEnabled()) {
            console.log('ΓÜá∩╕Å Profiling not enabled. Call enableProfiling() first.')
            console.groupEnd()
            return
        }
        
        if (samples.length === 0) {
            console.log('No pixel cache HIT samples. All loads are cache misses (backgrounded).')
            console.groupEnd()
            return
        }
        
        const count = samples.length
        
        // Calculate averages
        const avgWorkerRT = samples.reduce((sum, s) => sum + s.workerRoundTrip, 0) / count
        const avgBufferCopy = samples.reduce((sum, s) => sum + s.arrayBufferCopy, 0) / count
        const avgTextureCopy = samples.reduce((sum, s) => sum + s.textureArrayCopy, 0) / count
        const avgCallback = samples.reduce((sum, s) => sum + s.callbackTime, 0) / count
        const avgMainThread = samples.reduce((sum, s) => sum + s.totalMainThread, 0) / count
        
        // Calculate max values
        const maxWorkerRT = Math.max(...samples.map(s => s.workerRoundTrip))
        const maxTextureCopy = Math.max(...samples.map(s => s.textureArrayCopy))
        const maxMainThread = Math.max(...samples.map(s => s.totalMainThread))
        
        console.log(`Samples: ${count} (pixel cache HITs only)`)
        console.log('')
        console.log('--- Average Breakdown (ms) ---')
        console.log(`  Worker round-trip (async): ${avgWorkerRT.toFixed(2)}ms`)
        console.log(`  ArrayBuffer access:       ${avgBufferCopy.toFixed(3)}ms`)
        console.log(`  Texture array .set():     ${avgTextureCopy.toFixed(2)}ms  ΓåÉ likely culprit if >1ms`)
        console.log(`  Slot callback:            ${avgCallback.toFixed(3)}ms`)
        console.log(`  ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ`)
        console.log(`  MAIN THREAD BLOCKING:     ${avgMainThread.toFixed(2)}ms`)
        console.log('')
        console.log('--- Maximum Values (worst case) ---')
        console.log(`  Worker round-trip: ${maxWorkerRT.toFixed(1)}ms`)
        console.log(`  Texture copy:      ${maxTextureCopy.toFixed(1)}ms`)
        console.log(`  Main thread:       ${maxMainThread.toFixed(1)}ms`)
        console.log('')
        
        // Identify bottleneck
        if (avgTextureCopy > avgMainThread * 0.7) {
            console.log('≡ƒÄ» BOTTLENECK: Texture array copy (.set()) dominates main thread time')
            console.log('   Mitigation: Consider chunked copying or requestIdleCallback')
        } else if (avgWorkerRT > 5) {
            console.log('≡ƒÄ» BOTTLENECK: Worker round-trip is slow (>5ms)')
            console.log('   This includes message serialization and IndexedDB read')
        } else {
            console.log('Γ£à No clear bottleneck - times look reasonable')
        }
        
        // Show worst samples
        console.log('')
        console.log('--- Slowest 5 Loads (by main thread time) ---')
        const slowest = [...samples].sort((a, b) => b.totalMainThread - a.totalMainThread).slice(0, 5)
        slowest.forEach((s, i) => {
            console.log(`  ${i + 1}. ${s.totalMainThread.toFixed(1)}ms main thread - "${truncName(s.gameName)}" (copy: ${s.textureArrayCopy.toFixed(1)}ms)`)
        })
        
        console.groupEnd()
    }

    /**
     * Show timing statistics for texture loads
     */
    public diagnoseTimings(): void {
        const timingSamples = this.getTimingSamples()
        const maxSamples = this.getMaxTimingSamples()

        console.group('ΓÅ▒∩╕Å HIGH Texture Load Timing Statistics')
        
        if (timingSamples.length === 0) {
            console.log('No timing samples recorded yet.')
            console.groupEnd()
            return
        }
        
        const count = timingSamples.length
        const pixelHits = timingSamples.filter(s => s.pixelCacheHit)
        const pixelMisses = timingSamples.filter(s => !s.pixelCacheHit)
        
        // Calculate averages
        const avgFetch = timingSamples.reduce((sum, s) => sum + s.fetchTime, 0) / count
        const avgProcess = timingSamples.reduce((sum, s) => sum + s.processTime, 0) / count
        const avgCopy = timingSamples.reduce((sum, s) => sum + s.copyTime, 0) / count
        const avgTotal = timingSamples.reduce((sum, s) => sum + s.totalTime, 0) / count
        
        // Calculate min/max
        const minTotal = Math.min(...timingSamples.map(s => s.totalTime))
        const maxTotal = Math.max(...timingSamples.map(s => s.totalTime))
        
        // Calculate percentiles (p50, p90, p99)
        const sorted = [...timingSamples].sort((a, b) => a.totalTime - b.totalTime)
        const p50 = sorted[Math.floor(count * 0.5)]?.totalTime ?? 0
        const p90 = sorted[Math.floor(count * 0.9)]?.totalTime ?? 0
        const p99 = sorted[Math.floor(count * 0.99)]?.totalTime ?? 0
        
        console.log(`Samples: ${count} (max ${maxSamples})`)
        console.log('')
        
        // Show pixel cache breakdown
        const hitPercent = count > 0 ? ((pixelHits.length / count) * 100).toFixed(1) : '0'
        console.log('--- Pixel Cache ---')
        console.log(`  ≡ƒƒó Hits:   ${pixelHits.length} (${hitPercent}%)`)
        console.log(`  ≡ƒö┤ Misses: ${pixelMisses.length}`)
        if (pixelHits.length > 0) {
            const avgHitTime = pixelHits.reduce((sum, s) => sum + s.totalTime, 0) / pixelHits.length
            console.log(`  Avg HIT time:  ${avgHitTime.toFixed(1)}ms (skips decode!)`)
        }
        if (pixelMisses.length > 0) {
            const avgMissTime = pixelMisses.reduce((sum, s) => sum + s.totalTime, 0) / pixelMisses.length
            console.log(`  Avg MISS time: ${avgMissTime.toFixed(1)}ms (includes decode)`)
        }
        console.log('')
        
        console.log('--- Average Breakdown (all) ---')
        console.log(`  Fetch (network):  ${avgFetch.toFixed(1)}ms`)
        console.log(`  Process (decode): ${avgProcess.toFixed(1)}ms`)
        console.log(`  Copy (to array):  ${avgCopy.toFixed(2)}ms`)
        console.log(`  TOTAL:            ${avgTotal.toFixed(1)}ms`)
        console.log('')
        console.log('--- Distribution (total time) ---')
        console.log(`  Min:  ${minTotal.toFixed(0)}ms`)
        console.log(`  P50:  ${p50.toFixed(0)}ms`)
        console.log(`  P90:  ${p90.toFixed(0)}ms`)
        console.log(`  P99:  ${p99.toFixed(0)}ms`)
        console.log(`  Max:  ${maxTotal.toFixed(0)}ms`)
        
        // Show slowest 5 loads
        console.log('')
        console.log('--- Slowest 5 Loads ---')
        const slowest = [...timingSamples]
            .sort((a, b) => b.totalTime - a.totalTime)
            .slice(0, 5)
        slowest.forEach((s, i) => {
            const cacheIcon = s.pixelCacheHit ? '≡ƒƒó' : '≡ƒö┤'
            console.log(`  ${i + 1}. ${cacheIcon} ${s.totalTime.toFixed(0)}ms - "${truncName(s.gameName, 25)}" (fetch: ${s.fetchTime.toFixed(0)}ms)`)
        })
        
        // Show most recent 5 loads
        console.log('')
        console.log('--- Most Recent 5 Loads ---')
        const recent = [...timingSamples].slice(-5).reverse()
        recent.forEach((s, i) => {
            const cacheIcon = s.pixelCacheHit ? '≡ƒƒó' : '≡ƒö┤'
            console.log(`  ${i + 1}. ${cacheIcon} ${s.totalTime.toFixed(0)}ms - "${truncName(s.gameName, 25)}" (game ${s.gameIndex})`)
        })
        
        console.groupEnd()
    }
    
    /**
     * Clear timing samples
     */
    public clearTimingSamples(): void {
        this.clearTimingSamplesInternal()
        console.log('Timing samples cleared.')
    }

    // ========================================================================
    // Experiments & Performance Tests
    // ========================================================================

    /**
     * EXPERIMENT: Load N textures with different concurrency limits
     * Run from console: window.experimentLoadingStrategies()
     * 
     * Tests:
     * - Single load (max 1 concurrent)
     * - Throttled load (max 2 concurrent) 
     * - Batch load (max N concurrent)
     * 
     * Measures frame time impact during loading
     */
    public async experimentLoadingStrategies(
        gameIndices: number[],
        strategies: { name: string; maxConcurrent: number }[] = [
            { name: 'single', maxConcurrent: 1 },
            { name: 'throttled', maxConcurrent: 2 },
            { name: 'batch', maxConcurrent: 8 }
        ]
    ): Promise<void> {
        const games = this.getGames()
        const config = this.getConfig()
        const loadingPromises = this.getLoadingPromises()
        const loadQueue = this.getLoadQueue()

        console.group('≡ƒº¬ Loading Strategy Experiment')
        console.log(`Testing ${gameIndices.length} textures with ${strategies.length} strategies`)
        
        const results: { name: string; totalTime: number; avgFrameImpact: string }[] = []
        
        for (const strategy of strategies) {
            // Reset - evict all textures first
            for (const gameIndex of gameIndices) {
                const entry = games.get(gameIndex)
                if (entry && entry.state === HighTextureState.LOADED) {
                    this.evictGame(gameIndex)
                }
            }
            
            // Save original config and modify
            const originalMaxConcurrent = config.maxConcurrentLoads
            ;(config as { maxConcurrentLoads: number }).maxConcurrentLoads = strategy.maxConcurrent
            
            // Track frame times during load
            const frameTimeSamples: number[] = []
            let lastFrameTime = window.performance.now()
            const frameTracker = (): void => {
                const now = window.performance.now()
                frameTimeSamples.push(now - lastFrameTime)
                lastFrameTime = now
                if (loadingPromises.size > 0 || loadQueue.length > 0) {
                    window.requestAnimationFrame(frameTracker)
                }
            }
            window.requestAnimationFrame(frameTracker)
            
            // Start loading
            const loadStart = window.performance.now()
            
            // Queue all textures
            for (const gameIndex of gameIndices) {
                this.requestHighTexture(gameIndex)
            }
            
            // Wait for all to complete
            while (loadingPromises.size > 0 || loadQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 50))
            }
            
            const totalTime = window.performance.now() - loadStart
            
            // Analyze frame impact
            const avgFrame = frameTimeSamples.length > 0 
                ? frameTimeSamples.reduce((a, b) => a + b, 0) / frameTimeSamples.length
                : 0
            const maxFrame = frameTimeSamples.length > 0 
                ? Math.max(...frameTimeSamples)
                : 0
            
            results.push({
                name: strategy.name,
                totalTime,
                avgFrameImpact: `avg: ${avgFrame.toFixed(1)}ms, max: ${maxFrame.toFixed(1)}ms (${frameTimeSamples.length} samples)`
            })
            
            console.log(`\n≡ƒôè ${strategy.name.toUpperCase()} (max ${strategy.maxConcurrent} concurrent):`)
            console.log(`   Total time: ${totalTime.toFixed(0)}ms`)
            console.log(`   Frame impact: ${results[results.length - 1].avgFrameImpact}`)
            
            // Restore config
            ;(config as { maxConcurrentLoads: number }).maxConcurrentLoads = originalMaxConcurrent
        }
        
        console.log('\n≡ƒôê SUMMARY:')
        console.table(results)
        console.groupEnd()
    }

    /**
     * Run a quick profiling test: evict N textures, then reload them while measuring frame times
     * Call from console: window.highTextureCache.runProfilingTest(10)
     * 
     * This helps identify if the remaining frame dips are from:
     * - Worker message passing
     * - ArrayBuffer copying
     * - Texture array .set() operations
     * - GPU flush operations
     */
    public async runProfilingTest(count: number = 10): Promise<void> {
        const games = this.getGames()
        const loadingPromises = this.getLoadingPromises()
        const loadQueue = this.getLoadQueue()

        console.group(`≡ƒö¼ Running Profiling Test (${count} textures)`)
        
        // Get loaded games that we can evict and reload
        const loadedGames: number[] = []
        for (const [gameIndex, entry] of games) {
            if (entry.state === HighTextureState.LOADED && loadedGames.length < count) {
                loadedGames.push(gameIndex)
            }
        }
        
        if (loadedGames.length < count) {
            console.warn(`Only ${loadedGames.length} loaded games available (requested ${count})`)
        }
        
        if (loadedGames.length === 0) {
            console.log('No loaded games to test with.')
            console.groupEnd()
            return
        }
        
        // Enable profiling
        this.enableProfiling()
        
        // Track frame times
        const frameTimeSamples: { time: number; phase: string }[] = []
        let lastFrameTime = window.performance.now()
        let currentPhase = 'idle'
        let trackingActive = true
        
        const frameTracker = (): void => {
            if (!trackingActive) return
            const now = window.performance.now()
            frameTimeSamples.push({ time: now - lastFrameTime, phase: currentPhase })
            lastFrameTime = now
            window.requestAnimationFrame(frameTracker)
        }
        window.requestAnimationFrame(frameTracker)
        
        // Phase 1: Evict all test games
        currentPhase = 'evict'
        console.log(`\n1∩╕ÅΓâú Evicting ${loadedGames.length} textures...`)
        for (const gameIndex of loadedGames) {
            this.evictGame(gameIndex)
        }
        await new Promise(r => setTimeout(r, 100)) // Let frames settle
        
        // Phase 2: Request all games (triggers reload from pixel cache)
        currentPhase = 'reload'
        console.log(`2∩╕ÅΓâú Reloading ${loadedGames.length} textures (should hit pixel cache)...`)
        const reloadStart = window.performance.now()
        
        for (const gameIndex of loadedGames) {
            this.requestHighTexture(gameIndex)
        }
        
        // Wait for loads to complete
        while (loadingPromises.size > 0 || loadQueue.length > 0) {
            await new Promise(r => setTimeout(r, 16))
        }
        
        const reloadTime = window.performance.now() - reloadStart
        
        // Phase 3: Let frames settle
        currentPhase = 'settle'
        await new Promise(r => setTimeout(r, 200))
        
        trackingActive = false
        
        // Analyze results
        console.log(`\n3∩╕ÅΓâú Analysis:`)
        console.log(`   Reload time: ${reloadTime.toFixed(0)}ms total`)
        
        // Frame time analysis by phase
        const reloadFrames = frameTimeSamples.filter(f => f.phase === 'reload')
        if (reloadFrames.length > 0) {
            const avgFrame = reloadFrames.reduce((sum, f) => sum + f.time, 0) / reloadFrames.length
            const maxFrame = Math.max(...reloadFrames.map(f => f.time))
            const slowFrames = reloadFrames.filter(f => f.time > 16.67)
            const verySlowFrames = reloadFrames.filter(f => f.time > 33.33)
            
            console.log(`\n   Frame Analysis (during reload):`)
            console.log(`     Frames:     ${reloadFrames.length}`)
            console.log(`     Average:    ${avgFrame.toFixed(1)}ms`)
            console.log(`     Maximum:    ${maxFrame.toFixed(1)}ms`)
            console.log(`     >16.67ms:   ${slowFrames.length} (dropped 60fps)`)
            console.log(`     >33.33ms:   ${verySlowFrames.length} (dropped 30fps)`)
            
            if (maxFrame > 16.67) {
                console.log(`\n   ΓÜá∩╕Å Frame dips detected! Max frame: ${maxFrame.toFixed(1)}ms`)
            } else {
                console.log(`\n   Γ£à No significant frame dips during reload`)
            }
        }
        
        // Show detailed profiling
        console.log('')
        this.diagnoseProfile()
        
        this.disableProfiling()
        console.groupEnd()
    }

    /**
     * Diagnostic: Measure the cost of various operations
     * Call from console: window.measureTextureCosts()
     */
    public measureOperationCosts(): void {
        const config = this.getConfig()
        const dataArrayTexture = this.getDataArrayTexture()

        if (!dataArrayTexture) {
            console.log('Γ¥î No texture array available')
            return
        }
        
        const width = config.textureWidth
        const height = config.textureHeight
        const sliceBytes = width * height * 4
        const totalBytes = sliceBytes * config.totalSlots
        
        console.group('≡ƒö¼ HIGH Texture Cache Operation Costs')
        console.log(`Texture array: ${width}├ù${height}├ù${config.totalSlots} = ${(totalBytes / 1024 / 1024).toFixed(1)}MB`)
        
        // Test 1: CPU array copy (single slice)
        const testData = new Uint8Array(sliceBytes)
        const arrayData = dataArrayTexture.image.data as Uint8Array
        
        const copyStart = window.performance.now()
        for (let i = 0; i < 10; i++) {
            arrayData.set(testData, 0)
        }
        const copyTime = (window.performance.now() - copyStart) / 10
        console.log(`CPU copy (${(sliceBytes / 1024).toFixed(0)}KB): ${copyTime.toFixed(2)}ms per slice`)
        
        // Test 2: Setting needsUpdate (doesn't do GPU upload, just flags)
        const flagStart = window.performance.now()
        for (let i = 0; i < 100; i++) {
            dataArrayTexture.needsUpdate = true
        }
        const flagTime = (window.performance.now() - flagStart) / 100
        console.log(`needsUpdate flag: ${flagTime.toFixed(4)}ms (negligible)`)
        
        // Note about GPU upload
        console.log(`ΓÜá∩╕Å GPU upload happens on render - can't measure directly here`)
        console.log(`   The upload transfers the ENTIRE ${(totalBytes / 1024 / 1024).toFixed(1)}MB array to GPU`)
        console.log(`   This is the likely source of lag spikes`)
        
        console.log('\n≡ƒôè Current stats:', this.getStats())
        console.groupEnd()
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    /**
     * Count used slots (for debug display)
     */
    private countUsedSlots(): number {
        return this.getSlotToGame().filter(g => g >= 0).length
    }
}

/* eslint-enable @typescript-eslint/no-explicit-any */