/**
 * Unit tests for SteamUICoordinator
 * Tests constructor and ensures class can be instantiated properly
 */

import { describe, it, expect } from 'vitest'
import { SteamUICoordinator } from '../../../../src/ui/coordinators/SteamUICoordinator'

describe('SteamUICoordinator Unit Tests', () => {
  
  describe('Constructor and Basic Functionality', () => {
    it('should instantiate without throwing errors', () => {
      expect(() => {
        new SteamUICoordinator()
      }).not.toThrow()
    })

    it('should have all expected public methods', () => {
      const coordinator = new SteamUICoordinator()
      
      // Verify critical methods exist
      expect(typeof coordinator.loadGames).toBe('function')
      expect(typeof coordinator.loadFromCache).toBe('function')
      expect(typeof coordinator.refreshCache).toBe('function')
      expect(typeof coordinator.clearCache).toBe('function')
      expect(typeof coordinator.showCacheStats).toBe('function')
      expect(typeof coordinator.clearImageCache).toBe('function')
      expect(typeof coordinator.showSteamStatus).toBe('function')
      expect(typeof coordinator.updateCacheStats).toBe('function')
      expect(typeof coordinator.updateProgress).toBe('function')
      expect(typeof coordinator.showProgress).toBe('function')
      expect(typeof coordinator.setDevMode).toBe('function')
    })

    it('should handle method calls without crashing (basic smoke test)', () => {
      const coordinator = new SteamUICoordinator()
      
      // These should not throw even if they don't work properly due to missing DOM/mocks
      expect(() => {
        coordinator.loadGames('test')
        coordinator.loadFromCache('test')
        coordinator.refreshCache()
        coordinator.clearCache()
        coordinator.showCacheStats()
        coordinator.clearImageCache()
      }).not.toThrow()
    })

    it('should handle setDevMode calls', async () => {
      const coordinator = new SteamUICoordinator()
      
      // Should not throw
      await expect(coordinator.setDevMode(true)).resolves.not.toThrow()
      await expect(coordinator.setDevMode(false)).resolves.not.toThrow()
    })
  })

  describe('Method Parameter Validation', () => {
    it('should handle showSteamStatus with different parameter types', () => {
      const coordinator = new SteamUICoordinator()
      
      // Should not crash with different status types (even if UI doesn't exist)
      expect(() => {
        coordinator.showSteamStatus('Loading...', 'loading')
        coordinator.showSteamStatus('Error occurred', 'error')
        coordinator.showSteamStatus('Success!', 'success')
      }).not.toThrow()
    })

    it('should handle updateCacheStats with valid stats object', () => {
      const coordinator = new SteamUICoordinator()
      const mockStats = { totalEntries: 5, cacheHits: 3, cacheMisses: 2 }
      
      expect(() => {
        coordinator.updateCacheStats(mockStats)
      }).not.toThrow()
    })

    it('should handle updateProgress with numeric parameters', () => {
      const coordinator = new SteamUICoordinator()
      
      expect(() => {
        coordinator.updateProgress(5, 10, 'Loading games...')
        coordinator.updateProgress(0, 100, '')
        coordinator.updateProgress(100, 100, 'Complete')
      }).not.toThrow()
    })
  })
})