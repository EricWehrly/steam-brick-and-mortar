import { GameSpotlight } from '../../debug/GameSpotlight'
import type { SteamGameData } from '../../scene/game-box/types/GameData'
import detailPanelTemplate from './detail-panel.html?raw'

export interface BinderGameDetailPanelOptions {
    onClose?: () => void
}

/**
 * Stand-alone detail panel renderer for binder-selected games.
 *
 * Markup lives in detail-panel.html (Vite ?raw import).
 * Substitution tokens use {{token}} syntax and are replaced at show() time.
 */
export class BinderGameDetailPanel {
    private panel: HTMLElement | null = null
    private escHandler: ((e: KeyboardEvent) => void) | null = null

    public show(game: SteamGameData, options: BinderGameDetailPanelOptions = {}): void {
        this.hide()

        const appid = game.appid
        const headerUrl = game.artwork?.header
            || `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`
        const playtimeHours = Math.round((game.playtime_forever || 0) / 60)
        const playtime2Weeks = Math.round((game.playtime_2weeks || 0) / 60)

        const playtimeBlock = playtimeHours > 0 ? `
            <div class="detail-stat">
                <div class="detail-stat-label">Total Playtime</div>
                <div class="detail-stat-value playtime">${playtimeHours} hours</div>
            </div>` : ''

        const playtime2WeeksBlock = playtime2Weeks > 0 ? `
            <div class="detail-stat">
                <div class="detail-stat-label">Last 2 Weeks</div>
                <div class="detail-stat-value recent">${playtime2Weeks} hours</div>
            </div>` : ''

        const genres = game.genres?.map(g => g.description) ?? []
        const steamCategories = game.categories?.map(c => c.description) ?? []
        const categoriesBlock = genres.length > 0 || steamCategories.length > 0 ? `
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
            </div>` : ''

        const jsonBlob = JSON.stringify(game, null, 2)

        const html = detailPanelTemplate
            .replace(/\{\{headerUrl\}\}/g, headerUrl)
            .replace(/\{\{gameName\}\}/g, this.escapeHtml(game.name))
            .replace(/\{\{appid\}\}/g, String(appid))
            .replace(/\{\{playtimeBlock\}\}/g, playtimeBlock)
            .replace(/\{\{playtime2WeeksBlock\}\}/g, playtime2WeeksBlock)
            .replace(/\{\{categoriesBlock\}\}/g, categoriesBlock)
            .replace(/\{\{jsonBlob\}\}/g, this.escapeHtml(jsonBlob))

        const panel = document.createElement('div')
        panel.id = 'binder-detail-panel'
        panel.className = 'detail-panel'
        panel.innerHTML = html
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
            const spotlight = GameSpotlight.getInstance()
            if (spotlight && game.appid !== undefined) {
                spotlight.spotlight(game.name ?? game.appid)
            }
        })

        this.escHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') close()
        }
        document.addEventListener('keydown', this.escHandler)

        panel.addEventListener('click', (e) => {
            if (e.target === panel) close()
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
