/**
 * Reads local Steam screenshots (userdata/<id>/760/) via the desktop app's Rust commands - see
 * desktop/tauri-app/src/steam/screenshots.rs and docs/features/wall-art-framed-posters.md.
 * No-ops on the web build (isTauri() is false there).
 *
 * `read_local_screenshot_bytes` returns a plain number[] over Tauri's default JSON IPC (no
 * dedicated binary-response wiring yet) - fine for this feature's small-N decorative use (dozens
 * of screenshots, loaded once), not something to reach for on a hot/frequent path without
 * revisiting the transport.
 */

import { invoke, isTauri } from '@tauri-apps/api/core'

export interface LocalScreenshot {
    appid: number
    /** Relative to userdata/<id>/760/ - pass to readScreenshotBytes to load it. */
    filename: string
    width: number
    height: number
    /** Unix timestamp, seconds. */
    creation: number
    caption: string | null
}

export class LocalScreenshotReader {
    public static async listScreenshots(): Promise<LocalScreenshot[]> {
        if (!isTauri()) {
            return []
        }
        return invoke<LocalScreenshot[]>('read_local_screenshots')
    }

    public static async readScreenshotBytes(filename: string): Promise<Uint8Array | null> {
        if (!isTauri()) {
            return null
        }
        const bytes = await invoke<number[]>('read_local_screenshot_bytes', { filename })
        return new Uint8Array(bytes)
    }
}
