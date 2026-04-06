import type { SteamUser } from '../SteamApiClient';

/**
 * Hardcoded demo games for dev/test environments.
 * Used when no Steam user is cached to provide a populated store for visual testing.
 */
export const DEMO_STEAM_USER: SteamUser = {
    steamid: '76561197960287930', // Gabe Newell's ID (placeholder)
    vanity_url: 'demo-user',
    game_count: 18,
    retrieved_at: new Date().toISOString(),
    games: [
        {
            appid: 440,
            name: 'Team Fortress 2',
            playtime_forever: 10000,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/440/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }, { id: '37', description: 'Free to Play' }]
        },
        {
            appid: 570,
            name: 'Dota 2',
            playtime_forever: 9000,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/570/header.jpg',
                library: ''
            },
            genres: [{ id: '2', description: 'Strategy' }, { id: '37', description: 'Free to Play' }]
        },
        {
            appid: 730,
            name: 'Counter-Strike 2',
            playtime_forever: 8000,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }, { id: '37', description: 'Free to Play' }]
        },
        {
            appid: 238960,
            name: 'Path of Exile',
            playtime_forever: 7000,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/238960/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }, { id: '3', description: 'RPG' }, { id: '37', description: 'Free to Play' }]
        },
        {
            appid: 230410,
            name: 'Warframe',
            playtime_forever: 6000,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/230410/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }, { id: '37', description: 'Free to Play' }]
        },
        {
            appid: 252950,
            name: 'Rocket League',
            playtime_forever: 5000,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/252950/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }, { id: '9', description: 'Strategy' }, { id: '18', description: 'Sports' }]
        },
        {
            appid: 1172470,
            name: 'Apex Legends',
            playtime_forever: 4500,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/1172470/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }, { id: '37', description: 'Free to Play' }]
        },
        {
            appid: 1085660,
            name: 'Destiny 2',
            playtime_forever: 4000,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/1085660/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }, { id: '23', description: 'Adventure' }, { id: '37', description: 'Free to Play' }]
        },
        {
            appid: 620,
            name: 'Portal 2',
            playtime_forever: 3500,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/620/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }, { id: '23', description: 'Adventure' }, { id: '40', description: 'Puzzle' }]
        },
        {
            appid: 413150,
            name: 'Stardew Valley',
            playtime_forever: 3000,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/413150/header.jpg',
                library: ''
            },
            genres: [{ id: '28', description: 'Simulation' }, { id: '3', description: 'RPG' }, { id: '23', description: 'Indie' }]
        },
        {
            appid: 289070,
            name: 'Sid Meier\'s Civilization VI',
            playtime_forever: 2500,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/289070/header.jpg',
                library: ''
            },
            genres: [{ id: '2', description: 'Strategy' }]
        },
        {
            appid: 292030,
            name: 'The Witcher 3: Wild Hunt',
            playtime_forever: 2000,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/292030/header.jpg',
                library: ''
            },
            genres: [{ id: '3', description: 'RPG' }]
        },
        {
            appid: 105600,
            name: 'Terraria',
            playtime_forever: 1500,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/105600/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }, { id: '23', description: 'Adventure' }, { id: '23', description: 'Indie' }, { id: '3', description: 'RPG' }]
        },
        {
            appid: 945360,
            name: 'Among Us',
            playtime_forever: 1200,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/945360/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }, { id: '4', description: 'Casual' }]
        },
        {
            appid: 550,
            name: 'Left 4 Dead 2',
            playtime_forever: 1000,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/550/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }]
        },
        {
            appid: 220,
            name: 'Half-Life 2',
            playtime_forever: 800,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/220/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }]
        },
        {
            appid: 1145360,
            name: 'Hades',
            playtime_forever: 600,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/1145360/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }, { id: '23', description: 'Indie' }, { id: '3', description: 'RPG' }]
        },
        {
            appid: 367520,
            name: 'Hollow Knight',
            playtime_forever: 400,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: 'https://cdn.akamai.steamstatic.com/steam/apps/367520/header.jpg',
                library: ''
            },
            genres: [{ id: '1', description: 'Action' }, { id: '23', description: 'Adventure' }, { id: '23', description: 'Indie' }]
        }
    ]
};
