/**
 * WebXR Module
 * 
 * Exports WebXR management components for VR session handling and input
 */

export {
    WebXRManager,
    type WebXRCapabilities,
    type WebXRSessionCallbacks
} from './WebXRManager'

export {
    WebXRCoordinator,
    type WebXRCoordinatorCallbacks,
    type WebXRCoordinatorConfig
} from './WebXRCoordinator'

export {
    InputManager,
    type InputState,
    type MovementOptions,
    type InputCallbacks
} from './InputManager'
