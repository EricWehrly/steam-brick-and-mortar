/**
 * Reads Steam's own rendered library-art cache (appcache/librarycache/<appid>/) via the desktop
 * app's Rust commands - see desktop/tauri-app/src/steam/librarycache.rs and
 * docs/plans/startup-artwork-resolution-plan.md, Root Cause D. No-ops on the web build (isTauri()
 * is false there).
 */

import { invoke, isTauri } from '@tauri-apps/api/core'

export interface LocalArtSlot {
    /** Relative to appcache/librarycache/<appid>/ - pass to readArtBytes to load it. */
    relative_path: string
    /** Present only for the hash-migrated on-disk convention - the same hash Steam's CDN URLs use. */
    hash?: string
}

export interface LocalLibraryArtEntry {
    appid: number
    library?: LocalArtSlot
    header?: LocalArtSlot
}

export class LocalLibraryArtReader {
    public static async findLocalArt(appids: number[]): Promise<LocalLibraryArtEntry[]> {
        if (!isTauri() || appids.length === 0) {
            return []
        }
        return invoke<LocalLibraryArtEntry[]>('find_local_library_art', { appids })
    }

    /**
     * The Rust side returns a raw `tauri::ipc::Response` (an ArrayBuffer here), not JSON - a
     * plain `Vec<u8>` return goes over Tauri's default JSON IPC as a comma-separated array of
     * numbers, which measurably dominated startup time on a real desktop session once this ran
     * once per placed game box (see the Rust command's own doc comment, and
     * docs/plans/startup-artwork-resolution-plan.md).
     */
    public static async readArtBytes(appid: number, relativePath: string): Promise<Uint8Array<ArrayBuffer> | null> {
        if (!isTauri()) {
            return null
        }
        const bytes = await invoke<ArrayBuffer>('read_local_library_art_bytes', { appid, relativePath })
        return new Uint8Array(bytes)
    }
}
