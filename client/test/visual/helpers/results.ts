import { mkdir, rename, readdir, rm } from 'fs/promises'
import path from 'path'

const RESULTS_DIR = 'test-results'
const ARCHIVE_DIR = 'test-results/archive'
const KEEP_RUNS = 5  // how many historical runs to keep per file

/**
 * Get the output path for a test result file.
 * The latest run always writes to the canonical path (e.g. console-report.json).
 * Previous runs are moved to test-results/archive/<timestamp>-<name>.
 *
 * Call this at the START of a test to archive the previous result before overwriting.
 */
export async function getResultPath(filename: string): Promise<string> {
    await mkdir(RESULTS_DIR, { recursive: true })
    await mkdir(ARCHIVE_DIR, { recursive: true })

    // Archive existing file if present
    const canonical = path.join(RESULTS_DIR, filename)
    try {
        const ext = path.extname(filename)
        const base = path.basename(filename, ext)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const archived = path.join(ARCHIVE_DIR, `${timestamp}-${base}${ext}`)
        await rename(canonical, archived)
    } catch {
        // File doesn't exist yet - that's fine
    }

    // Trim old archives for this file base
    await trimArchive(path.basename(filename, path.extname(filename)))

    return canonical
}

async function trimArchive(baseName: string): Promise<void> {
    try {
        const entries = await readdir(ARCHIVE_DIR)
        const matching = entries
            .filter(e => e.endsWith(`-${baseName}.json`) || e.endsWith(`-${baseName}.png`))
            .sort()  // ISO timestamps sort lexicographically = chronological
        const toDelete = matching.slice(0, Math.max(0, matching.length - KEEP_RUNS))
        for (const f of toDelete) {
            await rm(path.join(ARCHIVE_DIR, f), { force: true })
        }
    } catch {
        // Non-critical
    }
}
