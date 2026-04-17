import { LOD_TIER_NAME } from './ILodArtworkRenderer'

export const LOD_DEBUG_SETTINGS = {
    stripeEnabled: false,
    stripeColors: {
        [LOD_TIER_NAME.MID]: [51, 85, 255, 255],
        [LOD_TIER_NAME.HIGH]: [51, 255, 85, 255],
    } as Record<string, [number, number, number, number]>,
} as const
