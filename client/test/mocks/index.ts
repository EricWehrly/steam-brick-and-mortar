/**
 * Central registry for all test mocks
 * Provides clean, direct access to all mock implementations
 */

// Re-export all individual mocks for direct usage
export { SceneManagerMock, sceneManagerMockFactory } from './scene/SceneManager.mock'
export { AssetLoaderMock, assetLoaderMockFactory } from './scene/AssetLoader.mock'
export { GameBoxRendererMock, gameBoxRendererMockFactory } from './scene/GameBoxRenderer.mock'
export { SignageRendererMock, signageRendererMockFactory } from './scene/SignageRenderer.mock'
export { StoreLayoutMock, storeLayoutMockFactory } from './scene/StoreLayout.mock'
export { SteamIntegrationMock, steamIntegrationMockFactory } from './steam-integration/SteamIntegration.mock'
export { WebXRManagerMock, webxrManagerMockFactory } from './webxr/WebXRManager.mock'
export { InputManagerMock, inputManagerMockFactory } from './webxr/InputManager.mock'
export { UIManagerMock, uiManagerMockFactory } from './ui/UIManager.mock'
