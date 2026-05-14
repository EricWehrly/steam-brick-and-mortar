import { LOD_TIER_NAME } from './IGameArtworkPipeline'

export const LOD_DEBUG_SETTINGS = {
    stripeEnabled: false,
    stripeColors: {
        [LOD_TIER_NAME.MID]: [51, 85, 255, 255],
        [LOD_TIER_NAME.HIGH]: [51, 255, 85, 255],
    } as Record<string, [number, number, number, number]>,
} as const

const LOD_STRIPE_DEBUG_STORAGE_KEY = 'sbm.lodStripeDebugEnabled'

export function isLodStripeDebugEnabled(): boolean {
    if (typeof window === 'undefined') {
        return LOD_DEBUG_SETTINGS.stripeEnabled
    }

    const stored = window.localStorage.getItem(LOD_STRIPE_DEBUG_STORAGE_KEY)
    if (stored === null) {
        return LOD_DEBUG_SETTINGS.stripeEnabled
    }

    return stored === '1'
}

export function setLodStripeDebugEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') {
        return
    }
    window.localStorage.setItem(LOD_STRIPE_DEBUG_STORAGE_KEY, enabled ? '1' : '0')
}

export function getLodStripeDebugColor(tierName: string): readonly [number, number, number, number] | undefined {
    return LOD_DEBUG_SETTINGS.stripeColors[tierName]
}

