import type { SteamGameData } from "../../scene/game-box/types/GameData";
import { DataManager } from "./DataManager";

export class SteamDataManager {

    static _instance: DataManager | null = null

    static get instance(): DataManager {
        if (!this._instance) {
            this._instance = DataManager.getInstance()
        }
        return this._instance
    }

    static GetGame(appId: number): SteamGameData | null {
        const games = this.instance.get<SteamGameData[]>('steam.games')
        if (!games) return null

        const match = games.find((game) => Number(game.appid) === appId)
        return match || null
    }
}
