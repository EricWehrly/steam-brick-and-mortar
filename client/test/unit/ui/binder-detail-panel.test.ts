/**
 * Unit tests for BinderGameDetailPanel
 *
 * Covers: show/hide lifecycle, HTML structure, categories rendering,
 * spotlight button wiring, ESC/click-outside close paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BinderGameDetailPanel } from '../../../src/ui/binder/BinderGameDetailPanel'
import type { SteamGameData } from '../../../src/scene/game-box/types/GameData'

vi.mock('../../../src/debug/GameSpotlight')

const mockGame: SteamGameData = {
    appid: 440,
    name: 'Team Fortress 2',
    playtime_forever: 6000,  // 100 hours
    playtime_2weeks: 120,
    genres: [
        { id: '1', description: 'Action' },
        { id: '2', description: 'Free to Play' }
    ],
    categories: [
        { id: '1', description: 'Multi-player' },
        { id: '22', description: 'Steam Achievements' }
    ],
    artwork: {
        header: 'https://example.com/header.jpg',
        library: 'https://example.com/library.jpg'
    }
}

const minimalGame: SteamGameData = {
    appid: 730,
    name: 'Counter-Strike 2',
    playtime_forever: 0
}

describe('BinderGameDetailPanel', () => {
    let panel: BinderGameDetailPanel

    beforeEach(() => {
        // Provide a minimal document.body
        document.body.innerHTML = ''
        panel = new BinderGameDetailPanel()
    })

    afterEach(() => {
        panel.hide()
        document.body.innerHTML = ''
    })

    describe('lifecycle', () => {
        it('show() mounts a panel element to document.body', () => {
            panel.show(mockGame)
            const el = document.getElementById('binder-detail-panel')
            expect(el).toBeTruthy()
        })

        it('hide() removes the panel from document.body', () => {
            panel.show(mockGame)
            panel.hide()
            expect(document.getElementById('binder-detail-panel')).toBeNull()
        })

        it('calling show() twice replaces the old panel (not duplicates)', () => {
            panel.show(mockGame)
            panel.show(minimalGame)
            const panels = document.querySelectorAll('#binder-detail-panel')
            expect(panels.length).toBe(1)
            // Title should now be for the second game
            expect(document.querySelector('.detail-title')?.textContent).toContain('Counter-Strike 2')
        })

        it('hide() before show() does not throw', () => {
            expect(() => panel.hide()).not.toThrow()
        })
    })

    describe('content', () => {
        it('renders the game title', () => {
            panel.show(mockGame)
            expect(document.querySelector('.detail-title')?.textContent).toContain('Team Fortress 2')
        })

        it('renders playtime in hours', () => {
            panel.show(mockGame)
            const content = document.querySelector('.detail-content')?.innerHTML ?? ''
            expect(content).toContain('100 hours')
        })

        it('renders genres as tags', () => {
            panel.show(mockGame)
            const tags = Array.from(document.querySelectorAll('.detail-tag')).map(t => t.textContent)
            expect(tags).toContain('Action')
            expect(tags).toContain('Free to Play')
        })

        it('renders steam categories as tags', () => {
            panel.show(mockGame)
            const tags = Array.from(document.querySelectorAll('.detail-tag')).map(t => t.textContent)
            expect(tags).toContain('Multi-player')
            expect(tags).toContain('Steam Achievements')
        })

        it('omits categories section for games with no genres/categories', () => {
            panel.show(minimalGame)
            expect(document.querySelector('.detail-categories')).toBeNull()
        })

        it('includes a steam:// play link', () => {
            panel.show(mockGame)
            const playLink = document.querySelector('a.detail-btn.play') as HTMLAnchorElement
            expect(playLink?.href).toBe('steam://run/440')
        })

        it('includes a spotlight button', () => {
            panel.show(mockGame)
            const btn = document.querySelector('#detail-spotlight-btn')
            expect(btn).toBeTruthy()
        })
    })

    describe('close behaviour', () => {
        it('close button removes the panel', () => {
            panel.show(mockGame)
            const closeBtn = document.getElementById('detail-close-btn') as HTMLButtonElement
            closeBtn.click()
            expect(document.getElementById('binder-detail-panel')).toBeNull()
        })

        it('onClose callback fires when close button is clicked', () => {
            const onClose = vi.fn()
            panel.show(mockGame, { onClose })
            const closeBtn = document.getElementById('detail-close-btn') as HTMLButtonElement
            closeBtn.click()
            expect(onClose).toHaveBeenCalledOnce()
        })

        it('ESC key closes the panel', () => {
            panel.show(mockGame)
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            expect(document.getElementById('binder-detail-panel')).toBeNull()
        })

        it('clicking the panel backdrop closes the panel', () => {
            panel.show(mockGame)
            const el = document.getElementById('binder-detail-panel')!
            el.dispatchEvent(new MouseEvent('click', { bubbles: false }))
            expect(document.getElementById('binder-detail-panel')).toBeNull()
        })
    })

    describe('XSS safety', () => {
        it('escapes HTML in game name', () => {
            const xssGame: SteamGameData = { appid: 1, name: '<script>alert(1)</script>', playtime_forever: 0 }
            panel.show(xssGame)
            const title = document.querySelector('.detail-title')
            // textContent should contain literal tag chars, not execute script
            expect(title?.innerHTML).not.toContain('<script>')
        })
    })
})
