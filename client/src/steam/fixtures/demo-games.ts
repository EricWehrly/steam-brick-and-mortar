import type { SteamUser } from '../SteamApiClient';

/**
 * Anonymous store fixture for dev/test environments.
 *
 * Used when no Steam user is cached to provide a populated store for visual testing.
 * Games are a curated mix of well-known paid titles with good capsule art coverage.
 * No free-to-play titles: this store represents a "typical owned library" sample.
 *
 * Artwork: library_600x900.jpg portrait format matches GpuGameBoxRenderer's preferred URL.
 * Art will attempt to load via CDN; in strict CORS environments labels render instead.
 */

function lib(appid: number): string {
    return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
}
function header(appid: number): string {
    return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`
}

export const ANONYMOUS_STORE_USER: SteamUser = {
    steamid: '',
    vanity_url: 'anonymous',
    game_count: 18,
    retrieved_at: new Date().toISOString(),
    games: [
        { appid: 292030, name: 'The Witcher 3: Wild Hunt',     playtime_forever: 12000, img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(292030), library: lib(292030) }, genres: [{ id: '3', description: 'RPG' }] },
        { appid: 1245620, name: 'Elden Ring',                   playtime_forever: 10000, img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(1245620), library: lib(1245620) }, genres: [{ id: '1', description: 'Action' }, { id: '3', description: 'RPG' }] },
        { appid: 1091500, name: 'Cyberpunk 2077',               playtime_forever: 9000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(1091500), library: lib(1091500) }, genres: [{ id: '3', description: 'RPG' }, { id: '1', description: 'Action' }] },
        { appid: 271590, name: 'Grand Theft Auto V',            playtime_forever: 8500,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(271590), library: lib(271590) }, genres: [{ id: '1', description: 'Action' }, { id: '1', description: 'Adventure' }] },
        { appid: 1172620, name: 'Dark Souls III',               playtime_forever: 7000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(1172620), library: lib(1172620) }, genres: [{ id: '1', description: 'Action' }, { id: '3', description: 'RPG' }] },
        { appid: 304930, name: 'Unturned',                      playtime_forever: 6000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(304930), library: lib(304930) }, genres: [{ id: '1', description: 'Action' }, { id: '28', description: 'Simulation' }] },
        { appid: 433340, name: "No Man's Sky",                  playtime_forever: 5500,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(433340), library: lib(433340) }, genres: [{ id: '28', description: 'Simulation' }, { id: '1', description: 'Adventure' }] },
        { appid: 1517290, name: 'Farming Simulator 22',         playtime_forever: 5000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(1517290), library: lib(1517290) }, genres: [{ id: '28', description: 'Simulation' }] },
        { appid: 1145360, name: 'Hades',                        playtime_forever: 4500,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(1145360), library: lib(1145360) }, genres: [{ id: '1', description: 'Action' }, { id: '23', description: 'Indie' }] },
        { appid: 49520,   name: 'Borderlands 2',                playtime_forever: 4000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(49520), library: lib(49520) }, genres: [{ id: '1', description: 'Action' }, { id: '3', description: 'RPG' }] },
        { appid: 620,     name: 'Portal 2',                     playtime_forever: 3800,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(620), library: lib(620) }, genres: [{ id: '1', description: 'Action' }, { id: '23', description: 'Adventure' }] },
        { appid: 413150,  name: 'Stardew Valley',               playtime_forever: 3500,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(413150), library: lib(413150) }, genres: [{ id: '3', description: 'RPG' }, { id: '23', description: 'Indie' }] },
        { appid: 367520,  name: 'Hollow Knight',                playtime_forever: 3200,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(367520), library: lib(367520) }, genres: [{ id: '1', description: 'Action' }, { id: '23', description: 'Indie' }] },
        { appid: 105600,  name: 'Terraria',                     playtime_forever: 3000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(105600), library: lib(105600) }, genres: [{ id: '1', description: 'Action' }, { id: '23', description: 'Indie' }] },
        { appid: 570940,  name: 'Dark Souls Remastered',        playtime_forever: 2800,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(570940), library: lib(570940) }, genres: [{ id: '1', description: 'Action' }, { id: '3', description: 'RPG' }] },
        { appid: 359550,  name: "Tom Clancy's Rainbow Six Siege", playtime_forever: 2500, img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(359550), library: lib(359550) }, genres: [{ id: '1', description: 'Action' } ] },
        { appid: 252490,  name: 'Rust',                         playtime_forever: 2000,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(252490), library: lib(252490) }, genres: [{ id: '1', description: 'Action' }, { id: '28', description: 'Simulation' }] },
        { appid: 1063730, name: 'New World: Aeternum',          playtime_forever: 1500,  img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: header(1063730), library: lib(1063730) }, genres: [{ id: '3', description: 'RPG' }, { id: '1', description: 'Action' }] },
    ]
};

/** @deprecated Use ANONYMOUS_STORE_USER */
export const DEMO_STEAM_USER = ANONYMOUS_STORE_USER;
