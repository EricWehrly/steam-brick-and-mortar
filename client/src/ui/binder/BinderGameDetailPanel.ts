import { GameSpotlight } from '../../debug/GameSpotlight'
import type { SteamGameData } from '../../scene/game-box/types/GameData'

export interface BinderGameDetailPanelOptions {
    onClose?: () => void
}

/**
 * Stand-alone detail panel renderer for binder-selected games.
 *
 * This isolates detail UI from binder page/slot logic so the panel can be
 * reused by scene click routing and future standalone UI entry points.
 */
export class BinderGameDetailPanel {
    private panel: HTMLElement | null = null
    private escHandler: ((e: KeyboardEvent) => void) | null = null

    public show(game: SteamGameData, options: BinderGameDetailPanelOptions = {}): void {
        this.hide()

        const headerUrl = game.artwork?.header || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`
        const libraryUrl = game.artwork?.library || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
        const playtimeHours = Math.round((game.playtime_forever || 0) / 60)
        const playtime2Weeks = Math.round((game.playtime_2weeks || 0) / 60)

        const genres = game.genres?.map(g => g.description) ?? []
        const steamCategories = game.categories?.map(c => c.description) ?? []
        const categoriesHtml = genres.length > 0 || steamCategories.length > 0 ? `
            <div class="detail-categories">
                <div class="detail-section-label">Categories</div>
                ${genres.length > 0 ? `
                <div class="detail-category-group">
                    <span class="detail-category-label">Genres</span>
                    <div class="detail-tags">${genres.map(g => `<span class="detail-tag">${this.escapeHtml(g)}</span>`).join('')}</div>
                </div>` : ''}
                ${steamCategories.length > 0 ? `
                <div class="detail-category-group">
                    <span class="detail-category-label">Features</span>
                    <div class="detail-tags">${steamCategories.map(c => `<span class="detail-tag">${this.escapeHtml(c)}</span>`).join('')}</div>
                </div>` : ''}
            </div>
        ` : ''

        const jsonBlob = JSON.stringify(game, null, 2)

        const panel = document.createElement('div')
        panel.id = 'binder-detail-panel'
        panel.className = 'detail-panel'

        panel.innerHTML = `
            <div class="detail-header" style="background-image: url('${headerUrl}');">
                <div class="detail-header-gradient"></div>
                <button id="detail-close-btn" class="detail-close-btn">✕</button>
                <h2 class="detail-title">${this.escapeHtml(game.name)}</h2>
            </div>

            <div class="detail-content">
                <div class="detail-actions">
                    <a href="steam://run/${game.appid}" class="detail-btn play">▶ Play</a>
                    <button id="detail-spotlight-btn" class="detail-btn spotlight">🔦 Spotlight</button>
                    <a href="https://store.steampowered.com/app/${game.appid}" target="_blank" class="detail-btn store">🌐 Store Page</a>
                </div>

                <div class="detail-stats">
                    <div class="detail-stat">
                        <div class="detail-stat-label">Total Playtime</div>
                        <div class="detail-stat-value playtime">${playtimeHours} hours</div>
                    </div>
                    ${playtime2Weeks > 0 ? `
                    <div class="detail-stat">
                        <div class="detail-stat-label">Last 2 Weeks</div>
                        <div class="detail-stat-value recent">${playtime2Weeks} hours</div>
                    </div>
                    ` : ''}
                    <div class="detail-stat">
                        <div class="detail-stat-label">App ID</div>
                        <div class="detail-stat-value">${game.appid}</div>
                    </div>
                </div>

                ${categoriesHtml}

                <div class="detail-artwork">
                    <div class="detail-section-label">Artwork</div>
                    <div class="detail-artwork-grid">
                        <div class="detail-artwork-item">
                            <div class="detail-artwork-label">Header</div>
                            <img src="${headerUrl}" class="detail-artwork-img" onerror="this.style.display='none'">
                        </div>
                        <div class="detail-artwork-item library">
                            <div class="detail-artwork-label">Library</div>
                            <img src="${libraryUrl}" class="detail-artwork-img" onerror="this.src=''; this.style.background='#333'; this.style.aspectRatio='2/3';">
                        </div>
                    </div>
                </div>

                <div class="detail-json">
                    <div class="detail-section-label">Cache Entry (JSON)</div>
                    <pre class="detail-json-content">${this.escapeHtml(jsonBlob)}</pre>
                </div>
            </div>
        `

        document.body.appendChild(panel)
        this.panel = panel

        const close = (): void => {
            this.hide()
            options.onClose?.()
        }

        const closeBtn = panel.querySelector('#detail-close-btn') as HTMLButtonElement | null
        closeBtn?.addEventListener('click', close)

        const spotlightBtn = panel.querySelector('#detail-spotlight-btn') as HTMLButtonElement | null
        spotlightBtn?.addEventListener('click', () => {
            const target = game.name ?? game.appid
            const spotlight = GameSpotlight.getInstance()
            if (spotlight && target !== undefined) {
                spotlight.spotlight(target)
            }
        })

        this.escHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                close()
            }
        }
        document.addEventListener('keydown', this.escHandler)

        panel.addEventListener('click', (e) => {
            if (e.target === panel) {
                close()
            }
        })
    }

    public hide(): void {
        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler)
            this.escHandler = null
        }

        if (this.panel) {
            this.panel.remove()
            this.panel = null
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }
}
