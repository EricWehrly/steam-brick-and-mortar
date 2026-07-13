/**
 * Local Steam Data Inspector - Debug tool for the desktop app's local-file data pipeline
 *
 * Calls the Rust-side Tauri commands that read identity, playtime, and user collections
 * directly from the local Steam install (see docs/plans/desktop-local-data-pipeline-plan.md)
 * and prints the results to the console. No-ops on the web build (isTauri() is false there).
 *
 * Usage:
 *   window.dumpLocalSteamData()   - re-run on demand from devtools
 *
 * Also runs automatically once on GameStart when running under Tauri, so the data shows up
 * in the console without any manual step.
 */

import { invoke, isTauri } from '@tauri-apps/api/core'
import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'
import { Logger } from '../utils/Logger'
import { LocalSteamDataWriter } from '../steam/LocalSteamDataWriter'

interface SteamIdentity {
    steamid64: string
    account_name: string
    persona_name: string
    most_recent: boolean
}

interface AppPlaytime {
    appid: number
    last_played: number | null
    playtime_minutes: number | null
}

interface UserCollection {
    id: string
    name: string
    appids: number[]
}

interface LocalAppMetadata {
    appid: number
    name: string | null
    developers: string[]
    publishers: string[]
    tags: string[]
}

const TAG_METADATA_PREVIEW_COUNT = 5

const logger = Logger.createLogFunctions('LocalSteamDataInspector')

export async function dumpLocalSteamData(): Promise<void> {
    if (!isTauri()) {
        logger.debug('🗂️ [LocalSteamDataInspector] Not running under Tauri, skipping')
        return
    }

    try {
        const identity = await invoke<SteamIdentity>('read_steam_identity')
        logger.info('🗂️ [LocalSteamDataInspector] Identity:', identity)
    } catch (error) {
        logger.warn('🗂️ [LocalSteamDataInspector] Failed to read identity:', error)
    }

    let playtimes: AppPlaytime[] = []
    try {
        playtimes = await invoke<AppPlaytime[]>('read_steam_playtimes')
        logger.info(`🗂️ [LocalSteamDataInspector] Playtime: ${playtimes.length} apps`, playtimes)
    } catch (error) {
        logger.warn('🗂️ [LocalSteamDataInspector] Failed to read playtimes:', error)
    }

    try {
        const collections = await invoke<UserCollection[]>('read_steam_collections')
        logger.info(`🗂️ [LocalSteamDataInspector] Collections: ${collections.length} found`)
        for (const collection of collections) {
            logger.info(`  - "${collection.name}" (${collection.appids.length} games)`, collection.appids)
        }
    } catch (error) {
        logger.warn('🗂️ [LocalSteamDataInspector] Failed to read collections:', error)
    }

    if (playtimes.length > 0) {
        try {
            const previewAppids = playtimes.slice(0, TAG_METADATA_PREVIEW_COUNT).map(p => p.appid)
            const metadata = await invoke<LocalAppMetadata[]>('read_local_app_metadata', { appids: previewAppids })
            logger.info(`🗂️ [LocalSteamDataInspector] Tag/developer/publisher preview (${metadata.length} apps):`)
            for (const item of metadata) {
                logger.info(`  - appid ${item.appid}: "${item.name ?? '(no local name)'}" — ${item.developers.join(', ') || 'unknown developer'} — tags: ${item.tags.join(', ') || 'none'}`)
            }
        } catch (error) {
            logger.warn('🗂️ [LocalSteamDataInspector] Failed to read local app metadata:', error)
        }
    }

    try {
        const written = await LocalSteamDataWriter.writeLocalAppMetadata()
        logger.info(`🗂️ [LocalSteamDataInspector] Wrote ${written} entries into AppDetailsCache`)
    } catch (error) {
        logger.warn('🗂️ [LocalSteamDataInspector] Failed to write local app metadata into AppDetailsCache:', error)
    }
}

export function initializeLocalSteamDataInspectorOnStart(): void {
    // @ts-ignore - Intentionally adding to window for debugging
    window.dumpLocalSteamData = () => dumpLocalSteamData()

    console.debug('🗂️ [LocalSteamDataInspector] Inspector exposed to window:')
    console.debug('  window.dumpLocalSteamData()   - re-read identity/playtime/collections from disk')

    void dumpLocalSteamData()
}

EventManager.getInstance().registerEventHandler(GameEventTypes.Start, initializeLocalSteamDataInspectorOnStart)
