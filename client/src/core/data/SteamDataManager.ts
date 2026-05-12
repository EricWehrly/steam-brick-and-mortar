import type { SteamGameData } from '../../scene/game-box/types/GameData'
import { DataDomain } from './DataTypes'
import { DataManager } from './DataManager'

export class SteamDataManager {
    private static readonly STEAM_GAMES_KEY = 'steam.games'

    static _instance: DataManager | null = null

    static get instance(): DataManager {
        if (!this._instance) {
            this._instance = DataManager.getInstance()
        }
        return this._instance
    }

    static GetGame(appId: number): SteamGameData | null {
        const games = this.GetSteamGames()
        if (!games) return null

        const index = this.findGameIndex(games, appId)
        return index >= 0 ? games[index] : null
    }

    static AmendGame(appId: number, amend: (game: SteamGameData) => void): boolean {
        const games = this.GetSteamGames()
        if (!games) return false

        const game = this.GetGame(appId)
        if (!game) return false

        const updatedGame: SteamGameData = { ...game }
        amend(updatedGame)

        const updatedGames = games.map((entry) =>
            Number(entry.appid) === appId ? updatedGame : entry
        )

        const metadata = this.instance.getMetadata(this.STEAM_GAMES_KEY) ?? {
            domain: DataDomain.SteamIntegration
        }

        this.instance.set<SteamGameData[]>(this.STEAM_GAMES_KEY, updatedGames, metadata)
        return true
    }

    static GetSteamGames(): SteamGameData[] | null {
        return this.instance.get<SteamGameData[]>(this.STEAM_GAMES_KEY) ?? null
    }

    private static findGameIndex(games: SteamGameData[], appId: number): number {
        return games.findIndex((game) => Number(game.appid) === appId)
    }
}
