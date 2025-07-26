/**
 * Blockbuster Video Store Color Palette
 * Based on reference images and brand colors
 */

export const BlockbusterColors = {
    // Main environment colors
    walls: 0xDAA520,        // Mustard yellow
    floor: 0x2F2F2F,        // Dark gray carpet
    ceiling: 0xF5F5F5,      // White popcorn texture
    
    // Shelving colors
    shelfWood: 0xD2B48C,    // Light wood/tan
    shelfAccents: 0x1C1C1C, // Black accents
    
    // Signage colors
    newReleasesRed: 0xDC143C,    // Crimson red background
    newReleasesText: 0xFFFFFF,   // White text
    categoryBlue: 0x4169E1,      // Royal blue
    categoryText: 0xFFFFFF,      // White text
    
    // Lighting colors (color temperature simulation)
    fluorescentCool: 0xE6F3FF,   // 5000K-6000K cool white
    fluorescentWarm: 0xF0F8FF,   // 4000K-5000K neutral white
} as const

export const BlockbusterColorsHex = {
    walls: '#DAA520',
    floor: '#2F2F2F', 
    ceiling: '#F5F5F5',
    shelfWood: '#D2B48C',
    shelfAccents: '#1C1C1C',
    newReleasesRed: '#DC143C',
    newReleasesText: '#FFFFFF',
    categoryBlue: '#4169E1',
    categoryText: '#FFFFFF',
    fluorescentCool: '#E6F3FF',
    fluorescentWarm: '#F0F8FF',
} as const
