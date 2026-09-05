/** Shared by every cache/debug stat display that needs a human-readable byte size - previously
 *  three near-identical private copies (CacheManagementPanel, DebugPanel, VRDebugPanel). */
export function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
