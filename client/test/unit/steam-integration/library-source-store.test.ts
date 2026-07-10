/**
 * Pure localStorage I/O for LibrarySource — no dependency on library state, so these are tested
 * directly against localStorage rather than through SteamIntegration.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
    persistLibrarySource,
    loadPersistedLibrarySource,
    clearPersistedLibrarySource
} from '../../../src/steam-integration/LibrarySourceStore'
import type { LibrarySource } from '../../../src/steam-integration/LibrarySource'

const ONLINE_SOURCE: LibrarySource = { type: 'online', userInput: 'test-vanity-name' }
const IMPORTED_SOURCE: LibrarySource = {
    type: 'imported',
    channel: 'file',
    importedAt: '2026-07-10T00:00:00.000Z',
    displayName: 'Test Account',
    games: [{ appid: 440, name: 'Team Fortress 2', playtime_forever: 100 }]
}

describe('LibrarySourceStore', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('round-trips an online source', () => {
        persistLibrarySource(ONLINE_SOURCE)
        expect(loadPersistedLibrarySource()).toEqual(ONLINE_SOURCE)
    })

    it('round-trips an imported source', () => {
        persistLibrarySource(IMPORTED_SOURCE)
        expect(loadPersistedLibrarySource()).toEqual(IMPORTED_SOURCE)
    })

    it('returns null when nothing has been persisted', () => {
        expect(loadPersistedLibrarySource()).toBeNull()
    })

    it('clears the persisted source', () => {
        persistLibrarySource(ONLINE_SOURCE)
        clearPersistedLibrarySource()
        expect(loadPersistedLibrarySource()).toBeNull()
    })

    it('rejects a corrupted imported source with an empty games array', () => {
        localStorage.setItem('sbam_library_source', JSON.stringify({ type: 'imported', channel: 'file', importedAt: '', games: [] }))
        expect(loadPersistedLibrarySource()).toBeNull()
    })

    it('rejects a corrupted online source with no userInput', () => {
        localStorage.setItem('sbam_library_source', JSON.stringify({ type: 'online', userInput: '' }))
        expect(loadPersistedLibrarySource()).toBeNull()
    })

    it('returns null rather than throwing on unparsable JSON', () => {
        localStorage.setItem('sbam_library_source', '{not valid json')
        expect(loadPersistedLibrarySource()).toBeNull()
    })
})
