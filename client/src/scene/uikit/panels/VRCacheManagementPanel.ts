/**
 * VR port of CacheManagementPanel (client/src/ui/pause/panels/CacheManagementPanel.ts) - Story 5 of
 * docs/plans/vr-uikit-menu-migration-plan.md.
 *
 * Domain survey of the DOM original (direct request, before building anything) - not everything it
 * renders is real:
 *   - KEPT - genuinely live/functional in the DOM panel: image count + storage quota stats,
 *     Refresh, Clear Cache (destructive), and the cached-users list + Load.
 *   - DROPPED - dead or non-functional even on the DOM side, not just "hard to port":
 *     `force-update-cache-btn` is rendered but never wired to a handler in the DOM panel's own
 *     `attachEvents()`; `validate-cache-btn` is a TODO stub that only re-runs the same stats
 *     refresh Refresh already does ("PixelDataCache doesn't have validation yet"); `download-missing-btn`
 *     is permanently `disabled` in the template and its handler is a fake `setTimeout` with no real
 *     download; the three "cache settings" (auto-download toggle, cache-limit input, preload
 *     toggle) write to a `localStorage['cache-settings']` key that nothing else in the codebase
 *     reads - they persist a setting no code path acts on. None of these are placeholder-worthy
 *     the way the migration plan's "to be implemented" pattern intends (that pattern is for real
 *     DOM functionality VR can't trivially reach yet) - there's no real DOM behavior behind them to
 *     eventually surface.
 *   - "Last Updated" is kept but noted as low-value: it's not a real cache timestamp, just
 *     `new Date()` stamped at whichever moment stats were last refreshed.
 *
 * Image cache vs. cached-user library data are two distinct domains sharing one DOM panel by
 * legacy convenience, not by anything in common - direct request: give each its own heading and
 * controls (a divider between them) rather than one shared Refresh/Clear Cache row at the bottom
 * that reads as applying to both, when both buttons only ever touch the image cache.
 *
 * Clear Cache confirm: the DOM panel uses `window.confirm()`, which doesn't work inside an
 * immersive WebXR session (blocks the main thread, can't render over the XR canvas) - this tab
 * only ever shows in VR (flatscreen still gets the DOM menu). Cheapest real alternative: a two-step
 * arm/confirm on the button itself (see armClear() below) rather than building a modal/dialog
 * system for this one confirmation.
 */

import { Container, Text } from '@pmndrs/uikit'
import { Button } from '@pmndrs/uikit-default'
import { COLOR_TOKENS } from '../../../ui/ColorTokens'
import { PixelDataCache } from '../../../scene/game-box/instancing/PixelDataCache'
import { SteamApiClient } from '../../../steam/SteamApiClient'
import { EventManager, EventSource } from '../../../core/EventManager'
import { SteamEventTypes } from '../../../types/InteractionEvents'
import type { SteamCacheClearEvent, SteamImageCacheClearEvent, SteamLoadLibraryEvent } from '../../../types/InteractionEvents'
import { formatBytes } from '../../../utils/FormatBytes'

const PANEL_PADDING = 20
const TITLE_FONT_SIZE = 18
const SECTION_GAP = 16
const ROW_GAP = 6
const HEADING_FONT_SIZE = 13
const ROW_LABEL_FONT_SIZE = 13
const CARD_PADDING = 14
const CARD_BACKGROUND = COLOR_TOKENS.surface2
const CARD_RADIUS = 10
const DIVIDER_HEIGHT = 1
const USERS_LIST_HEIGHT = 140
const LOADING_TEXT = 'loading...'
const EMPTY_USERS_TEXT = 'No cached users found'
const REFRESH_LABEL = 'Refresh'
const CLEAR_LABEL = 'Clear Cache'
const CLEAR_CONFIRM_LABEL = 'Confirm Clear?'
// How long the Clear button stays armed before silently reverting - long enough to genuinely
// look at and press a second time, short enough that walking away doesn't leave it primed.
const CLEAR_ARM_TIMEOUT_MS = 4000
const LOAD_LABEL = 'Load'

export class VRCacheManagementPanel {
    readonly container: Container

    private readonly imageCountValue: Text
    private readonly storageQuotaValue: Text
    private readonly lastUpdateValue: Text
    private readonly usersListContainer: Container
    private readonly eventManager = EventManager.getInstance()

    private clearArmed = false
    private clearArmTimeout: ReturnType<typeof setTimeout> | null = null
    private clearButtonLabel!: Text

    constructor() {
        const built = this.build()
        this.container = built.container
        this.imageCountValue = built.imageCountValue
        this.storageQuotaValue = built.storageQuotaValue
        this.lastUpdateValue = built.lastUpdateValue
        this.usersListContainer = built.usersListContainer

        void this.refreshStats()
        void this.refreshCachedUsers()
    }

    private build(): {
        container: Container
        imageCountValue: Text
        storageQuotaValue: Text
        lastUpdateValue: Text
        usersListContainer: Container
    } {
        const root = new Container({ flexDirection: 'column', gap: SECTION_GAP, padding: PANEL_PADDING, width: '100%' })
        root.add(new Text({ text: 'Cache', fontSize: TITLE_FONT_SIZE, color: COLOR_TOKENS.textPrimary }))

        // Two distinct data domains sharing one panel by DOM legacy convenience, not by anything
        // in common - image cache (PixelDataCache) and per-user library cache (SteamApiClient) -
        // direct request: give each its own heading/controls instead of one shared actions row
        // that reads as applying to both.
        root.add(this.buildSectionHeading('Image Cache'))
        const stats = this.buildStatsCard()
        root.add(stats.card)
        root.add(this.buildImageCacheActionsRow())

        root.add(this.buildDivider())

        root.add(this.buildSectionHeading('Load from Cached Users'))
        const usersListContainer = this.buildUsersList()
        root.add(usersListContainer)

        return {
            container: root,
            imageCountValue: stats.imageCountValue,
            storageQuotaValue: stats.storageQuotaValue,
            lastUpdateValue: stats.lastUpdateValue,
            usersListContainer
        }
    }

    private buildSectionHeading(text: string): Text {
        return new Text({ text: text.toUpperCase(), fontSize: HEADING_FONT_SIZE, color: COLOR_TOKENS.accent })
    }

    private buildStatsCard(): { card: Container; imageCountValue: Text; storageQuotaValue: Text; lastUpdateValue: Text } {
        const card = new Container({
            flexDirection: 'column',
            gap: ROW_GAP,
            width: '100%',
            padding: CARD_PADDING,
            backgroundColor: CARD_BACKGROUND,
            borderRadius: CARD_RADIUS
        })

        const imageCountValue = this.buildStatRow(card, 'Images Cached', LOADING_TEXT)
        const storageQuotaValue = this.buildStatRow(card, 'Storage Quota', LOADING_TEXT)
        const lastUpdateValue = this.buildStatRow(card, 'Last Updated', 'Never')

        return { card, imageCountValue, storageQuotaValue, lastUpdateValue }
    }

    private buildStatRow(card: Container, label: string, initialValue: string): Text {
        const row = new Container({ flexDirection: 'row', justifyContent: 'space-between', width: '100%' })
        row.add(new Text({ text: label, fontSize: ROW_LABEL_FONT_SIZE, color: COLOR_TOKENS.textSecondary }))
        const valueText = new Text({ text: initialValue, fontSize: ROW_LABEL_FONT_SIZE, color: COLOR_TOKENS.textPrimary })
        row.add(valueText)
        card.add(row)
        return valueText
    }

    private buildDivider(): Container {
        return new Container({ width: '100%', height: DIVIDER_HEIGHT, backgroundColor: COLOR_TOKENS.border })
    }

    private buildUsersList(): Container {
        return new Container({
            flexDirection: 'column',
            gap: ROW_GAP,
            width: '100%',
            height: USERS_LIST_HEIGHT,
            overflow: 'scroll'
        })
    }

    private buildImageCacheActionsRow(): Container {
        const row = new Container({ flexDirection: 'row', gap: ROW_GAP, width: '100%' })

        const refreshButton = new Button({ variant: 'secondary', onClick: () => void this.refreshStats() })
        refreshButton.add(new Text({ text: REFRESH_LABEL, color: COLOR_TOKENS.textPrimary }))
        row.add(refreshButton)

        const clearButton = new Button({ variant: 'destructive', onClick: () => this.handleClearClick() })
        this.clearButtonLabel = new Text({ text: CLEAR_LABEL, color: COLOR_TOKENS.textPrimary })
        clearButton.add(this.clearButtonLabel)
        row.add(clearButton)

        return row
    }

    /** First press arms (relabels + starts the auto-revert timeout, same-shape debounce as
     *  PauseMenuManager's own suppressNextCancelClose); a second press while armed - the only time
     *  this actually clears anything - fires it for real. */
    private handleClearClick(): void {
        if (!this.clearArmed) {
            this.armClear()
            return
        }
        this.disarmClear()
        this.clearCache()
    }

    private armClear(): void {
        this.clearArmed = true
        this.clearButtonLabel.setProperties({ text: CLEAR_CONFIRM_LABEL })
        this.clearArmTimeout = setTimeout(() => this.disarmClear(), CLEAR_ARM_TIMEOUT_MS)
    }

    private disarmClear(): void {
        this.clearArmed = false
        this.clearButtonLabel.setProperties({ text: CLEAR_LABEL })
        if (this.clearArmTimeout !== null) {
            clearTimeout(this.clearArmTimeout)
            this.clearArmTimeout = null
        }
    }

    private clearCache(): void {
        this.eventManager.emit<SteamCacheClearEvent>(SteamEventTypes.CacheClear, { scope: 'all', source: EventSource.UI })
        this.eventManager.emit<SteamImageCacheClearEvent>(SteamEventTypes.ImageCacheClear, { source: EventSource.UI })
        void this.refreshStats()
    }

    private async refreshStats(): Promise<void> {
        const [pixelStats, storageEstimate] = await Promise.all([
            PixelDataCache.getInstance().getStorageEstimate(),
            this.getStorageEstimate()
        ])

        this.imageCountValue.setProperties({ text: String(pixelStats.count) })
        this.storageQuotaValue.setProperties({ text: this.formatQuota(storageEstimate) })
        this.lastUpdateValue.setProperties({ text: new Date().toLocaleString() })
    }

    /** Same navigator.storage.estimate() the DOM panel reads - not every environment implements
     *  it (see DebugStatsProvider's identical guard), so this mirrors that fallback rather than
     *  assuming it exists. */
    private async getStorageEstimate(): Promise<{ used: number; quota: number } | null> {
        if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
            return null
        }
        const estimate = await navigator.storage.estimate()
        return { used: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
    }

    private formatQuota(estimate: { used: number; quota: number } | null): string {
        if (!estimate) {
            return 'Not available'
        }
        return `${formatBytes(estimate.used)} / ${formatBytes(estimate.quota)}`
    }

    private async refreshCachedUsers(): Promise<void> {
        const users = SteamApiClient.getInstance().getCachedUsers();
        [...this.usersListContainer.children].forEach(child => child.removeFromParent())

        if (users.length === 0) {
            this.usersListContainer.add(new Text({ text: EMPTY_USERS_TEXT, fontSize: ROW_LABEL_FONT_SIZE, color: COLOR_TOKENS.textTertiary }))
            return
        }

        for (const user of users) {
            this.usersListContainer.add(this.buildUserRow(user))
        }
    }

    private buildUserRow(user: { vanityUrl: string; displayName: string; gameCount: number }): Container {
        const row = new Container({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' })
        row.add(new Text({
            text: `${user.displayName} (${user.gameCount} games)`,
            fontSize: ROW_LABEL_FONT_SIZE,
            color: COLOR_TOKENS.textPrimary
        }))

        const loadButton = new Button({
            variant: 'secondary',
            onClick: () => this.eventManager.emit<SteamLoadLibraryEvent>(SteamEventTypes.LoadLibrary, {
                userInput: user.vanityUrl,
                source: EventSource.UI
            })
        })
        loadButton.add(new Text({ text: LOAD_LABEL, color: COLOR_TOKENS.textPrimary }))
        row.add(loadButton)

        return row
    }
}
