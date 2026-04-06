import { describe, it, expect } from 'vitest'
import { sortAndFilterCategories, HIDDEN_PRIORITY } from './FeaturePriorityConfig'
import type { SteamCategory } from '../steam/types/SteamMetadata'

describe('FeaturePriorityConfig', () => {
  describe('sortAndFilterCategories', () => {
    it('returns an empty array when input is empty', () => {
      expect(sortAndFilterCategories([])).toEqual([])
    })

    it('filters out hidden categories', () => {
      const categories: SteamCategory[] = [
        { id: 29, description: 'Steam Trading Cards' }, // HIDDEN
        { id: 1, description: 'Multi-player' }          // Priority 10
      ]
      const result = sortAndFilterCategories(categories)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
    })

    it('sorts categories by priority ascending', () => {
      const categories: SteamCategory[] = [
        { id: 401, description: 'VR Supported' },           // Priority 30
        { id: 1, description: 'Multi-player' },             // Priority 10
        { id: 28, description: 'Full controller support' }  // Priority 20
      ]
      const result = sortAndFilterCategories(categories)
      expect(result.map(c => c.id)).toEqual([1, 28, 401])
    })

    it('gives unknown categories a default mid-range priority (500) and does not filter them', () => {
      const categories: SteamCategory[] = [
        { id: 999, description: 'Unknown' },                // Default 500
        { id: 35, description: 'In-App Purchases' },        // Priority 60
        { id: 29, description: 'Steam Trading Cards' }      // HIDDEN
      ]
      const result = sortAndFilterCategories(categories)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(35)
      expect(result[1].id).toBe(999)
    })

    it('handles categories that are not in the priority table but have high IDs', () => {
      const categories: SteamCategory[] = [
        { id: 1, description: 'Multi-player' },
        { id: 8888, description: 'High ID' }
      ]
      const result = sortAndFilterCategories(categories)
      expect(result[0].id).toBe(1)
      expect(result[1].id).toBe(8888)
    })
  })
})
