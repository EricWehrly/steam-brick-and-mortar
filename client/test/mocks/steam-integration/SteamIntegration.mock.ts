/**
 * Mock for SteamIntegration
 */
import { vi } from 'vitest'

const mockInstance = {
    loadGamesForUser: vi.fn().mockResolvedValue([]),
    dispose: vi.fn()
}

export const SteamIntegrationMock: any = vi.fn().mockImplementation(function() { return mockInstance })
SteamIntegrationMock.getInstance = vi.fn().mockReturnValue(mockInstance)

// Export async factory function for vi.mock() - enables one-line usage
export const steamIntegrationMockFactory = async () => ({ SteamIntegration: SteamIntegrationMock })
