import { DataManager } from '../core/data/DataManager'
import { ARTWORK_DIMENSIONS, GameArtworkProvider } from '../scene/game-box/instancing/GameArtworkProvider'
import type { SteamGameData } from '../scene/game-box/types/GameData'
import { UIComponentUtils } from '../utils/UIComponentUtils'
import '../styles/pause-menu/shared-components.css'
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
    private readonly artworkProvider: GameArtworkProvider
    private isRetryingArtwork = false
    private retryStatusText = ''
    private readonly boundToggle: () => void
    private readonly boundRenderRows: () => void
    private readonly boundHandleRowsClick: (event: Event) => void
    private readonly boundHandleDetailClick: (event: Event) => void

    public constructor() {
        this.artworkProvider = GameArtworkProvider.getInstance()
        this.boundToggle = this.toggle.bind(this)
        this.boundRenderRows = this.renderRows.bind(this)
        this.boundHandleRowsClick = this.handleRowsClick.bind(this)
        this.boundHandleDetailClick = this.handleDetailClick.bind(this)
    }

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
        this.toggleButton.addEventListener('click', this.boundToggle)

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
                <button id="game-list-close-btn" class="game-list-close" title="Close">✕</button>
            </div>
            <div class="game-list-toolbar">
                <input id="game-list-search" class="game-list-search pause-input" type="text" placeholder="Search name, appid, genre, developer..." />
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
        UIComponentUtils.setupButtons(this.container, [
            { buttonId: 'game-list-close-btn', onClick: this.boundToggle },
            { buttonId: 'game-list-refresh', onClick: this.boundRenderRows },
        ])

        UIComponentUtils.setupInput(this.container, {
            inputId: 'game-list-search',
            onInput: (value) => {
                this.searchTerm = String(value).trim().toLowerCase()
                this.renderRows()
            },
        })

        const rowsEl = this.container?.querySelector('#game-list-rows')
        rowsEl?.addEventListener('click', this.boundHandleRowsClick)

        const detailEl = this.container?.querySelector('#game-list-detail')
        detailEl?.addEventListener('click', this.boundHandleDetailClick)
    }

    private handleRowsClick(event: Event): void {
        const target = event.target as HTMLElement | null
        const rowEl = target?.closest('tr[data-appid]') as HTMLTableRowElement | null
        if (!rowEl) {
            return
        }

        const appid = Number(rowEl.dataset.appid)
        this.selectedAppId = Number.isFinite(appid) ? appid : null
        this.renderRows()
    }

    private handleDetailClick(event: Event): void {
        const target = event.target as HTMLElement | null
        const retryButton = target?.closest('button[data-action="retry-artwork"]') as HTMLButtonElement | null
        if (!retryButton || retryButton.disabled) {
            return
        }

        void this.retrySelectedArtwork()
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
        const artworkAttemptRows = (game.artworkAttemptResults ?? []).map((attempt) => {
            const status = attempt.result === 'success' ? 'ok' : attempt.result === 'failure' ? 'fail' : 'skip'
            const errorText = attempt.error ? ` (${this.escapeHtml(attempt.error)})` : ''
            return `<li class="game-list-attempt game-list-attempt--${status}"><code>${this.escapeHtml(attempt.type)}</code> ${this.escapeHtml(attempt.result)} - ${this.escapeHtml(attempt.url)}${errorText}</li>`
        }).join('') || '<li class="game-list-attempt game-list-attempt--none">No attempt data yet.</li>'
        const retryButtonLabel = this.isRetryingArtwork ? 'Retrying...' : 'Retry artwork'
        const retryButtonDisabled = this.isRetryingArtwork ? 'disabled' : ''
        const retryStatus = this.retryStatusText
            ? `<div class="game-list-retry-status">${this.escapeHtml(this.retryStatusText)}</div>`
            : ''

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
            <div class="game-list-attempts-wrap">
                <div class="game-list-attempts-head">
                    <div class="game-list-attempts-title">Artwork attempt results</div>
                    <button class="game-list-refresh game-list-retry-btn" data-action="retry-artwork" ${retryButtonDisabled}>${retryButtonLabel}</button>
                </div>
                ${retryStatus}
                <ul class="game-list-attempts">${artworkAttemptRows}</ul>
            </div>
        `
    }

    private async retrySelectedArtwork(): Promise<void> {
        const game = this.getSelectedGame()
        if (!game) {
            return
        }

        const appid = this.toNumericAppId(game.appid)
        if (appid <= 0) {
            this.retryStatusText = 'Cannot retry: invalid appid.'
            this.renderRows()
            return
        }

        this.isRetryingArtwork = true
        this.retryStatusText = 'Retrying artwork fetch...'
        this.renderRows()

        this.artworkProvider.clearCachedOutcome(appid, 'library')

        game.artworkAttemptResults = []
        delete game.artworkSelectedType
        delete game.artworkSelectedUrl

        const preferredBaseUrl = game.artwork?.library ?? game.artwork?.header
        const preferredUrl = preferredBaseUrl
            ? `${preferredBaseUrl}${preferredBaseUrl.includes('?') ? '&' : '?'}retry=${Date.now()}`
            : undefined

        try {
            const artwork = this.artworkProvider.getArtwork(appid, game.name, 'library', preferredUrl)
            const dims = ARTWORK_DIMENSIONS.library
            await artwork.getPixelsAtSize(dims.width, dims.height)
            this.retryStatusText = 'Retry complete.'
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.retryStatusText = `Retry failed: ${message}`
        } finally {
            this.isRetryingArtwork = false
            this.renderRows()
        }
    }

    private getSelectedGame(): SteamGameData | null {
        const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []
        if (this.selectedAppId === null) {
            return null
        }
        return games.find((game) => this.toNumericAppId(game.appid) === this.selectedAppId) ?? null
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
