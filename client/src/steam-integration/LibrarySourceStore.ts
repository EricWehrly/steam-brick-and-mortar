/**
 * Persistence for LibrarySource — the single source of truth SteamIntegration.handleGameStart()
 * reads to decide what to auto-load. Split out from SteamIntegration itself: this is pure
 * localStorage I/O with no dependency on library *state* (gameLibrary, events), easy to read
 * and test in isolation from the class that actually applies a loaded library.
 */
import type { LibrarySource } from './LibrarySource'
import { Logger } from '../utils/Logger'

const logger = Logger.createLogFunctions('LibrarySourceStore')
const STORAGE_KEY = 'sbam_library_source'

export function persistLibrarySource(source: LibrarySource): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(source))
    } catch (error) {
        logger.warn('Failed to persist library source:', error)
    }
}

export function loadPersistedLibrarySource(): LibrarySource | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as LibrarySource
        if (parsed.type === 'imported' && (!Array.isArray(parsed.games) || parsed.games.length === 0)) return null
        if (parsed.type === 'online' && !parsed.userInput) return null
        return parsed
    } catch (error) {
        logger.warn('Failed to read persisted library source:', error)
        return null
    }
}

export function clearPersistedLibrarySource(): void {
    localStorage.removeItem(STORAGE_KEY)
}
