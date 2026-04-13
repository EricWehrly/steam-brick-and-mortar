/**
 * LayoutSortPanel
 *
 * A compact control bar in #ui-right-center-group providing:
 *   - A disabled "Layout" dropdown (placeholder for future layout modes, currently Arc only)
 *   - A functional "Sort" dropdown (By Last Played / By Genre / By Playtime)
 *   - A toggle button (⚏) to show/hide the control bar
 *
 * Hotkeys:
 *   L — toggle the control bar visible/hidden
 *
 * Emits UIEventTypes.SortRequested when the user changes sort mode.
 * GameSorter subscribes to SortRequested and drives GamesSort from there.
 */

import { EventManager } from '../core/EventManager'
import { UIEventTypes } from '../types/InteractionEvents'
import type { SortRequestedEvent } from '../types/EnvironmentEvents'
import type { GameSortMode } from '../types/EnvironmentEvents'
import '../styles/components/layout-sort-panel.css'

// ─── Sort option definitions ───────────────────────────────────────────────────

type SortOptionKey = GameSortMode

interface SortOption {
    key: SortOptionKey
    label: string
}

const SORT_OPTIONS: ReadonlyArray<SortOption> = [
    { key: 'recently-played', label: 'By Last Played' },
    { key: 'by-genre',        label: 'By Genre'       },
    { key: 'by-playtime',     label: 'By Playtime'    },
]

// ─── LayoutSortPanel ───────────────────────────────────────────────────────────

export class LayoutSortPanel {
    private toggleButton: HTMLElement | null = null
    private controlsContainer: HTMLElement | null = null
    private sortSelect: HTMLSelectElement | null = null
    private activeSortKey: SortOptionKey = 'recently-played'
    private isControlsVisible = true
    private keyboardHandler: ((e: KeyboardEvent) => void) | null = null

    constructor() {}

    public init(): void {
        const slot = document.getElementById('ui-right-center-group') ?? document.body
        this.createControls(slot)
        this.createToggleButton(slot)
        this.registerKeyboardHandler()
    }

    private createToggleButton(parentSlot: HTMLElement): void {
        this.toggleButton = document.createElement('button')
        this.toggleButton.className = 'layout-sort-toggle-btn active'
        this.toggleButton.title = 'Toggle Layout/Sort controls (Shift+L)'
        this.toggleButton.textContent = '⚏'
        this.toggleButton.addEventListener('click', () => this.toggleControlsVisibility())
        parentSlot.appendChild(this.toggleButton)
    }

    private createControls(parentSlot: HTMLElement): void {
        this.controlsContainer = document.createElement('div')
        this.controlsContainer.className = 'layout-sort-controls'

        this.controlsContainer.appendChild(this.buildLayoutGroup())

        const divider = document.createElement('div')
        divider.className = 'layout-sort-divider'
        this.controlsContainer.appendChild(divider)

        this.controlsContainer.appendChild(this.buildSortGroup())

        parentSlot.appendChild(this.controlsContainer)
    }

    private buildLayoutGroup(): HTMLElement {
        const group = document.createElement('div')
        group.className = 'layout-sort-control-group'

        const label = document.createElement('span')
        label.className = 'layout-sort-label'
        label.textContent = 'Layout'

        const select = document.createElement('select')
        select.className = 'layout-sort-select'
        select.disabled = true
        select.title = 'Layout mode (future options coming)'

        const arcOption = document.createElement('option')
        arcOption.value = 'arc'
        arcOption.textContent = 'Arc'
        arcOption.selected = true
        select.appendChild(arcOption)

        group.appendChild(label)
        group.appendChild(select)
        return group
    }

    private buildSortGroup(): HTMLElement {
        const group = document.createElement('div')
        group.className = 'layout-sort-control-group'

        const label = document.createElement('span')
        label.className = 'layout-sort-label'
        label.textContent = 'Sort'

        const select = document.createElement('select')
        select.className = 'layout-sort-select'
        select.title = 'Sort order (L to cycle)'
        this.sortSelect = select

        for (const option of SORT_OPTIONS) {
            const optElement = document.createElement('option')
            optElement.value = option.key
            optElement.textContent = option.label
            optElement.selected = option.key === this.activeSortKey
            select.appendChild(optElement)
        }

        select.addEventListener('change', () => {
            const selectedKey = select.value as SortOptionKey
            this.applySort(selectedKey)
        })

        group.appendChild(label)
        group.appendChild(select)
        return group
    }

    private applySort(sortKey: SortOptionKey): void {
        this.activeSortKey = sortKey

        if (this.sortSelect) {
            this.sortSelect.value = sortKey
        }

        EventManager.getInstance().emit<SortRequestedEvent>(UIEventTypes.SortRequested, {
            sortMode: sortKey,
        })
    }

    private toggleControlsVisibility(): void {
        this.isControlsVisible = !this.isControlsVisible
        this.controlsContainer?.classList.toggle('hidden', !this.isControlsVisible)
        this.toggleButton?.classList.toggle('active', this.isControlsVisible)
    }

    private registerKeyboardHandler(): void {
        this.keyboardHandler = (event: KeyboardEvent) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return
            if (event.key === 'L') {
                this.toggleControlsVisibility()
            }
        }
        document.addEventListener('keydown', this.keyboardHandler)
    }

    public dispose(): void {
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler)
            this.keyboardHandler = null
        }
        this.controlsContainer?.remove()
        this.toggleButton?.remove()
    }
}
