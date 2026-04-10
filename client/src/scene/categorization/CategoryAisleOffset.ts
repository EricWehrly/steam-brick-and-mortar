import { KNOWN_GENRES } from './GameSortFunctions'

type GenreLike = { description: string }
type GameLike = { genres?: GenreLike[] }

const GENRE_LOOKUP: ReadonlyMap<string, string> = new Map(
    KNOWN_GENRES.map((genre) => [genre.toLowerCase(), genre])
)

export function getPrimaryGenreFromBatch(games: readonly GameLike[]): string {
    for (const game of games) {
        const raw = game.genres?.[0]?.description
        if (!raw) {
            continue
        }

        const canonical = GENRE_LOOKUP.get(raw.toLowerCase())
        if (canonical) {
            return canonical
        }
    }

    return 'Other'
}

export function computeGenreClusterIndex(
    batchIndex: number,
    batchPrimaryGenreByIndex: ReadonlyMap<number, string>
): number {
    let clusterIndex = 0
    let previousGenre: string | undefined

    for (let i = 0; i <= batchIndex; i++) {
        const genre = batchPrimaryGenreByIndex.get(i)
        if (!genre) {
            continue
        }

        if (previousGenre === undefined) {
            previousGenre = genre
            continue
        }

        if (genre !== previousGenre) {
            clusterIndex++
            previousGenre = genre
        }
    }

    return clusterIndex
}

export function computeAlternatingClusterXOffset(
    batchIndex: number,
    batchPrimaryGenreByIndex: ReadonlyMap<number, string>,
    magnitude: number
): number {
    const clusterIndex = computeGenreClusterIndex(batchIndex, batchPrimaryGenreByIndex)
    return clusterIndex % 2 === 0 ? -magnitude : magnitude
}
