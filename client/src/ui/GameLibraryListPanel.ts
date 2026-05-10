import { DataManager } from '../core/data/DataManager'
import type { SteamGameData } from '../scene/game-box/types/GameData'
import '../styles/game-library-list-panel.css'

interface LibraryViewRow {
    appid: number
    name: string
    artworkType: string
    playtimeHours: number
    lastPlayedText: string
    genresText: string
    developersText: string
    game: SteamGameData
}

export class GameLibraryListPanel {
    private container: HTMLElement | null = null
    private toggleButton: HTMLElement | null = null
    private isOpen = false
    private searchTerm = ''
    private selectedAppId: number | null = null

    public init(): void {
        this.createToggleButton()
        this.createPanel()
    }

    private createToggleButton(): void {
        this.toggleButton = document.createElement('button')
        this.toggleButton.id = 'game-list-toggle-btn'
        this.toggleButton.className = 'game-list-toggle-btn'
        this.toggleButton.innerHTML = '📋'
        this.toggleButton.title = 'Game Metadata List'
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
        this.container.id = 'game-list-panel'
        this.container.className = 'game-list-panel hidden'
        this.container.innerHTML = this.buildHTML()
        document.body.appendChild(this.container)
        this.wirePanelEvents()
    }

    private buildHTML(): string {
        return `
            <div class="game-list-header">
                <span>📋 Game Metadata List</span>
                <button class="game-list-close" title="Close">✕</button>
            </div>
            <div class="game-list-toolbar">
                <input id="game-list-search" class="game-list-search" type="text" placeholder="Search name, appid, genre, developer..." />
                <button id="game-list-refresh" class="game-list-refresh">Refresh</button>
                <span id="game-list-summary" class="game-list-summary"></span>
            </div>
            <div class="game-list-table-wrap">
                <table class="game-list-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>AppID</th>
                            <th>Artwork</th>
                            <th>Playtime (h)</th>
                            <th>Last Played</th>
                            <th>Genres</th>
                        </tr>
                    </thead>
                    <tbody id="game-list-rows"></tbody>
                </table>
            </div>
            <div class="game-list-detail" id="game-list-detail"></div>
        `
    }

    private wirePanelEvents(): void {
        const closeBtn = this.container?.querySelector('.game-list-close')
        closeBtn?.addEventListener('click', () => this.toggle())

        const searchInput = this.container?.querySelector('#game-list-search') as HTMLInputElement | null
        searchInput?.addEventListener('input', () => {
            this.searchTerm = searchInput.value.trim().toLowerCase()
            this.renderRows()
        })

        const refreshBtn = this.container?.querySelector('#game-list-refresh')
        refreshBtn?.addEventListener('click', () => this.renderRows())
    }

    private toggle(): void {
        this.isOpen = !this.isOpen
        this.container?.classList.toggle('hidden', !this.isOpen)
        this.toggleButton?.classList.toggle('active', this.isOpen)
        if (this.isOpen) {
            this.renderRows()
        }
    }

    private getRows(): LibraryViewRow[] {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []

        return games.map((game) => {
            const appid = this.toNumericAppId(game.appid)
            const playtimeHours = Math.round((game.playtime_forever ?? 0) / 60)
            const lastPlayedText = game.rtime_last_played
                ? new Date(game.rtime_last_played * 1000).toLocaleDateString()
                : '-'
            const genresText = (game.genres ?? []).map((genre) => genre.description).join(', ')
            const developersText = (game.developers ?? []).join(', ')

            return {
                appid,
                name: game.name,
                artworkType: game.artworkSelectedType ?? '-',
                playtimeHours,
                lastPlayedText,
                genresText,
                developersText,
                game,
            }
        })
    }

    private filterRows(rows: LibraryViewRow[]): LibraryViewRow[] {
        if (!this.searchTerm) {
            return rows
        }

        return rows.filter((row) => {
            const haystack = [
                row.name,
                String(row.appid),
                row.genresText,
                row.developersText,
                row.artworkType,
            ].join(' ').toLowerCase()
            return haystack.includes(this.searchTerm)
        })
    }

    private renderRows(): void {
        const rowsEl = this.container?.querySelector('#game-list-rows')
        const summaryEl = this.container?.querySelector('#game-list-summary')
        if (!rowsEl || !summaryEl) {
            return
        }

        const allRows = this.getRows().sort((a, b) => a.name.localeCompare(b.name))
        const filteredRows = this.filterRows(allRows)

        summaryEl.textContent = `${filteredRows.length} / ${allRows.length} games`

        rowsEl.innerHTML = filteredRows.map((row) => {
            const selectedClass = this.selectedAppId === row.appid ? ' selected' : ''
            return `
                <tr class="game-list-row${selectedClass}" data-appid="${row.appid}">
                    <td>${this.escapeHtml(row.name)}</td>
                    <td>${row.appid}</td>
                    <td>${this.escapeHtml(row.artworkType)}</td>
                    <td>${row.playtimeHours}</td>
                    <td>${this.escapeHtml(row.lastPlayedText)}</td>
                    <td>${this.escapeHtml(row.genresText || '-')}</td>
                </tr>
            `
        }).join('')

        const clickableRows = rowsEl.querySelectorAll<HTMLTableRowElement>('tr[data-appid]')
        for (const rowEl of clickableRows) {
            rowEl.addEventListener('click', () => {
                const appid = Number(rowEl.dataset.appid)
                this.selectedAppId = Number.isFinite(appid) ? appid : null
                this.renderRows()
                this.renderDetail(filteredRows)
            })
        }

        this.renderDetail(filteredRows)
    }

    private renderDetail(filteredRows: LibraryViewRow[]): void {
        const detailEl = this.container?.querySelector('#game-list-detail')
        if (!detailEl) {
            return
        }

        if (!filteredRows.length) {
            detailEl.innerHTML = '<div class="game-list-empty">No games match current search.</div>'
            return
        }

        const selected = filteredRows.find((row) => row.appid === this.selectedAppId) ?? filteredRows[0]
        this.selectedAppId = selected.appid

        const game = selected.game
        const categoriesText = (game.categories ?? []).map((c) => c.description).join(', ') || '-'
        const devText = (game.developers ?? []).join(', ') || '-'
        const pubText = (game.publishers ?? []).join(', ') || '-'

        detailEl.innerHTML = `
            <div class="game-list-detail-title">${this.escapeHtml(selected.name)} (${selected.appid})</div>
            <div class="game-list-detail-grid">
                <div><span class="label">Artwork selected:</span> ${this.escapeHtml(game.artworkSelectedType ?? '-')}</div>
                <div><span class="label">Artwork URL:</span> ${this.escapeHtml(game.artworkSelectedUrl ?? '-')}</div>
                <div><span class="label">Library URL:</span> ${this.escapeHtml(game.artwork?.library ?? '-')}</div>
                <div><span class="label">Header URL:</span> ${this.escapeHtml(game.artwork?.header ?? '-')}</div>
                <div><span class="label">Playtime:</span> ${selected.playtimeHours}h</div>
                <div><span class="label">Last played:</span> ${this.escapeHtml(selected.lastPlayedText)}</div>
                <div><span class="label">Genres:</span> ${this.escapeHtml(selected.genresText || '-')}</div>
                <div><span class="label">Categories:</span> ${this.escapeHtml(categoriesText)}</div>
                <div><span class="label">Developers:</span> ${this.escapeHtml(devText)}</div>
                <div><span class="label">Publishers:</span> ${this.escapeHtml(pubText)}</div>
            </div>
        `
    }

    private toNumericAppId(appid: number | string): number {
        return typeof appid === 'number' ? appid : Number.parseInt(appid, 10) || 0
    }

    private escapeHtml(value: string): string {
        return value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;')
    }

    public dispose(): void {
        this.container?.remove()
        this.toggleButton?.remove()
    }
}
