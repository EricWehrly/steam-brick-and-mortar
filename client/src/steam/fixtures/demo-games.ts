import type { SteamUser } from '../SteamApiClient';

/**
 * Anonymous store fixture for dev/test environments.
 *
 * Shows the store before a Steam user is provided. Uses Free to Play titles only
 * because F2P games are accessible to any Steam account - this store represents
 * "what you might own before even buying anything".
 *
 * Curated F2P list: high-profile titles with good capsule art and broad recognition.
 * Artwork: library_600x900.jpg portrait format matches GpuGameBoxRenderer's preferred URL.
 */

function lib(appid: number): string {
    return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
}
function header(appid: number): string {
    return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`
}

const F2P = [{ id: '37', description: 'Free to Play' }]
const F2P_ACTION = [...F2P, { id: '1', description: 'Action' }]
const F2P_RPG = [...F2P, { id: '3', description: 'RPG' }]
const F2P_STRAT = [...F2P, { id: '2', description: 'Strategy' }]

export const ANONYMOUS_STORE_USER: SteamUser = {
    steamid: '',
    vanity_url: 'anonymous',
    game_count: 18,
    retrieved_at: new Date().toISOString(),
    games: [
        // Valve F2P - always available
        { appid: 440,     name: 'Team Fortress 2',      playtime_forever: 10000, img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(440),     library: lib(440)     }, genres: F2P_ACTION },
        { appid: 570,     name: 'Dota 2',               playtime_forever: 9000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(570),     library: lib(570)     }, genres: F2P_STRAT  },
        { appid: 730,     name: 'Counter-Strike 2',     playtime_forever: 8000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(730),     library: lib(730)     }, genres: F2P_ACTION },
        // High-profile F2P titles
        { appid: 1172470, name: 'Apex Legends',         playtime_forever: 7500,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(1172470), library: lib(1172470) }, genres: F2P_ACTION },
        { appid: 1085660, name: 'Destiny 2',            playtime_forever: 7000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(1085660), library: lib(1085660) }, genres: F2P_ACTION },
        { appid: 238960,  name: 'Path of Exile',        playtime_forever: 6000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(238960),  library: lib(238960)  }, genres: F2P_RPG    },
        { appid: 230410,  name: 'Warframe',             playtime_forever: 5500,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(230410),  library: lib(230410)  }, genres: F2P_ACTION },
        { appid: 252950,  name: 'Rocket League',        playtime_forever: 5000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(252950),  library: lib(252950)  }, genres: [...F2P, { id: '18', description: 'Sports' }] },
        { appid: 3164330, name: 'Infinity Nikki',       playtime_forever: 4500,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(3164330), library: lib(3164330) }, genres: F2P_RPG    },
        { appid: 386360,  name: 'MultiVersus',          playtime_forever: 3000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(386360),  library: lib(386360)  }, genres: F2P_ACTION },
        { appid: 1167630, name: 'Super People',         playtime_forever: 2500,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(1167630), library: lib(1167630) }, genres: F2P_ACTION },
        { appid: 1097150, name: 'Fall Guys',            playtime_forever: 2000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(1097150), library: lib(1097150) }, genres: F2P_ACTION },
        { appid: 359550,  name: 'Ring of Elysium',      playtime_forever: 1800,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(359550),  library: lib(359550)  }, genres: F2P_ACTION },
        { appid: 812140,  name: 'Dauntless',            playtime_forever: 1500,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(812140),  library: lib(812140)  }, genres: F2P_ACTION },
        { appid: 1282100, name: 'Cuisine Royale',       playtime_forever: 1200,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(1282100), library: lib(1282100) }, genres: F2P_ACTION },
        { appid: 730640,  name: 'Phantom Forces',       playtime_forever: 1000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(730640),  library: lib(730640)  }, genres: F2P_ACTION },
        { appid: 945360,  name: 'Among Us',             playtime_forever: 900,   img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(945360),  library: lib(945360)  }, genres: F2P        },
        { appid: 359320,  name: 'Creativerse',          playtime_forever: 800,   img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(359320),  library: lib(359320)  }, genres: F2P        },
    ]
};
