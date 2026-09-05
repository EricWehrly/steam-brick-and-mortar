/**
 * VR port of CacheManagementPanel (client/src/ui/pause/panels/CacheManagementPanel.ts) - Story 5 of
 * docs/plans/vr-uikit-menu-migration-plan.md.
 *
 * PASS 1 (layout only, this commit): structure and static placeholder text for the rows below.
 * No live data, no click handlers beyond no-ops - see each row's own comment for what pass 2/3
 * still needs to do. Deliberately stopping here for review before wiring anything real, per
 * direct request: lay out what's kept/dropped first, discuss, then wire values and interactivity.
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
 * Open design question for review, not resolved here: the DOM panel's Clear Cache uses
 * `window.confirm()`, which doesn't work inside an immersive WebXR session (blocks the main thread,
 * can't render over the XR canvas) - this tab only ever shows in VR (flatscreen still gets the DOM
 * menu), so it needs a different confirm affordance. Not built in this pass; see clear button below.
 */

import { Container, Text } from '@pmndrs/uikit'
import { Button } from '@pmndrs/uikit-default'
import { COLOR_TOKENS } from '../../../ui/ColorTokens'

const PANEL_PADDING = 20
const TITLE_FONT_SIZE = 18
const SECTION_GAP = 16
const ROW_GAP = 6
const HEADING_FONT_SIZE = 13
const ROW_LABEL_FONT_SIZE = 13
const CARD_PADDING = 14
const CARD_BACKGROUND = COLOR_TOKENS.surface2
const CARD_RADIUS = 10
const USERS_LIST_HEIGHT = 140
const LOADING_TEXT = 'loading...'

export class VRCacheManagementPanel {
    readonly container: Container

    private readonly imageCountValue: Text
    private readonly storageQuotaValue: Text
    private readonly lastUpdateValue: Text
    private readonly usersListContainer: Container

    constructor() {
        const built = this.build()
        this.container = built.container
        this.imageCountValue = built.imageCountValue
        this.storageQuotaValue = built.storageQuotaValue
        this.lastUpdateValue = built.lastUpdateValue
        this.usersListContainer = built.usersListContainer
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

        const stats = this.buildStatsCard()
        root.add(stats.card)

        root.add(this.buildSectionHeading('Load from Cached Users'))
        const usersListContainer = this.buildUsersListPlaceholder()
        root.add(usersListContainer)

        root.add(this.buildActionsRow())

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

        // Pass 2 wires these three from PixelDataCache.getStorageEstimate() (count) and
        // navigator.storage.estimate() (quota) - same sources the DOM panel already reads, no new
        // data plumbing needed. "Last Updated" kept per the domain survey above, low-value as-is.
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

    /** Pass 1 shows the DOM panel's own empty-state copy ("No cached users found") - pass 2
     *  replaces this with one row per SteamApiClient.getCachedUsers() entry, each with its own
     *  inline Load button rather than porting the DOM's separate <select> + button as two pieces -
     *  cheaper than building a new select-style row helper for this one panel's sake. */
    private buildUsersListPlaceholder(): Container {
        const list = new Container({
            flexDirection: 'column',
            gap: ROW_GAP,
            width: '100%',
            height: USERS_LIST_HEIGHT,
            overflow: 'scroll'
        })
        list.add(new Text({ text: 'No cached users found', fontSize: ROW_LABEL_FONT_SIZE, color: COLOR_TOKENS.textTertiary }))
        return list
    }

    private buildActionsRow(): Container {
        const row = new Container({ flexDirection: 'row', gap: ROW_GAP, width: '100%' })

        // Pass 2: onClick re-reads stats the same way the DOM panel's refreshCache() does.
        const refreshButton = new Button({ variant: 'secondary', onClick: () => {} })
        refreshButton.add(new Text({ text: 'Refresh', color: COLOR_TOKENS.textPrimary }))
        row.add(refreshButton)

        // Pass 2/3: needs a VR-appropriate confirm step before this actually clears anything -
        // window.confirm() (what the DOM panel uses) doesn't work in an immersive session. Left as
        // a plain, unconfirmed no-op for pass 1 - see this file's top comment.
        const clearButton = new Button({ variant: 'destructive', onClick: () => {} })
        clearButton.add(new Text({ text: 'Clear Cache', color: COLOR_TOKENS.textPrimary }))
        row.add(clearButton)

        return row
    }
}
