/**
 * Mock for SteamIntegration
 */
import { vi } from 'vitest'

export const SteamIntegrationMock = vi.fn().mockImplementation(() => ({
    loadGamesForUser: vi.fn().mockResolvedValue([]),
    hasOfflineData: vi.fn().mockReturnValue(false),
    dispose: vi.fn()
}))

// Export async factory function for vi.mock() - enables one-line usage
export const steamIntegrationMockFactory = async () => ({ SteamIntegration: SteamIntegrationMock })
