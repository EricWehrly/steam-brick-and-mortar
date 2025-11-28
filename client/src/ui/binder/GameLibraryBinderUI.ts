/**
 * Game Library Binder UI
 * 
 * A nostalgic CD/DVD binder interface for browsing Steam library games.
 * Features black felt exterior, clear plastic sheets with 4 games each,
 * and a side-by-side page spread view.
 */

import { EventManager } from '../../core/EventManager'
import { DataManager, DataDomain } from '../../core/data'
import type { SteamGameData } from '../../scene/game-box/types/GameData'
import { Logger } from '../../utils/Logger'

const GAMES_PER_PAGE = 4
const PAGES_PER_SPREAD = 2

export interface BinderState {
    isOpen: boolean
    currentSpreadIndex: number  // Which page spread we're viewing (0 = pages 0-1, 1 = pages 2-3, etc.)
    selectedGame: SteamGameData | null
    searchQuery: string
    filteredGames: SteamGameData[]
}

export class GameLibraryBinderUI {
    private static readonly logger = Logger.withContext(GameLibraryBinderUI.name)
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
        
        GameLibraryBinderUI.logger.info('GameLibraryBinderUI initialized')
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
        
        // Add styles inline for now (can move to CSS file later)
        this.toggleButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(145deg, #2a2a2a, #1a1a1a);
            border: 2px solid #444;
            color: white;
            font-size: 24px;
            cursor: pointer;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            transition: transform 0.2s, box-shadow 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        `
        
        this.toggleButton.addEventListener('mouseenter', () => {
            if (this.toggleButton) {
                this.toggleButton.style.transform = 'scale(1.1)'
                this.toggleButton.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.5)'
            }
        })
        
        this.toggleButton.addEventListener('mouseleave', () => {
            if (this.toggleButton) {
                this.toggleButton.style.transform = 'scale(1)'
                this.toggleButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)'
            }
        })
        
        document.body.appendChild(this.toggleButton)
    }
    
    /**
     * Create the main binder container (hidden by default)
     */
    private createBinderContainer(): void {
        this.container = document.createElement('div')
        this.container.id = 'game-library-binder'
        this.container.className = 'binder-container'
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 999;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `
        
        document.body.appendChild(this.container)
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
        
        this.container.innerHTML = `
            <div class="binder-header" style="
                width: 100%;
                max-width: 1200px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px;
                color: white;
            ">
                <h1 style="margin: 0; font-size: 24px;">📚 Steam Library Binder</h1>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input 
                        type="text" 
                        id="binder-search" 
                        placeholder="🔍 Search games..." 
                        value="${this.escapeHtml(this.state.searchQuery)}"
                        style="
                            padding: 8px 16px;
                            border-radius: 20px;
                            border: 1px solid #444;
                            background: #222;
                            color: white;
                            font-size: 14px;
                            width: 200px;
                        "
                    >
                    <span style="color: #888; font-size: 14px;">${totalGames} games</span>
                </div>
            </div>
            
            <div class="binder-spread" style="
                display: flex;
                gap: 20px;
                padding: 20px;
                background: linear-gradient(145deg, #1a1a1a, #0a0a0a);
                border-radius: 8px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            ">
                ${this.renderPage(leftPage, leftPageNum)}
                <div style="width: 2px; background: #333;"></div>
                ${this.renderPage(rightPage, rightPageNum)}
            </div>
            
            <div class="binder-navigation" style="
                display: flex;
                gap: 20px;
                align-items: center;
                padding: 20px;
                color: white;
            ">
                <button id="binder-prev" style="
                    padding: 10px 20px;
                    border-radius: 8px;
                    border: 1px solid #444;
                    background: ${this.state.currentSpreadIndex > 0 ? '#333' : '#222'};
                    color: ${this.state.currentSpreadIndex > 0 ? 'white' : '#666'};
                    cursor: ${this.state.currentSpreadIndex > 0 ? 'pointer' : 'not-allowed'};
                    font-size: 14px;
                ">◄ Prev</button>
                <span style="font-size: 14px;">
                    Pages ${leftPageNum + 1}-${rightPageNum + 1} / ${totalSpreads * 2}
                </span>
                <button id="binder-next" style="
                    padding: 10px 20px;
                    border-radius: 8px;
                    border: 1px solid #444;
                    background: ${this.state.currentSpreadIndex < totalSpreads - 1 ? '#333' : '#222'};
                    color: ${this.state.currentSpreadIndex < totalSpreads - 1 ? 'white' : '#666'};
                    cursor: ${this.state.currentSpreadIndex < totalSpreads - 1 ? 'pointer' : 'not-allowed'};
                    font-size: 14px;
                ">Next ►</button>
            </div>
            
            <div style="color: #666; font-size: 12px; margin-top: 10px;">
                Press <kbd style="background: #333; padding: 2px 6px; border-radius: 4px;">B</kbd> to close • 
                <kbd style="background: #333; padding: 2px 6px; border-radius: 4px;">←</kbd>
                <kbd style="background: #333; padding: 2px 6px; border-radius: 4px;">→</kbd> to navigate
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
            <div class="binder-page" style="
                width: 280px;
                padding: 15px;
                background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
                border-radius: 4px;
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
            ">
                ${slots.join('')}
            </div>
        `
    }
    
    /**
     * Render a single game slot
     */
    private renderGameSlot(game: SteamGameData | undefined, slotIndex: number): string {
        if (!game) {
            return `
                <div class="game-slot empty" style="
                    aspect-ratio: 460 / 215;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 4px;
                    border: 1px dashed #333;
                "></div>
            `
        }
        
        const headerUrl = game.artwork?.header || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`
        const playtimeHours = Math.round((game.playtime_forever || 0) / 60)
        
        return `
            <div class="game-slot" data-appid="${game.appid}" style="
                aspect-ratio: 460 / 215;
                background: url('${headerUrl}') center/cover no-repeat;
                background-color: #222;
                border-radius: 4px;
                cursor: pointer;
                position: relative;
                overflow: hidden;
                transition: transform 0.2s, box-shadow 0.2s;
            " onmouseenter="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 16px rgba(0,0,0,0.5)'"
               onmouseleave="this.style.transform='scale(1)'; this.style.boxShadow='none'">
                <div style="
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    padding: 6px 8px;
                    background: linear-gradient(transparent, rgba(0,0,0,0.9));
                ">
                    <div style="
                        font-size: 10px;
                        color: white;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        font-weight: 500;
                    ">${this.escapeHtml(game.name)}</div>
                    <div style="font-size: 9px; color: #aaa;">${playtimeHours}h played</div>
                </div>
            </div>
        `
    }
    
    /**
     * Attach event listeners after render
     */
    private attachEventListeners(): void {
        // Search input
        const searchInput = document.getElementById('binder-search') as HTMLInputElement
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterGames((e.target as HTMLInputElement).value)
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
     * Select a game to show details
     */
    private selectGame(game: SteamGameData): void {
        this.state.selectedGame = game
        GameLibraryBinderUI.logger.debug(`Selected game: ${game.name}`)
        
        // TODO: Show detail panel
        // For now, just log it
        console.log('Selected game:', game)
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
        
        this.container?.remove()
        this.toggleButton?.remove()
        
        GameLibraryBinderUI.instance = null
    }
}
