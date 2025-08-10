/**
 * Mock for WebXRCoordinator - handles WebXR session and input coordination
 */

import { vi } from 'vitest'

export const WebXRCoordinatorMock = vi.fn().mockImplementation(() => ({
    setupWebXR: vi.fn().mockResolvedValue(undefined),
    handleWebXRToggle: vi.fn().mockResolvedValue(undefined),
    updateCameraMovement: vi.fn(),
    pauseInput: vi.fn(),
    resumeInput: vi.fn(),
    getWebXRManager: vi.fn().mockReturnValue({
        checkCapabilities: vi.fn().mockResolvedValue({
            isSupported: true,
            supportsImmersiveVR: true,
            hasNavigatorXR: true
        }),
        startVRSession: vi.fn().mockResolvedValue(undefined),
        setRenderer: vi.fn(),
        dispose: vi.fn()
    }),
    dispose: vi.fn()
}))

export async function webxrCoordinatorMockFactory() {
    return {
        WebXRCoordinator: WebXRCoordinatorMock
    }
}
