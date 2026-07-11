/**
 * Pure localStorage I/O for Library — no dependency on library state, so these are tested
 * directly against localStorage rather than through SteamIntegration.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
    persistLibrary,
    loadPersistedLibrary,
    clearPersistedLibrary
} from '../../../src/steam-integration/LibraryStore'
import type { Library } from '../../../src/steam-integration/Library'

const ONLINE_LIBRARY: Library = {
    owner: { steamId: '76561198000000000', displayName: 'test-vanity-name' },
    games: [{ appid: 440, name: 'Team Fortress 2', playtimeForever: 100, lastPlayed: 1700000000 }],
    provenance: { channel: 'online', capturedAt: '2026-07-10T00:00:00.000Z' }
}
const IMPORTED_LIBRARY: Library = {
    owner: { displayName: 'Test Account' },
    games: [{ appid: 440, name: 'Team Fortress 2', playtimeForever: 100 }],
    provenance: { channel: 'file', capturedAt: '2026-07-10T00:00:00.000Z' }
}

describe('LibraryStore', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('round-trips an online library', () => {
        persistLibrary(ONLINE_LIBRARY)
        expect(loadPersistedLibrary()).toEqual(ONLINE_LIBRARY)
    })

    it('round-trips an imported library', () => {
        persistLibrary(IMPORTED_LIBRARY)
        expect(loadPersistedLibrary()).toEqual(IMPORTED_LIBRARY)
    })

    it('returns null when nothing has been persisted', () => {
        expect(loadPersistedLibrary()).toBeNull()
    })

    it('clears the persisted library', () => {
        persistLibrary(ONLINE_LIBRARY)
        clearPersistedLibrary()
        expect(loadPersistedLibrary()).toBeNull()
    })

    it('rejects a corrupted library with an empty games array', () => {
        localStorage.setItem('sbam_library_source', JSON.stringify({
            owner: {}, games: [], provenance: { channel: 'file', capturedAt: '' }
        }))
        expect(loadPersistedLibrary()).toBeNull()
    })

    it('rejects a library with no provenance channel', () => {
        localStorage.setItem('sbam_library_source', JSON.stringify({
            owner: {}, games: [{ appid: 440, name: 'Team Fortress 2', playtimeForever: 0 }], provenance: {}
        }))
        expect(loadPersistedLibrary()).toBeNull()
    })

    it('rejects a pre-convergence LibrarySource blob (reset, not migrated)', () => {
        localStorage.setItem('sbam_library_source', JSON.stringify({ type: 'online', userInput: 'test-vanity-name' }))
        expect(loadPersistedLibrary()).toBeNull()
    })

    it('returns null rather than throwing on unparsable JSON', () => {
        localStorage.setItem('sbam_library_source', '{not valid json')
        expect(loadPersistedLibrary()).toBeNull()
    })
})
