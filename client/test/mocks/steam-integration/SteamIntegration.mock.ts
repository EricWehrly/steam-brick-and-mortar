/**
 * Mock for SteamIntegration
 */
import { vi } from 'vitest'

export const SteamIntegrationMock = vi.fn().mockImplementation(() => ({
    loadGamesForUser: vi.fn().mockResolvedValue([]),
    dispose: vi.fn()
}))

// Export async factory function for vi.mock() - enables one-line usage
export const steamIntegrationMockFactory = async () => ({ SteamIntegration: SteamIntegrationMock })
