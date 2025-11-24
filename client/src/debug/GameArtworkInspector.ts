/**
 * Game Artwork Inspector - Debug tool for inspecting game artwork
 * 
 * Modal UI that displays all artwork for a specific game:
 * - All image URLs (icon, logo, header, library)
 * - Cache status for each image
 * - Image previews
 * - Metadata (size, timestamp, fallback info)
 * 
 * Usage:
 *   window.inspectGameArtwork("UNLOVED")
 *   window.inspectGameArtwork(611500)
 */

import { GameFinder } from './GameFinder'
import { ImageManager } from '../steam/images/ImageManager'
import { DataManager } from '../core/data/DataManager'
import type { SteamGame } from '../steam/SteamApiClientLegacy'
import type { ImageCacheEntry } from '../steam/images/ImageManager'
import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'

interface ArtworkInfo {
    type: string
    url: string
    cached: boolean
    cacheEntry?: ImageCacheEntry
    isBeingUsed: boolean
    preview?: string
}

export class GameArtworkInspector {
    private modalElement: HTMLElement | null = null
    private gameFinder: GameFinder
    private imageManager: ImageManager

    constructor() {
        this.gameFinder = new GameFinder()
        this.imageManager = ImageManager.getInstance()
    }

    async inspect(identifier: string | number): Promise<void> {
        // First try to find in scene
        const sceneGame = this.gameFinder.find(identifier)
        
        // Then look up Steam game data (works for both scene and non-scene games)
        const steamGame = await this.findSteamGameData(
            sceneGame?.appid ?? sceneGame?.name ?? identifier
        )
        
        if (!steamGame) {
            console.error(`❌ [GameArtworkInspector] Game not found in Steam library: ${identifier}`)
            this.showError(`Game not found in Steam library: ${identifier}`)
            return
        }

        console.log(`🎨 [GameArtworkInspector] Inspecting artwork for: ${steamGame.name}`)
        console.log(`   Scene Status: ${sceneGame ? `✅ In scene (${sceneGame.rendererType})` : '❌ Not in scene'}`)

        const artworkInfo = await this.gatherArtworkInfo(steamGame, sceneGame?.name)
        this.showModal(steamGame, artworkInfo, !!sceneGame)
    }

    private async findSteamGameData(identifier: string | number | undefined): Promise<SteamGame | null> {
        const steamGamesData = DataManager.getInstance().get<SteamGame[]>('steam.games')
        
        if (!steamGamesData) {
            return null
        }

        if (typeof identifier === 'number') {
            return steamGamesData.find(g => g.appid === identifier) ?? null
        } else if (typeof identifier === 'string') {
            const searchTerm = identifier.toLowerCase()
            return steamGamesData.find(g => 
                g.name.toLowerCase().includes(searchTerm)
            ) ?? null
        }

        return null
    }

    private async gatherArtworkInfo(steamGame: SteamGame, usedName?: string): Promise<ArtworkInfo[]> {
        const artwork: ArtworkInfo[] = []
        
        const artworkTypes = ['icon', 'logo', 'header', 'library'] as const
        
        for (const type of artworkTypes) {
            const url = steamGame.artwork[type]
            
            if (!url || url.trim() === '') {
                continue
            }

            const cacheEntry = await this.imageManager.getFromCache(url)
            const cached = !!cacheEntry
            
            let preview: string | undefined
            if (cacheEntry?.blob) {
                preview = URL.createObjectURL(cacheEntry.blob)
            }

            const isBeingUsed = this.determineIfUsed(type, usedName, steamGame)

            artwork.push({
                type,
                url,
                cached,
                cacheEntry,
                isBeingUsed,
                preview
            })
        }

        return artwork
    }

    private determineIfUsed(artworkType: string, usedName?: string, steamGame?: SteamGame): boolean {
        if (artworkType === 'library') {
            return true
        }
        
        if (artworkType === 'header') {
            return !steamGame?.artwork.library || steamGame.artwork.library.trim() === ''
        }

        if (artworkType === 'logo' && usedName) {
            return !steamGame?.artwork.library && !steamGame?.artwork.header
        }

        return false
    }

    private showModal(steamGame: SteamGame, artworkInfo: ArtworkInfo[], inScene: boolean): void {
        if (this.modalElement) {
            this.close()
        }

        this.modalElement = document.createElement('div')
        this.modalElement.className = 'game-artwork-inspector-modal'
        this.modalElement.innerHTML = this.buildModalHTML(steamGame, artworkInfo, inScene)

        document.body.appendChild(this.modalElement)

        this.attachEventListeners()
    }

    private buildModalHTML(steamGame: SteamGame, artworkInfo: ArtworkInfo[], inScene: boolean): string {
        const artworkHTML = artworkInfo.map(info => this.buildArtworkItemHTML(info)).join('')
        const sceneStatus = inScene 
            ? '<span class="badge badge-success">IN SCENE</span>' 
            : '<span class="badge badge-warning">NOT IN SCENE</span>'

        return `
            <div class="modal-backdrop" data-action="close"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>🎨 Game Artwork Inspector</h2>
                    <button class="close-btn" data-action="close">✕</button>
                </div>
                <div class="modal-body">
                    <div class="game-info">
                        <div class="game-info-header">
                            <h3>${this.escapeHtml(steamGame.name)}</h3>
                            ${sceneStatus}
                        </div>
                        <p class="game-meta">AppID: ${steamGame.appid} | Playtime: ${this.formatPlaytime(steamGame.playtime_forever)}</p>
                    </div>
                    <div class="artwork-list">
                        ${artworkHTML}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" data-action="close">Close</button>
                </div>
            </div>
        `
    }

    private buildArtworkItemHTML(info: ArtworkInfo): string {
        const statusIcon = info.cached ? '✅' : '❌'
        const usedBadge = info.isBeingUsed ? '<span class="badge badge-primary">IN USE</span>' : ''
        const cachedBadge = info.cached ? '<span class="badge badge-success">CACHED</span>' : '<span class="badge badge-error">NOT CACHED</span>'
        
        const cacheInfo = info.cacheEntry ? `
            <div class="cache-metadata">
                <span>Size: ${this.formatBytes(info.cacheEntry.size)}</span>
                <span>Cached: ${this.formatTimestamp(info.cacheEntry.timestamp)}</span>
                ${info.cacheEntry.isFallback ? '<span class="badge badge-warning">FALLBACK</span>' : ''}
                ${info.cacheEntry.originalType ? `<span class="text-muted">Original: ${info.cacheEntry.originalType}</span>` : ''}
            </div>
        ` : ''

        const previewHTML = info.preview ? `
            <div class="artwork-preview">
                <img src="${info.preview}" alt="${info.type}" loading="lazy" />
            </div>
        ` : '<div class="artwork-preview no-preview">No preview available</div>'

        return `
            <div class="artwork-item ${info.cached ? 'cached' : 'not-cached'}">
                <div class="artwork-header">
                    <h4>${statusIcon} ${info.type.toUpperCase()}</h4>
                    <div class="badges">
                        ${usedBadge}
                        ${cachedBadge}
                    </div>
                </div>
                ${previewHTML}
                <div class="artwork-details">
                    <div class="url-display">
                        <strong>URL:</strong>
                        <code class="url-code">${this.truncateUrl(info.url)}</code>
                        <button class="btn-copy" data-url="${this.escapeHtml(info.url)}" title="Copy URL">📋</button>
                    </div>
                    ${cacheInfo}
                </div>
            </div>
        `
    }

    private attachEventListeners(): void {
        if (!this.modalElement) return

        this.modalElement.querySelectorAll('[data-action="close"]').forEach(btn => {
            btn.addEventListener('click', () => this.close())
        })

        this.modalElement.querySelectorAll('.btn-copy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = (e.currentTarget as HTMLElement).getAttribute('data-url')
                if (url) {
                    navigator.clipboard.writeText(url)
                    console.log('📋 Copied to clipboard:', url)
                }
            })
        })

        document.addEventListener('keydown', this.handleKeydown.bind(this))
    }

    private handleKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            this.close()
        }
    }

    close(): void {
        if (this.modalElement) {
            const previews = this.modalElement.querySelectorAll('img[src^="blob:"]')
            previews.forEach(img => {
                URL.revokeObjectURL((img as HTMLImageElement).src)
            })

            this.modalElement.remove()
            this.modalElement = null
            
            document.removeEventListener('keydown', this.handleKeydown.bind(this))
        }
    }

    private showError(message: string): void {
        console.error(`❌ [GameArtworkInspector] ${message}`)
        
        if (this.modalElement) {
            this.close()
        }

        this.modalElement = document.createElement('div')
        this.modalElement.className = 'game-artwork-inspector-modal error-modal'
        this.modalElement.innerHTML = `
            <div class="modal-backdrop" data-action="close"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>❌ Error</h2>
                    <button class="close-btn" data-action="close">✕</button>
                </div>
                <div class="modal-body">
                    <p>${this.escapeHtml(message)}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" data-action="close">Close</button>
                </div>
            </div>
        `

        document.body.appendChild(this.modalElement)

        this.modalElement.querySelectorAll('[data-action="close"]').forEach(btn => {
            btn.addEventListener('click', () => this.close())
        })
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }

    private formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    private formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp)
        const now = Date.now()
        const diff = now - timestamp
        
        if (diff < 60000) return 'Just now'
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
        
        return date.toLocaleDateString()
    }

    private formatPlaytime(minutes: number): string {
        if (minutes < 60) return `${minutes}m`
        const hours = Math.floor(minutes / 60)
        return `${hours}h`
    }

    private truncateUrl(url: string, maxLength: number = 60): string {
        if (url.length <= maxLength) return url
        return url.substring(0, maxLength - 3) + '...'
    }
}

export function initializeGameArtworkInspector(): void {
    const inspector = new GameArtworkInspector()
    
    // @ts-ignore - Intentionally adding to window for debugging
    window.inspectGameArtwork = (identifier: string | number) => {
        inspector.inspect(identifier)
    }
    
    console.debug('🎨 [GameArtworkInspector] Inspector exposed to window:')
    console.debug('  window.inspectGameArtwork("UNLOVED")    - Inspect game by name')
    console.debug('  window.inspectGameArtwork(611500)       - Inspect game by appid')
}

EventManager.getInstance().registerEventHandler(GameEventTypes.Start, initializeGameArtworkInspector)
