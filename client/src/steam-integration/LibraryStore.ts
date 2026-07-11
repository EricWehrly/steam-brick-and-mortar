/**
 * Persistence for Library — the single source of truth SteamIntegration.handleGameStart()
 * reads to decide what to auto-load. Split out from SteamIntegration itself: this is pure
 * localStorage I/O with no dependency on library *state* (gameLibrary, events), easy to read
 * and test in isolation from the class that actually applies a loaded library.
 *
 * Reset, not migrate: a pre-convergence blob (the old LibrarySource union) doesn't have
 * provenance.channel, so it fails validation below and is treated the same as no persisted
 * library — see docs/plans/library-source-convergence-plan.md, Q8.
 */
import type { Library } from './Library'
import { Logger } from '../utils/Logger'

const logger = Logger.createLogFunctions('LibraryStore')
const STORAGE_KEY = 'sbam_library_source'

export function persistLibrary(library: Library): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(library))
    } catch (error) {
        logger.warn('Failed to persist library:', error)
    }
}

export function loadPersistedLibrary(): Library | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<Library>
        if (!Array.isArray(parsed.games) || parsed.games.length === 0) return null
        if (!parsed.provenance?.channel) return null
        return parsed as Library
    } catch (error) {
        logger.warn('Failed to read persisted library:', error)
        return null
    }
}

export function clearPersistedLibrary(): void {
    localStorage.removeItem(STORAGE_KEY)
}
