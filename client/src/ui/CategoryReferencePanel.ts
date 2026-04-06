/**
 * Category Reference Panel
 *
 * Quick-reference panel for game categories / sort dimensions.
 * Intended as a dev/design tool — provides a single glance at:
 *   - Steam API genres (what the store actually serves)
 *   - Planned meta-categories (library-state based)
 *   - Planned sort/filter dimensions (recency, play-next, etc.)
 *
 * Toggle button lives in #ui-right-center-group alongside the binder and lighting panel.
 * Toggle shortcut: G (genre reference)
 */

import { KNOWN_GENRES } from '../scene/categorization/CategoryAssigner'
import '../styles/category-reference-panel.css'

// ─── Static category data ──────────────────────────────────────────────────

interface CategoryEntry {
    label: string
    description: string
    status: 'live' | 'planned' | 'idea'
}

const STEAM_GENRE_CATEGORIES: CategoryEntry[] = KNOWN_GENRES.map(g => ({
    label: g,
    description: `Steam genre — matched case-insensitively from genres[0].description`,
    status: 'live',
}))

const META_CATEGORIES: CategoryEntry[] = [
    {
        label: 'New to Library',
        description: 'Games added in the last 30–90 days (date_added from Steam).',
        status: 'planned',
    },
    {
        label: 'Play Next',
        description: 'Unplayed or short-playtime games surfaced for discovery (< 2h playtime).',
        status: 'planned',
    },
    {
        label: 'Recently Updated',
        description: 'Games with a recent build/patch (last_played or build_id delta). Better as a sort dimension than a shelf.',
        status: 'idea',
    },
    {
        label: 'Recently Played',
        description: 'Games with recent playtime activity — a time-sorted view, not a shelf category.',
        status: 'idea',
    },
]

const SORT_DIMENSIONS: CategoryEntry[] = [
    {
        label: 'Alphabetical',
        description: 'A–Z by game name.',
        status: 'planned',
    },
    {
        label: 'Most Played',
        description: 'Descending by total playtime_forever.',
        status: 'planned',
    },
    {
        label: 'Recently Played',
        description: 'Descending by rtime_last_played.',
        status: 'planned',
    },
    {
        label: 'Recently Updated',
        description: 'Descending by build date / patch timestamp (requires Store API).',
        status: 'idea',
    },
    {
        label: 'Metacritic',
        description: 'Descending by metacritic.score where available.',
        status: 'idea',
    },
]

// ─── Panel ────────────────────────────────────────────────────────────────────

export class CategoryReferencePanel {
    private container: HTMLElement | null = null
    private toggleButton: HTMLElement | null = null
    private isOpen = false
    private keyboardHandler: ((e: KeyboardEvent) => void) | null = null

    public init(): void {
        this.createToggleButton()
        this.createPanel()
        this.keyboardHandler = (e: KeyboardEvent) => {
            if (
                e.key === 'g' || e.key === 'G' &&
                !e.ctrlKey && !e.metaKey &&
                !(document.activeElement instanceof HTMLInputElement) &&
                !(document.activeElement instanceof HTMLTextAreaElement)
            ) {
                this.toggle()
            }
        }
        document.addEventListener('keydown', this.keyboardHandler)
    }

    private createToggleButton(): void {
        this.toggleButton = document.createElement('button')
        this.toggleButton.id = 'cat-ref-toggle-btn'
        this.toggleButton.className = 'cat-ref-toggle-btn'
        this.toggleButton.innerHTML = '🏷️'
        this.toggleButton.title = 'Category Reference (G)'
        this.toggleButton.addEventListener('click', () => this.toggle())

        const slot = document.getElementById('ui-right-center-group') ?? document.getElementById('ui-slot-top-right')
        if (slot) {
            slot.appendChild(this.toggleButton)
        } else {
            document.body.appendChild(this.toggleButton)
        }
    }

    private createPanel(): void {
        this.container = document.createElement('div')
        this.container.id = 'cat-ref-panel'
        this.container.className = 'cat-ref-panel hidden'
        this.container.innerHTML = this.buildHTML()

        document.body.appendChild(this.container)
    }

    private buildHTML(): string {
        const renderRows = (entries: CategoryEntry[]): string =>
            entries.map(e => `
                <tr class="cat-row cat-row--${e.status}">
                    <td class="cat-label">${e.label}</td>
                    <td class="cat-status">${e.status}</td>
                    <td class="cat-desc">${e.description}</td>
                </tr>
            `).join('')

        return `
            <div class="cat-ref-header">
                <span>🏷️ Category Reference</span>
                <button class="cat-ref-close" title="Close">✕</button>
            </div>
            <div class="cat-ref-body">

                <section class="cat-section">
                    <h3>Steam Genres <span class="cat-count">(${STEAM_GENRE_CATEGORIES.length})</span></h3>
                    <p class="cat-section-note">Matched case-insensitively from <code>genres[0].description</code>. Unrecognised → Other.</p>
                    <table class="cat-table">
                        <thead><tr><th>Label</th><th>Status</th><th>Notes</th></tr></thead>
                        <tbody>${renderRows(STEAM_GENRE_CATEGORIES)}</tbody>
                    </table>
                </section>

                <section class="cat-section">
                    <h3>Meta / Library-State Categories</h3>
                    <p class="cat-section-note">Based on library data (playtime, date added, etc.), not Steam genre tags.</p>
                    <table class="cat-table">
                        <thead><tr><th>Label</th><th>Status</th><th>Notes</th></tr></thead>
                        <tbody>${renderRows(META_CATEGORIES)}</tbody>
                    </table>
                </section>

                <section class="cat-section">
                    <h3>Sort Dimensions</h3>
                    <p class="cat-section-note">These are better as sort/filter controls than as shelves. Design TBD.</p>
                    <table class="cat-table">
                        <thead><tr><th>Label</th><th>Status</th><th>Notes</th></tr></thead>
                        <tbody>${renderRows(SORT_DIMENSIONS)}</tbody>
                    </table>
                </section>

            </div>
        `
    }

    private toggle(): void {
        this.isOpen = !this.isOpen
        this.container?.classList.toggle('hidden', !this.isOpen)
        if (this.toggleButton) {
            this.toggleButton.classList.toggle('active', this.isOpen)
        }
        if (this.isOpen) {
            // Wire close button each time we open (innerHTML is static so it survives)
            const closeBtn = this.container?.querySelector('.cat-ref-close')
            closeBtn?.addEventListener('click', () => this.toggle(), { once: true })
        }
    }

    public dispose(): void {
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler)
        }
        this.container?.remove()
        this.toggleButton?.remove()
    }
}
