/**
 * Self-driving frame-budget sweep, triggered by ?sweep=1 (implies ?diagnostics=1).
 *
 * Exists because driving this from outside the page (browser automation applying settings
 * and reading window.renderLoopDiagnostics) depends on the tab being genuinely visible and
 * focused for requestAnimationFrame to fire at all — a real Chrome policy, not something app
 * code can route around. Running the whole sweep from inside the page means it only needs a
 * human to open the URL in a real, focused tab and wait — no external driver required.
 *
 * See docs/architecture/frame-budget-capture-tooling.md for the capture tool and methodology
 * this builds on, and docs/plans/framerate-regression-investigation-plan.md for prior findings.
 */

import { AppSettings, type ApplicationSettings } from '../core/AppSettings'
import { RenderLoopDiagnostics } from './RenderLoopDiagnostics'

const SETTLE_MS = 2000
const HOLD_MS = 4000

export interface PerfSweepResult {
    readonly label: string
    readonly avgFrameTime: number
    readonly avgFps: number
    readonly avgWorkTime: number
    readonly stddevFrameTime: number
    readonly maxFrameTime: number
    readonly jitterEventCount: number
    readonly slowFrameCount: number
}

interface PerfSweepConfig {
    readonly label: string
    readonly overrides: Partial<ApplicationSettings>
}

/** Everything held fixed while one setting varies — matches the app's shipped defaults, so
 *  each sweep isolates exactly one setting's cost against the same reference point. */
const BASELINE_OVERRIDES: Partial<ApplicationSettings> = {
    lightingQuality: 'enhanced',
    shadowQuality: 2,
    shadowMapEnabled: true,
    ssaoQuality: 1,
    smaaPreset: 'high',
    msaaLevel: 'low',
    pixelRatioScale: 1,
}

/** One setting varied per group, others held at BASELINE_OVERRIDES. ssaoQuality is
 *  deliberately not swept here — already measured via GpuTimerQuery in the framerate
 *  investigation (see that plan doc's Finding 6 / Implementation table); re-measuring it
 *  here would just duplicate that data under a coarser (no real-GPU-timing) instrument. */
const SWEEP_CONFIGS: readonly PerfSweepConfig[] = [
    { label: 'baseline (current defaults)', overrides: {} },

    { label: 'lightingQuality=simple', overrides: { lightingQuality: 'simple' } },
    { label: 'lightingQuality=advanced', overrides: { lightingQuality: 'advanced' } },
    { label: 'lightingQuality=ouch-my-eyes', overrides: { lightingQuality: 'ouch-my-eyes' } },

    { label: 'shadowQuality=1 (low)', overrides: { shadowQuality: 1 } },
    { label: 'shadowQuality=3 (high)', overrides: { shadowQuality: 3 } },
    { label: 'shadowQuality=4 (ultra, VSM)', overrides: { shadowQuality: 4 } },

    { label: 'smaaPreset=low', overrides: { smaaPreset: 'low' } },
    { label: 'smaaPreset=medium', overrides: { smaaPreset: 'medium' } },
    { label: 'smaaPreset=ultra', overrides: { smaaPreset: 'ultra' } },

    { label: 'msaaLevel=medium', overrides: { msaaLevel: 'medium' } },
    { label: 'msaaLevel=high', overrides: { msaaLevel: 'high' } },
    { label: 'msaaLevel=ultra', overrides: { msaaLevel: 'ultra' } },

    { label: 'pixelRatioScale=0.75', overrides: { pixelRatioScale: 0.75 } },
    { label: 'pixelRatioScale=1.5', overrides: { pixelRatioScale: 1.5 } },
    { label: 'pixelRatioScale=2.0', overrides: { pixelRatioScale: 2.0 } },
]

export class PerfSweep {
    private static running = false

    /**
     * Runs every config in SWEEP_CONFIGS, settling then capturing each, and restores the
     * settings that were active before the sweep started. Requires RenderLoopDiagnostics to
     * already be initialized+enabled (see SteamBrickAndMortarApp.startRenderLoop) — reports
     * a warning and skips a config rather than throwing if it isn't.
     */
    public static async run(): Promise<PerfSweepResult[]> {
        if (PerfSweep.running) {
            console.warn('🧪 [PerfSweep] Already running, ignoring duplicate trigger')
            return []
        }
        PerfSweep.running = true

        const appSettings = AppSettings.getInstance()
        const originalSettings = appSettings.getAllSettings()
        const results: PerfSweepResult[] = []
        const totalSeconds = ((SETTLE_MS + HOLD_MS) * SWEEP_CONFIGS.length) / 1000

        console.log(`🧪 [PerfSweep] Starting — ${SWEEP_CONFIGS.length} configs, ~${totalSeconds.toFixed(0)}s total. Leave this tab focused and visible.`)

        try {
            for (const config of SWEEP_CONFIGS) {
                appSettings.updateSettings({ ...BASELINE_OVERRIDES, ...config.overrides })
                await PerfSweep.sleep(SETTLE_MS)

                RenderLoopDiagnostics.startCapture()
                await PerfSweep.sleep(HOLD_MS)
                const report = RenderLoopDiagnostics.report()

                if (!report) {
                    console.warn(`⚠️ [PerfSweep] No report for '${config.label}' — is ?diagnostics=1 active?`)
                    continue
                }

                const result: PerfSweepResult = {
                    label: config.label,
                    avgFrameTime: report.avgFrameTime,
                    avgFps: report.avgFrameTime > 0 ? parseFloat((1000 / report.avgFrameTime).toFixed(1)) : 0,
                    avgWorkTime: report.avgWorkTime,
                    stddevFrameTime: report.stddevFrameTime,
                    maxFrameTime: report.maxFrameTime,
                    jitterEventCount: report.jitterEventCount,
                    slowFrameCount: report.slowFrameCount,
                }
                results.push(result)
                console.log(`✅ [PerfSweep] ${config.label}: ${result.avgFrameTime}ms avg (~${result.avgFps}fps)`)
            }
        } finally {
            appSettings.updateSettings(originalSettings)
            PerfSweep.running = false
        }

        console.table(results)
        ;(window as unknown as { __perfSweepResults: PerfSweepResult[] }).__perfSweepResults = results
        console.log('🧪 [PerfSweep] Done — settings restored. Copy results with: JSON.stringify(window.__perfSweepResults)')

        return results
    }

    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
