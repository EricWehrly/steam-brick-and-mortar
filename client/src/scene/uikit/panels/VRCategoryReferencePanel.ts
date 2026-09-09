/**
 * VR port of CategoryReferencePanel (client/src/ui/CategoryReferencePanel.ts). Renders the same
 * STEAM_GENRE_CATEGORIES/META_CATEGORIES/SORT_DIMENSIONS data the DOM panel exports, rather than
 * re-hardcoding it - same "one source, two renderers" reasoning as SettingsSchema, just without a
 * shared schema type since this content is read-only reference data, not editable settings.
 *
 * Owns its own root styling (background/border-radius/depthTest/renderOrder/pixelSize) rather than
 * inheriting it from a shared shell - it's not a tab inside VRSettingsMenuShell. Originally tried
 * as a tab there, piloting `world-lock` anchoring on the whole settings menu; that was a
 * misunderstanding (direct correction, 2026-08-20) - the trial was meant to place *this* panel as
 * its own standalone world-positioned object, leaving the settings menu on `camera-attached` as
 * before. See VRCategoryReferenceCoordinator.ts, which owns that placement.
 *
 * pixelSize is computed via resolveShellPixelSize(appSettings) (VRSettingsMenuShell.ts) rather
 * than a bare constant, so this panel respects the Display/UI tab's UI Font Scale slider like
 * every other standalone uikit root.
 */

import { Container, Text } from '@pmndrs/uikit'
import { STEAM_GENRE_CATEGORIES, META_CATEGORIES, SORT_DIMENSIONS, type CategoryEntry } from '../../../ui/CategoryReferencePanel'
import { toUikitSafeText } from '../UikitTextSanitizer'
import { COLOR_TOKENS } from '../../../ui/ColorTokens'
import { AppSettings } from '../../../core/AppSettings'
import { MENU_CLASS } from '../VRMenuStyleSheet'
import { resolveMenuPixelSize } from '../VRMenuPixelSize'

const PANEL_WIDTH = 480
const SCROLL_HEIGHT = 460

/** Which stylesheet entry paints a row's status - the colors themselves live in
 *  VRMenuStyleSheet.ts, same as .cat-row--<status> lives in category-reference-panel.css. */
const STATUS_CLASS: Record<CategoryEntry['status'], string> = {
    live: MENU_CLASS.categoryStatusLive,
    planned: MENU_CLASS.categoryStatusPlanned,
    idea: MENU_CLASS.categoryStatusIdea
}

export class VRCategoryReferencePanel {
    readonly container: Container

    constructor(private readonly appSettings: AppSettings = AppSettings.getInstance()) {
        this.container = this.build()
    }

    private build(): Container {
        const root = new Container(
            { width: PANEL_WIDTH, pixelSize: resolveMenuPixelSize(this.appSettings) },
            [MENU_CLASS.standalonePanelRoot]
        )
        root.add(new Text({ text: 'Category Reference' }, [MENU_CLASS.panelTitle]))

        const scroll = new Container({ height: SCROLL_HEIGHT, overflow: 'scroll' }, [MENU_CLASS.section])
        scroll.add(this.buildSection('Steam Genres', STEAM_GENRE_CATEGORIES))
        scroll.add(this.buildSection('Meta / Library-State Categories', META_CATEGORIES))
        scroll.add(this.buildSection('Sort Dimensions', SORT_DIMENSIONS))
        root.add(scroll)

        return root
    }

    private buildSection(heading: string, entries: readonly CategoryEntry[]): Container {
        const section = new Container(undefined, [MENU_CLASS.categorySection])
        section.add(new Text(
            { text: toUikitSafeText(`${heading.toUpperCase()} (${entries.length})`) },
            [MENU_CLASS.categoryHeading]
        ))
        for (const entry of entries) {
            section.add(this.buildRow(entry))
        }
        return section
    }

    private buildRow(entry: CategoryEntry): Container {
        const row = new Container(undefined, [MENU_CLASS.categoryRow])
        row.add(new Text({ text: toUikitSafeText(entry.label) }, [MENU_CLASS.categoryLabel]))
        row.add(new Text({ text: entry.status }, [STATUS_CLASS[entry.status]]))
        return row
    }
}
