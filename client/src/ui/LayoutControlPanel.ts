/**
 * LayoutControlPanel
 *
 * Three-axis control bar in #ui-right-center-group:
 *   - Layout  (Arc / Row / Spoke)  → emits UIEventTypes.LayoutRequested
 *   - Group   (None / Genre / Recency / Playtime / Rating / Tag / User Collection)  ─╮
 *   - Sort    (Alphabetical / Playtime / Rating / Last Played)                       ╰→ emits UIEventTypes.ArrangementRequested
 *
 * A toggle button (⚏) shows/hides the bar. Hotkey: Shift+L.
 *
 * Group/Sort options are filtered to what's actually present in the current game data
 * (TaxonomyOptionAvailability.computeAvailableDimensions) - re-evaluated on GameDataReady and
 * SteamEventTypes.TaxonomyDataReady, not just once at construction. This replaces the previous
 * `steam.hasRecencyData` flag, which was written nowhere and only checked once - see
 * docs/plans/taxonomy-data-event-plan.md.
 *
 * All controls are disabled while the pipeline is executing.
 * Re-enabled on SectionsReady (arrangement applied).
 */

import { EventManager } from '../core/EventManager'
import { DataManager } from '../core/data/DataManager'
import { GameEventTypes, SteamEventTypes, UIEventTypes } from '../types/InteractionEvents'
import { GroupModes, SortModes } from '../types/LayoutTypes'
import type { GroupMode, SortMode, LayoutMode } from '../types/LayoutTypes'
import type { LayoutRequestedEvent } from '../types/EnvironmentEvents'
import type { ArrangementRequestedEvent, SectionsReadyEvent } from '../types/EnvironmentEvents'
import type { AllBatchesCompleteEvent } from '../types/EnvironmentEvents'
import type { SteamGameData } from '../scene/game-box/types/GameData'
import { computeAvailableDimensions, type AvailableDimensions } from './TaxonomyOptionAvailability'
import '../styles/components/layout-sort-panel.css'
import { togglePanelCollapse } from './components/PanelCollapse'

// ─── Option definitions ───────────────────────────────────────────────────────

const LAYOUT_OPTIONS = [
    { key: 'arc'     as LayoutMode, label: 'Arc'     },
    { key: 'row'     as LayoutMode, label: 'Row'     },
    { key: 'spoke'   as LayoutMode, label: 'Spoke'   },
    { key: 'liminal' as LayoutMode, label: 'Liminal' },
] as const

const GROUP_OPTIONS = [
    { key: GroupModes.ByUserCollection, label: 'By Collection' },
    { key: GroupModes.ByRecency,  label: 'By Recency'  },
    { key: GroupModes.ByGenre,    label: 'By Genre'     },
    { key: GroupModes.ByTag,      label: 'By Tag'       },
    { key: GroupModes.ByPlaytime, label: 'By Playtime'  },
    { key: GroupModes.ByRating,   label: 'By Rating'    },
    { key: GroupModes.None,       label: 'Ungrouped'    },
] as const

const SORT_OPTIONS = [
    { key: SortModes.ByLastPlayed,  label: 'Last Played'    },
    { key: SortModes.ByPlaytime,    label: 'Playtime'        },
    { key: SortModes.Alphabetical,  label: 'Alphabetical'    },
    { key: SortModes.ByRating,      label: 'Rating'          },
] as const

// ─── LayoutControlPanel ───────────────────────────────────────────────────────

export class LayoutControlPanel {
    private panelContainer: HTMLElement | null = null
    private panelContent: HTMLElement | null = null
    private toggleIndicator: HTMLElement | null = null
    private controlsContainer: HTMLElement | null = null
    private layoutSelect: HTMLSelectElement | null = null
    private groupSelect: HTMLSelectElement | null = null
    private sortSelect: HTMLSelectElement | null = null

    private activeLayoutKey: LayoutMode = 'arc'
    private activeGroupKey: GroupMode = GroupModes.ByRecency
    private activeSortKey: SortMode = SortModes.ByLastPlayed
    private availableDimensions: AvailableDimensions = computeAvailableDimensions([])

    private isControlsVisible = false
    private keyboardHandler: ((e: KeyboardEvent) => void) | null = null

    public init(): void {
        const slot = document.getElementById('ui-right-center-group') ?? document.body
        this.availableDimensions = computeAvailableDimensions(this.getCurrentGames())
        this.createPanel(slot)
        this.registerKeyboardHandler()
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            (_event: CustomEvent<AllBatchesCompleteEvent>) => this.setControlsEnabled(true)
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SectionsReady,
            (event: CustomEvent<SectionsReadyEvent>) => this.handleSectionsReady(event.detail)
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.GameDataReady,
            () => this.refreshAvailableOptions()
        )
        EventManager.getInstance().registerEventHandler(
            SteamEventTypes.TaxonomyDataReady,
            () => this.refreshAvailableOptions()
        )
    }

    private getCurrentGames(): SteamGameData[] {
        return DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []
    }

    /**
     * Re-scans current game data for which dimensions are actually present and rebuilds the
     * Group/Sort dropdown option lists in place, preserving the current selection if it's still
     * offered. Called on every GameDataReady/TaxonomyDataReady, not just once at construction -
     * closes the other half of why the dead `steam.hasRecencyData` flag never worked even when
     * it was read.
     */
    private refreshAvailableOptions(): void {
        this.availableDimensions = computeAvailableDimensions(this.getCurrentGames())
        if (this.groupSelect) {
            this.populateSelect(this.groupSelect, GROUP_OPTIONS, this.availableDimensions.groupModes, this.activeGroupKey)
        }
        if (this.sortSelect) {
            this.populateSelect(this.sortSelect, SORT_OPTIONS, this.availableDimensions.sortModes, this.activeSortKey)
        }
    }

    private handleSectionsReady(detail: SectionsReadyEvent): void {
        // Keep dropdowns in sync with whatever arrangement was actually applied
        // (handles initial anonymous default, layout switch re-use, etc.)
        this.activeGroupKey = detail.groupMode
        this.activeSortKey = detail.sortMode
        if (this.groupSelect) this.groupSelect.value = detail.groupMode
        if (this.sortSelect) this.sortSelect.value = detail.sortMode
        this.setControlsEnabled(true)
    }

    // ─── Controls container ────────────────────────────────────────────────────

    private createPanel(parentSlot: HTMLElement): void {
        this.panelContainer = document.createElement('div')
        this.panelContainer.className = 'ui-panel ui-right-rail-panel layout-sort-panel horizontally-collapsible horizontally-collapsed'

        const header = document.createElement('div')
        header.className = 'panel-header clickable-header'
        header.id = 'layout-sort-panel-header'
        header.innerHTML = `
            <h3><span class="layout-icon" aria-hidden="true">⊞</span><span class="panel-title">Layout</span></h3>
            <div class="header-controls">
                <span class="toggle-indicator" id="layout-sort-toggle-indicator">▶</span>
            </div>
        `
        header.addEventListener('click', () => this.toggleControlsVisibility())

        this.panelContent = document.createElement('div')
        this.panelContent.className = 'panel-content'

        this.controlsContainer = document.createElement('div')
        this.controlsContainer.className = 'layout-sort-controls'

        this.controlsContainer.appendChild(this.buildLayoutGroup())
        this.controlsContainer.appendChild(this.buildDivider())
        this.controlsContainer.appendChild(this.buildGroupGroup())
        this.controlsContainer.appendChild(this.buildDivider())
        this.controlsContainer.appendChild(this.buildSortGroup())

        this.panelContent.appendChild(this.controlsContainer)
        this.panelContainer.appendChild(header)
        this.panelContainer.appendChild(this.panelContent)
        this.toggleIndicator = header.querySelector('#layout-sort-toggle-indicator')

        parentSlot.appendChild(this.panelContainer)
    }

    private buildDivider(): HTMLElement {
        const div = document.createElement('div')
        div.className = 'layout-sort-divider'
        return div
    }

    // ─── Layout dropdown ───────────────────────────────────────────────────────

    private buildLayoutGroup(): HTMLElement {
        const group = document.createElement('div')
        group.className = 'layout-sort-control-group'

        const label = document.createElement('span')
        label.className = 'layout-sort-label'
        label.textContent = 'Layout'

        const select = document.createElement('select')
        select.className = 'layout-sort-select'
        select.title = 'Layout mode'
        this.layoutSelect = select

        for (const option of LAYOUT_OPTIONS) {
            const el = document.createElement('option')
            el.value = option.key
            el.textContent = option.label
            el.selected = option.key === this.activeLayoutKey
            select.appendChild(el)
        }

        select.addEventListener('change', () => {
            this.activeLayoutKey = select.value as LayoutMode
            this.setControlsEnabled(false)
            EventManager.getInstance().emit<LayoutRequestedEvent>(UIEventTypes.LayoutRequested, {
                layoutMode: this.activeLayoutKey,
            })
        })

        group.appendChild(label)
        group.appendChild(select)
        return group
    }

    // ─── Group dropdown ────────────────────────────────────────────────────────

    private buildGroupGroup(): HTMLElement {
        const group = document.createElement('div')
        group.className = 'layout-sort-control-group'

        const label = document.createElement('span')
        label.className = 'layout-sort-label'
        label.textContent = 'Group'

        const select = document.createElement('select')
        select.className = 'layout-sort-select'
        select.title = 'Group mode'
        this.groupSelect = select
        this.populateSelect(select, GROUP_OPTIONS, this.availableDimensions.groupModes, this.activeGroupKey)

        select.addEventListener('change', () => {
            this.activeGroupKey = select.value as GroupMode
            this.emitArrangement()
        })

        group.appendChild(label)
        group.appendChild(select)
        return group
    }

    // ─── Sort dropdown ─────────────────────────────────────────────────────────

    private buildSortGroup(): HTMLElement {
        const group = document.createElement('div')
        group.className = 'layout-sort-control-group'

        const label = document.createElement('span')
        label.className = 'layout-sort-label'
        label.textContent = 'Sort'

        const select = document.createElement('select')
        select.className = 'layout-sort-select'
        select.title = 'Sort order'
        this.sortSelect = select
        this.populateSelect(select, SORT_OPTIONS, this.availableDimensions.sortModes, this.activeSortKey)

        select.addEventListener('change', () => {
            this.activeSortKey = select.value as SortMode
            this.emitArrangement()
        })

        group.appendChild(label)
        group.appendChild(select)
        return group
    }

    /**
     * Shared by both dropdowns' initial build and refreshAvailableOptions(): clears and
     * repopulates a <select> from an option list filtered to `availableKeys`, restoring
     * `activeKey` as selected if it's still offered (falls through to whatever the browser
     * defaults an empty selection to otherwise - the next real ArrangementRequested/
     * SectionsReady corrects it).
     */
    private populateSelect<K extends string>(
        select: HTMLSelectElement,
        options: ReadonlyArray<{ key: K; label: string }>,
        availableKeys: ReadonlySet<K>,
        activeKey: K
    ): void {
        select.innerHTML = ''
        for (const option of options) {
            if (!availableKeys.has(option.key)) continue
            const el = document.createElement('option')
            el.value = option.key
            el.textContent = option.label
            el.selected = option.key === activeKey
            select.appendChild(el)
        }
    }

    private emitArrangement(): void {
        this.setControlsEnabled(false)
        EventManager.getInstance().emit<ArrangementRequestedEvent>(UIEventTypes.ArrangementRequested, {
            groupMode: this.activeGroupKey,
            sortMode: this.activeSortKey,
        })
    }

    // ─── Enable / disable ──────────────────────────────────────────────────────

    public setControlsEnabled(enabled: boolean): void {
        if (this.layoutSelect) this.layoutSelect.disabled = !enabled
        if (this.groupSelect)  this.groupSelect.disabled  = !enabled
        if (this.sortSelect)   this.sortSelect.disabled   = !enabled
        this.controlsContainer?.classList.toggle('pipeline-active', !enabled)
    }

    // ─── Visibility toggle ─────────────────────────────────────────────────────

    private toggleControlsVisibility(): void {
        if (!this.panelContainer) return

        const collapsed = togglePanelCollapse(this.panelContainer, this.toggleIndicator, 'horizontally-collapsed')
        this.isControlsVisible = !collapsed
    }

    private registerKeyboardHandler(): void {
        this.keyboardHandler = (event: KeyboardEvent) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return
            if (event.key === 'L') this.toggleControlsVisibility()
        }
        document.addEventListener('keydown', this.keyboardHandler)
    }

    public dispose(): void {
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler)
            this.keyboardHandler = null
        }
        this.panelContainer?.remove()
    }
}
