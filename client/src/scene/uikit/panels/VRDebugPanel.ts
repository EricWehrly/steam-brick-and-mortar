/**
 * VR port of DebugPanel (client/src/ui/pause/panels/DebugPanel.ts) - Story 5 of
 * docs/plans/vr-uikit-menu-migration-plan.md, first "action/data-shaped" panel migrated (the
 * debug/cache/controls exclusion was reversed 2026-08-20 - see that plan's "Tab order & scope
 * pivot"). Read-only stats display: reuses DebugStatsProvider unmodified (it already reads
 * scene/renderer from DataManager and only needs a PerformanceMonitorUI, which SystemUICoordinator
 * now also publishes to DataManager under DataKey.PerformanceMonitor for exactly this lookup - the
 * same lazy-resolve idiom VRSettingsPanelCoordinator already uses for scene/camera).
 *
 * Deliberately no auto-refresh interval (unlike the DOM panel's onShow/onHide-gated one):
 * VRMenuTabContent/VRSettingsMenuShell have no teardown hook for outgoing tab content today (tabs
 * are rebuilt fresh on every select via tab.build(), but the shell never calls anything on the
 * content it's replacing - see VRSettingsMenuShell.showTab()), so a self-started interval here
 * would leak forever the moment you switch away from this tab. Manual Refresh button only for this
 * first pass; a real dispose lifecycle through the shell is its own follow-up if live auto-refresh
 * turns out to matter in VR.
 *
 * Console capture/clear and JSON export (the DOM panel's other two features) are intentionally
 * left out entirely, not placeholder-stubbed - a DOM file download and a DOM textContent console
 * log don't have a VR equivalent worth faking. CacheManagementPanel (next in the migration order)
 * is where the "to be implemented" placeholder pattern gets its real pilot, not here.
 */

import { Container, Text } from '@pmndrs/uikit'
import { Button } from '@pmndrs/uikit-default'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey } from '../../../core/data/DataTypes'
import { DebugStatsProvider } from '../../../ui/pause/panels/DebugStatsProvider'
import type { DebugStats } from '../../../ui/pause/panels/DebugStatsProvider'
import type { PerformanceMonitorUI } from '../../../ui/PerformanceMonitor'
import { toUikitSafeText } from '../UikitTextSanitizer'

const PANEL_PADDING = 20
const SECTION_GAP = 16
const ROW_GAP = 4
const TITLE_FONT_SIZE = 18
const SECTION_HEADING_FONT_SIZE = 13
const SECTION_HEADING_COLOR = '#aac4ff'
const ROW_LABEL_FONT_SIZE = 13
const ROW_LABEL_COLOR = '#9a9a9a'
const ROW_VALUE_COLOR = '#e8e8e8'
const SCROLL_HEIGHT = 460
const LOADING_TEXT = 'loading...'
// Mirrors DebugPanel.getPerformanceClass()'s good/caution/warning thresholds and traffic-light intent.
const GOOD_COLOR = '#7ed957'
const CAUTION_COLOR = '#e0c15a'
const WARNING_COLOR = '#e05a5a'

interface StatRowSpec {
    readonly key: keyof typeof ROW_FORMATTERS
    readonly label: string
}

type StatsProvider = Pick<DebugStatsProvider, 'getDebugStats'>

/** One formatter per row, reading the full DebugStats so cross-field ratios (memory%, quota%)
 *  don't need a second lookup path - each returns the display string and an optional traffic-light
 *  color override (undefined = ROW_VALUE_COLOR). */
const ROW_FORMATTERS = {
    total: (s: DebugStats) => text(s.sceneObjects.total),
    meshes: (s: DebugStats) => text(s.sceneObjects.meshes),
    lights: (s: DebugStats) => text(s.sceneObjects.lights),
    cameras: (s: DebugStats) => text(s.sceneObjects.cameras),
    textures: (s: DebugStats) => text(s.sceneObjects.textures),
    materials: (s: DebugStats) => text(s.sceneObjects.materials),
    geometries: (s: DebugStats) => text(s.sceneObjects.geometries),
    fps: (s: DebugStats) => ({
        value: s.performance.fps.toFixed(1),
        color: s.performance.fps < 30 ? WARNING_COLOR : s.performance.fps < 45 ? CAUTION_COLOR : GOOD_COLOR
    }),
    frameTime: (s: DebugStats) => text(`${s.performance.frameTime.toFixed(2)}ms`),
    memoryUsed: (s: DebugStats) => {
        const percent = s.performance.memoryTotal > 0 ? s.performance.memoryUsed / s.performance.memoryTotal : 0
        return { value: formatBytes(s.performance.memoryUsed), color: memoryColor(percent) }
    },
    memoryTotal: (s: DebugStats) => text(formatBytes(s.performance.memoryTotal)),
    triangles: (s: DebugStats) => text(s.performance.triangles.toLocaleString()),
    drawCalls: (s: DebugStats) => ({
        value: String(s.performance.drawCalls),
        color: s.performance.drawCalls > 1000 ? WARNING_COLOR : s.performance.drawCalls > 500 ? CAUTION_COLOR : GOOD_COLOR
    }),
    imageCount: (s: DebugStats) => text(s.cache.imageCount),
    imageCacheSize: (s: DebugStats) => text(formatBytes(s.cache.imageCacheSize)),
    gameDataCount: (s: DebugStats) => text(s.cache.gameDataCount),
    gameDataSize: (s: DebugStats) => text(formatBytes(s.cache.gameDataSize)),
    quota: (s: DebugStats) => {
        const percent = s.cache.quotaTotal > 0 ? s.cache.quotaUsed / s.cache.quotaTotal : 0
        const value = `${formatBytes(s.cache.quotaUsed)} / ${formatBytes(s.cache.quotaTotal)} (${(percent * 100).toFixed(1)}%)`
        return { value, color: memoryColor(percent) }
    },
    webxrSupported: (s: DebugStats) => text(s.system.webxrSupported ? 'Available' : 'Not available'),
    webglVersion: (s: DebugStats) => text(s.system.webglVersion),
    maxTextureSize: (s: DebugStats) => text(`${s.system.maxTextureSize}px`),
    vendor: (s: DebugStats) => text(s.system.vendor),
    renderer: (s: DebugStats) => text(s.system.renderer)
} satisfies Record<string, (stats: DebugStats) => { value: string; color?: string }>

function text(value: string | number): { value: string; color?: string } {
    return { value: String(value) }
}

function memoryColor(percent: number): string {
    if (percent > 0.9) return WARNING_COLOR
    if (percent > 0.7) return CAUTION_COLOR
    return GOOD_COLOR
}

function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

const SECTIONS: ReadonlyArray<{ readonly heading: string; readonly rows: readonly StatRowSpec[] }> = [
    {
        heading: 'Scene Objects', rows: [
            { key: 'total', label: 'Total' }, { key: 'meshes', label: 'Meshes' },
            { key: 'lights', label: 'Lights' }, { key: 'cameras', label: 'Cameras' },
            { key: 'textures', label: 'Textures' }, { key: 'materials', label: 'Materials' },
            { key: 'geometries', label: 'Geometries' }
        ]
    },
    {
        heading: 'Performance', rows: [
            { key: 'fps', label: 'FPS' }, { key: 'frameTime', label: 'Frame Time' },
            { key: 'memoryUsed', label: 'Memory Used' }, { key: 'memoryTotal', label: 'Memory Total' },
            { key: 'triangles', label: 'Triangles' }, { key: 'drawCalls', label: 'Draw Calls' }
        ]
    },
    {
        heading: 'Cache', rows: [
            { key: 'imageCount', label: 'Images' }, { key: 'imageCacheSize', label: 'Image Cache' },
            { key: 'gameDataCount', label: 'Game Data' }, { key: 'gameDataSize', label: 'Game Data Size' },
            { key: 'quota', label: 'Storage Quota' }
        ]
    },
    {
        heading: 'System', rows: [
            { key: 'webxrSupported', label: 'WebXR' }, { key: 'webglVersion', label: 'WebGL' },
            { key: 'maxTextureSize', label: 'Max Texture' }, { key: 'vendor', label: 'Vendor' },
            { key: 'renderer', label: 'Renderer' }
        ]
    }
]

export class VRDebugPanel {
    readonly container: Container

    private readonly valueTexts = new Map<string, Text>()
    private refreshing = false

    /** createStatsProvider is injectable (defaulting to the real DebugStatsProvider) for the same
     *  reason VRSettingsPanelCoordinator's forwardEvents param is - DebugStatsProvider's real
     *  getDebugStats() does a dynamic PixelDataCache import and a navigator.storage.estimate()
     *  call that unit tests shouldn't need to exercise for granted, only substitute. */
    constructor(private readonly createStatsProvider: (pm: PerformanceMonitorUI) => StatsProvider = pm => new DebugStatsProvider(pm)) {
        this.container = this.build()
        void this.refresh()
    }

    private build(): Container {
        const root = new Container({ flexDirection: 'column', gap: ROW_GAP, padding: PANEL_PADDING, width: '100%' })
        root.add(new Text({ text: 'Debug', fontSize: TITLE_FONT_SIZE, color: '#ffffff' }))

        const scroll = new Container({
            flexDirection: 'column',
            gap: SECTION_GAP,
            width: '100%',
            height: SCROLL_HEIGHT,
            overflow: 'scroll'
        })
        for (const section of SECTIONS) {
            scroll.add(this.buildSection(section.heading, section.rows))
        }
        root.add(scroll)

        const refreshButton = new Button({ variant: 'secondary', onClick: () => void this.refresh() })
        refreshButton.add(new Text({ text: 'Refresh', color: '#ffffff' }))
        root.add(refreshButton)

        return root
    }

    private buildSection(heading: string, rows: readonly StatRowSpec[]): Container {
        const section = new Container({ flexDirection: 'column', gap: ROW_GAP, width: '100%' })
        section.add(new Text({ text: heading.toUpperCase(), fontSize: SECTION_HEADING_FONT_SIZE, color: SECTION_HEADING_COLOR }))
        for (const row of rows) {
            section.add(this.buildRow(row))
        }
        return section
    }

    private buildRow(row: StatRowSpec): Container {
        const line = new Container({ flexDirection: 'row', justifyContent: 'space-between', width: '100%' })
        line.add(new Text({ text: row.label, fontSize: ROW_LABEL_FONT_SIZE, color: ROW_LABEL_COLOR }))
        const valueText = new Text({ text: LOADING_TEXT, fontSize: ROW_LABEL_FONT_SIZE, color: ROW_VALUE_COLOR })
        this.valueTexts.set(row.key, valueText)
        line.add(valueText)
        return line
    }

    private async refresh(): Promise<void> {
        if (this.refreshing) {
            return
        }
        this.refreshing = true
        try {
            const performanceMonitor = DataManager.getInstance().get<PerformanceMonitorUI>(DataKey.PerformanceMonitor) ?? null
            if (!performanceMonitor) {
                // Not published yet (panel opened before SystemUICoordinator finished
                // constructing) - rows stay at LOADING_TEXT until the next Refresh press.
                return
            }
            const stats = await this.createStatsProvider(performanceMonitor).getDebugStats()
            this.applyStats(stats)
        } finally {
            this.refreshing = false
        }
    }

    private applyStats(stats: DebugStats): void {
        for (const [key, valueText] of this.valueTexts) {
            const formatter = ROW_FORMATTERS[key as keyof typeof ROW_FORMATTERS]
            const { value, color } = formatter(stats)
            valueText.setProperties({ text: toUikitSafeText(value), color: color ?? ROW_VALUE_COLOR })
        }
    }
}
