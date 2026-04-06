/**
 * Game Library Binder UI
 * 
 * A nostalgic CD/DVD binder interface for browsing Steam library games.
 * Features black felt exterior, clear plastic sheets with 4 games each,
 * and a side-by-side page spread view.
 */

import { EventManager } from '../../core/EventManager'
import { DataManager } from '../../core/data'
import type { SteamGameData } from '../../scene/game-box/types/GameData'
import { InputEventTypes, GameEventTypes } from '../../types/InteractionEvents'
import type { InputPauseEvent, InputResumeEvent, GameSelectedEvent } from '../../types/InteractionEvents'
import { Logger } from '../../utils/Logger'
import './binder.css'

const GAMES_PER_PAGE = 4
const PAGES_PER_SPREAD = 2

interface RenderLifecycleController {
    pauseRendering: () => void
    resumeRendering: () => void
}

export interface BinderState {
    isOpen: boolean
    currentSpreadIndex: number  // Which page spread we're viewing (0 = pages 0-1, 1 = pages 2-3, etc.)
    selectedGame: SteamGameData | null
    searchQuery: string
    filteredGames: SteamGameData[]
}

export class GameLibraryBinderUI {
    private static readonly logger = Logger.createLogFunctions(GameLibraryBinderUI.name)
    private static instance: GameLibraryBinderUI | null = null
    
    private container: HTMLElement | null = null
    private toggleButton: HTMLElement | null = null
    private state: BinderState = {
        isOpen: false,
        currentSpreadIndex: 0,
        selectedGame: null,
        searchQuery: '',
        filteredGames: []
    }
    
    private eventManager: EventManager
    private dataManager: DataManager
    private keyboardHandler: ((e: KeyboardEvent) => void) | null = null
    
    private constructor() {
        this.eventManager = EventManager.getInstance()
        this.dataManager = DataManager.getInstance()
    }
    
    static getInstance(): GameLibraryBinderUI {
        if (!GameLibraryBinderUI.instance) {
            GameLibraryBinderUI.instance = new GameLibraryBinderUI()
        }
        return GameLibraryBinderUI.instance
    }
    
    /**
     * Initialize the binder UI - creates DOM elements and sets up event listeners
     */
    public init(): void {
        this.createToggleButton()
        this.createBinderContainer()
        this.setupKeyboardShortcut()

        // Listen for game selection from scene (raycast clicks)
        EventManager.getInstance().registerEventHandler<GameSelectedEvent>(
            GameEventTypes.Selected,
            this.onGameSelected
        )

        GameLibraryBinderUI.logger.debug('GameLibraryBinderUI initialized')
    }
    
    /**
     * Create the floating toggle button
     */
    private createToggleButton(): void {
        this.toggleButton = document.createElement('button')
        this.toggleButton.id = 'binder-toggle-btn'
        this.toggleButton.className = 'binder-toggle-btn'
        this.toggleButton.innerHTML = '📚'
        this.toggleButton.title = 'Open Game Binder (B)'
        this.toggleButton.addEventListener('click', () => this.toggle())

        const slot = document.getElementById('ui-right-center-group') ?? document.getElementById('ui-slot-top-right')
        if (slot) {
            slot.appendChild(this.toggleButton)
        } else {
            document.body.appendChild(this.toggleButton)
        }
    }
    
    /**
     * Create the main binder container (hidden by default)
     */
    private createBinderContainer(): void {
        this.container = document.createElement('div')
        this.container.id = 'game-library-binder'
        this.container.className = 'binder-container'

        const slot = document.getElementById('ui-slot-center')
        if (slot) {
            slot.appendChild(this.container)
        } else {
            document.body.appendChild(this.container)
        }
    }
    
    /**
     * Setup keyboard shortcut (B key)
     */
    private setupKeyboardShortcut(): void {
        this.keyboardHandler = (e: KeyboardEvent) => {
            // Don't trigger if user is typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return
            }
            
            if (e.key.toLowerCase() === 'b') {
                e.preventDefault()
                this.toggle()
            }
            
            // ESC to close
            if (e.key === 'Escape' && this.state.isOpen) {
                e.preventDefault()
                this.close()
            }
            
            // Arrow keys for navigation when open
            if (this.state.isOpen) {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault()
                    this.prevSpread()
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault()
                    this.nextSpread()
                }
            }
        }
        
        document.addEventListener('keydown', this.keyboardHandler)
    }
    
    /**
     * Toggle binder open/closed
     */
    public toggle(): void {
        if (this.state.isOpen) {
            this.close()
        } else {
            this.open()
        }
    }
    
    /**
     * Open the binder
     */
    public open(): void {
        if (!this.container) return

        this.pauseRendering()
        this.eventManager.emit<InputPauseEvent>(InputEventTypes.Pause, { reason: 'menu' })
        
        this.state.isOpen = true
        this.state.currentSpreadIndex = 0
        this.loadGames()
        this.render()
        
        this.container.style.display = 'flex'
        
        if (this.toggleButton) {
            this.toggleButton.innerHTML = '✕'
            this.toggleButton.title = 'Close Game Binder (B)'
        }
        
        GameLibraryBinderUI.logger.debug('Binder opened')
    }
    
    /**
     * Close the binder
     */
    public close(): void {
        if (!this.container) return
        
        this.state.isOpen = false
        this.state.selectedGame = null

        this.resumeRendering()
        this.eventManager.emit<InputResumeEvent>(InputEventTypes.Resume, { reason: 'menu' })
        
        this.container.style.display = 'none'
        
        if (this.toggleButton) {
            this.toggleButton.innerHTML = '📚'
            this.toggleButton.title = 'Open Game Binder (B)'
        }
        
        GameLibraryBinderUI.logger.debug('Binder closed')
    }
    
    /**
     * Load games from DataManager
     */
    private loadGames(): void {
        const games = this.dataManager.get<SteamGameData[]>('steam.games') || []
        
        // Sort by playtime (most played first)
        this.state.filteredGames = [...games].sort(
            (a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0)
        )
        
        GameLibraryBinderUI.logger.debug(`Loaded ${this.state.filteredGames.length} games`)
    }
    
    /**
     * Filter games by search query
     */
    private filterGames(query: string): void {
        const allGames = this.dataManager.get<SteamGameData[]>('steam.games') || []
        
        if (!query.trim()) {
            this.state.filteredGames = [...allGames].sort(
                (a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0)
            )
        } else {
            const lowerQuery = query.toLowerCase()
            this.state.filteredGames = allGames
                .filter(g => g.name.toLowerCase().includes(lowerQuery))
                .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
        }
        
        this.state.searchQuery = query
        this.state.currentSpreadIndex = 0  // Reset to first page
        this.render()
    }
    
    /**
     * Navigate to previous spread
     */
    private prevSpread(): void {
        if (this.state.currentSpreadIndex > 0) {
            this.state.currentSpreadIndex--
            this.render()
        }
    }
    
    /**
     * Navigate to next spread
     */
    private nextSpread(): void {
        const totalGames = this.state.filteredGames.length
        const gamesPerSpread = GAMES_PER_PAGE * PAGES_PER_SPREAD
        const maxSpreadIndex = Math.ceil(totalGames / gamesPerSpread) - 1
        
        if (this.state.currentSpreadIndex < maxSpreadIndex) {
            this.state.currentSpreadIndex++
            this.render()
        }
    }
    
    /**
     * Get games for current spread
     */
    private getSpreadGames(): { leftPage: SteamGameData[], rightPage: SteamGameData[] } {
        const gamesPerSpread = GAMES_PER_PAGE * PAGES_PER_SPREAD
        const startIndex = this.state.currentSpreadIndex * gamesPerSpread
        
        const spreadGames = this.state.filteredGames.slice(startIndex, startIndex + gamesPerSpread)
        
        return {
            leftPage: spreadGames.slice(0, GAMES_PER_PAGE),
            rightPage: spreadGames.slice(GAMES_PER_PAGE, GAMES_PER_PAGE * 2)
        }
    }
    
    /**
     * Render the binder UI
     */
    private render(): void {
        if (!this.container) return
        
        const { leftPage, rightPage } = this.getSpreadGames()
        const totalGames = this.state.filteredGames.length
        const gamesPerSpread = GAMES_PER_PAGE * PAGES_PER_SPREAD
        const totalSpreads = Math.max(1, Math.ceil(totalGames / gamesPerSpread))
        const leftPageNum = this.state.currentSpreadIndex * 2
        const rightPageNum = leftPageNum + 1
        
        const canGoPrev = this.state.currentSpreadIndex > 0
        const canGoNext = this.state.currentSpreadIndex < totalSpreads - 1
        
        this.container.innerHTML = `
            <div class="binder-spread">
                <div class="binder-surface-top">
                    <div class="binder-search-wrapper">
                        <input 
                            type="text" 
                            id="binder-search" 
                            class="binder-search"
                            placeholder="🔍 Search ${totalGames} games" 
                            value="${this.escapeHtml(this.state.searchQuery)}"
                        >
                        <button 
                            id="binder-search-clear"
                            class="binder-search-clear ${this.state.searchQuery ? '' : 'hidden'}"
                            title="Clear search"
                        >✕</button>
                    </div>
                </div>

                <div class="binder-spine"></div>
                
                <!-- Left nav button -->
                <button id="binder-prev" class="binder-nav-btn side-nav left ${canGoPrev ? '' : 'disabled'}">◄</button>
                
                ${this.renderPage(leftPage, leftPageNum)}
                <div class="binder-gutter"></div>
                ${this.renderPage(rightPage, rightPageNum)}
                
                <!-- Right nav button -->
                <button id="binder-next" class="binder-nav-btn side-nav right ${canGoNext ? '' : 'disabled'}">►</button>

                <div class="binder-surface-bottom left">Press <kbd>B</kbd> to close<span class="hint-sep">·</span><kbd>←</kbd> <kbd>→</kbd> to navigate</div>
                <div class="binder-surface-bottom right">${totalSpreads * 2} pages total</div>
            </div>
        `
        
        // Attach event listeners
        this.attachEventListeners()
    }
    
    /**
     * Render a single page with 4 game slots
     */
    private renderPage(games: SteamGameData[], pageNum: number): string {
        const slots = []
        
        for (let i = 0; i < GAMES_PER_PAGE; i++) {
            const game = games[i]
            slots.push(this.renderGameSlot(game, i))
        }
        
        return `
            <div class="binder-page ${pageNum % 2 === 0 ? 'left' : 'right'}">
                <div class="binder-page-shine"></div>
                ${slots.join('')}
                <div class="binder-page-number">Page ${pageNum + 1}</div>
            </div>
        `
    }

    private getRenderLifecycleController(): RenderLifecycleController | null {
        return this.dataManager.get<RenderLifecycleController>('core.sceneManager') || null
    }

    private pauseRendering(): void {
        this.getRenderLifecycleController()?.pauseRendering()
    }

    private resumeRendering(): void {
        this.getRenderLifecycleController()?.resumeRendering()
    }
    
    /**
     * Render a single game slot
     */
    private renderGameSlot(game: SteamGameData | undefined, _slotIndex: number): string {
        if (!game) {
            return `<div class="game-slot empty"></div>`
        }
        
        const headerUrl = game.artwork?.header || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`
        const playtimeHours = Math.round((game.playtime_forever || 0) / 60)
        
        return `
            <div class="game-slot" data-appid="${game.appid}" style="background-image: url('${headerUrl}');">
                <div class="game-slot-shine"></div>
                <div class="game-info">
                    <div class="game-name">${this.escapeHtml(game.name)}</div>
                    <div class="game-playtime">${playtimeHours}h played</div>
                </div>
            </div>
        `
    }
    
    /**
     * Attach event listeners after render
     */
    private attachEventListeners(): void {
        // Search input with focus preservation
        const searchInput = document.getElementById('binder-search') as HTMLInputElement
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const input = e.target as HTMLInputElement
                const pos = input.selectionStart || 0
                this.filterGames(input.value)
                // Restore focus after re-render
                window.requestAnimationFrame(() => {
                    const newInput = document.getElementById('binder-search') as HTMLInputElement
                    if (newInput) {
                        newInput.focus()
                        newInput.setSelectionRange(pos, pos)
                    }
                })
            })
            
            // Prevent keyboard shortcuts while typing in search
            searchInput.addEventListener('keydown', (e) => {
                e.stopPropagation()
            })
        }
        
        // Search clear button
        const clearBtn = document.getElementById('binder-search-clear')
        if (clearBtn && this.state.searchQuery) {
            clearBtn.addEventListener('click', () => {
                this.filterGames('')
                // Focus the search input after clearing
                window.requestAnimationFrame(() => {
                    const input = document.getElementById('binder-search') as HTMLInputElement
                    if (input) input.focus()
                })
            })
        }
        
        // Navigation buttons
        const prevBtn = document.getElementById('binder-prev')
        const nextBtn = document.getElementById('binder-next')
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevSpread())
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextSpread())
        }
        
        // Game slot clicks
        const slots = this.container?.querySelectorAll('.game-slot[data-appid]')
        slots?.forEach(slot => {
            slot.addEventListener('click', () => {
                const appid = parseInt(slot.getAttribute('data-appid') || '0')
                const game = this.state.filteredGames.find(g => g.appid === appid)
                if (game) {
                    this.selectGame(game)
                }
            })
        })
    }
    
    /**
     * Open the detail panel for a specific game by appid.
     * Called externally (e.g. from scene raycast click).
     */
    public openGameDetail(appid: number | string): void {
        // Search filteredGames first (fast path if binder is open/loaded),
        // then fall back to full library from DataManager
        let game = this.state.filteredGames.find(g => String(g.appid) === String(appid))
        if (!game) {
            const allGames = this.dataManager.get<SteamGameData[]>('steam.games') ?? []
            game = allGames.find(g => String(g.appid) === String(appid))
        }
        if (game) {
            this.selectGame(game)
        } else {
            GameLibraryBinderUI.logger.warn(`openGameDetail: appid ${appid} not found in library`)
        }
    }

    private readonly onGameSelected = (event: CustomEvent<GameSelectedEvent>): void => {
        this.openGameDetail(event.detail.appid)
    }

    /**
     * Select a game to show details
     */
    private selectGame(game: SteamGameData): void {
        this.state.selectedGame = game
        GameLibraryBinderUI.logger.debug(`Selected game: ${game.name}`)
        this.renderDetailPanel()
    }
    
    /**
     * Close the detail panel
     */
    private closeDetailPanel(): void {
        this.state.selectedGame = null
        const panel = document.getElementById('binder-detail-panel')
        if (panel) {
            panel.remove()
        }
    }
    
    /**
     * Render the game detail panel
     */
    private renderDetailPanel(): void {
        const game = this.state.selectedGame
        if (!game || !this.container) return
        
        // Remove existing panel if any
        const existing = document.getElementById('binder-detail-panel')
        if (existing) existing.remove()
        
        const headerUrl = game.artwork?.header || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`
        const libraryUrl = game.artwork?.library || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
        const playtimeHours = Math.round((game.playtime_forever || 0) / 60)
        const playtime2Weeks = Math.round((game.playtime_2weeks || 0) / 60)

        // Build categories/genres block
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
        
        // Create a sanitized JSON blob for display
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
        
        this.container.appendChild(panel)
        
        // Add close button listener
        const closeBtn = document.getElementById('detail-close-btn')
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeDetailPanel())
        }
        
        // Close on ESC
        const escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.closeDetailPanel()
                document.removeEventListener('keydown', escHandler)
            }
        }
        document.addEventListener('keydown', escHandler)
        
        // Close when clicking outside
        panel.addEventListener('click', (e) => {
            if (e.target === panel) {
                this.closeDetailPanel()
            }
        })
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }
    
    /**
     * Dispose of the binder UI
     */
    public dispose(): void {
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler)
        }

        EventManager.getInstance().deregisterEventHandler<GameSelectedEvent>(
            GameEventTypes.Selected,
            this.onGameSelected
        )

        this.container?.remove()
        this.toggleButton?.remove()

        GameLibraryBinderUI.instance = null
    }
}
