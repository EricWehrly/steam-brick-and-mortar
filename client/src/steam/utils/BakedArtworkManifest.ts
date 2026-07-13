/**
 * Reads the baked F2P/anonymous-store artwork manifest - client/public/artwork-cache/manifest.json,
 * written by scripts/bake-f2p-artwork.sh (release.sh Step 2.5). See docs/plans/f2p-artwork-bake-plan.md.
 *
 * An appid's absence from the manifest means its library_600x900.jpg 404'd against Steam's CDN at
 * bake time - a reliable signal that the game has no usable portrait artwork at all (not just that
 * we didn't bother baking it locally), since a runtime CDN fetch would hit the same 404.
 */

const BAKED_ARTWORK_DIR = '/artwork-cache'
const BAKED_ARTWORK_MANIFEST_URL = `${BAKED_ARTWORK_DIR}/manifest.json`

interface BakedArtworkManifest {
    readonly appids: readonly number[]
}

/** Local artwork URL for a baked appid - callers only need this alongside a manifest appid check. */
export function bakedArtworkUrl(appId: number): string {
    return `${BAKED_ARTWORK_DIR}/${appId}.jpg`
}

/**
 * Fetches the manifest's appid set. Never throws - an unavailable manifest (dev environment that
 * hasn't run release.sh, or a genuine fetch failure) resolves to an empty set.
 */
export async function fetchBakedArtworkAppIds(): Promise<ReadonlySet<number>> {
    try {
        const response = await fetch(BAKED_ARTWORK_MANIFEST_URL)
        if (!response.ok) return new Set()
        const manifest = await response.json() as BakedArtworkManifest
        return new Set(manifest.appids)
    } catch {
        return new Set()
    }
}
