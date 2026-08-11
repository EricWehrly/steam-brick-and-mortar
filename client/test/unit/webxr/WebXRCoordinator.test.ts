import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'

const { webXRManagerMock, inputManagerMock, xrControllerManagerMock, capturedWebXRManagerCallbacks } = vi.hoisted(() => ({
    webXRManagerMock: {
        setRenderer: vi.fn(),
        checkCapabilities: vi.fn().mockResolvedValue({ isSupported: true, supportsImmersiveVR: true, hasNavigatorXR: true }),
        startVRSession: vi.fn().mockResolvedValue(undefined),
        endVRSession: vi.fn().mockResolvedValue(undefined),
        isSessionActive: vi.fn().mockReturnValue(false),
        getCurrentSession: vi.fn().mockReturnValue(null),
        dispose: vi.fn(),
    },
    inputManagerMock: {
        startListening: vi.fn(),
        updateCameraMovement: vi.fn(),
        updateCameraRotation: vi.fn(),
        setXRSession: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        dispose: vi.fn(),
    },
    xrControllerManagerMock: {
        setup: vi.fn(),
        setSession: vi.fn(),
        update: vi.fn(),
        getPrimaryControllerRay: vi.fn().mockReturnValue(null),
        dispose: vi.fn(),
    },
    // WebXRCoordinator's constructor passes its onSessionStart/onSessionEnd/etc. callbacks to
    // `new WebXRManager(callbacks)` - capture them here so tests can fire onSessionStart directly,
    // the same way the real WebXRManager would after a real session actually starts.
    capturedWebXRManagerCallbacks: [] as Array<{ onSessionStart?: () => void; onSessionEnd?: () => void }>,
}))

vi.mock('../../../src/webxr/WebXRManager', () => ({
    WebXRManager: vi.fn().mockImplementation(function (callbacks: { onSessionStart?: () => void }) {
        capturedWebXRManagerCallbacks.push(callbacks)
        return webXRManagerMock
    }),
}))

vi.mock('../../../src/input/InputManager', () => ({
    InputManager: vi.fn().mockImplementation(function () { return inputManagerMock }),
}))

vi.mock('../../../src/webxr/XRControllerManager', () => ({
    XRControllerManager: vi.fn().mockImplementation(function () { return xrControllerManagerMock }),
}))

import { WebXRCoordinator } from '../../../src/webxr/WebXRCoordinator'

describe('WebXRCoordinator', () => {
    let cameraRig: THREE.Object3D
    let coordinator: WebXRCoordinator

    beforeEach(() => {
        vi.clearAllMocks()
        capturedWebXRManagerCallbacks.length = 0
        webXRManagerMock.isSessionActive.mockReturnValue(false)
        cameraRig = new THREE.Object3D()
        coordinator = new WebXRCoordinator({ cameraRig })
    })

    // Regression test: player movement used to feel like it had no effect in VR because
    // CameraInputApplier moved the camera directly, and Three.js overwrites a parentless
    // camera's transform from the headset pose every XR frame. Movement now always targets the
    // camera's parent rig (see SceneManager's cameraRig doc comment), which composes correctly
    // with the tracked pose whether or not a session is active - no branch needed here.
    it('always applies movement to the camera rig, whether or not an XR session is active', () => {
        webXRManagerMock.isSessionActive.mockReturnValue(false)
        coordinator.updateCameraMovement(cameraRig)
        expect(inputManagerMock.updateCameraMovement).toHaveBeenCalledWith(cameraRig)

        vi.clearAllMocks()
        webXRManagerMock.isSessionActive.mockReturnValue(true)
        coordinator.updateCameraMovement(cameraRig)
        expect(inputManagerMock.updateCameraMovement).toHaveBeenCalledWith(cameraRig)
    })

    it('applies mouse/keyboard-driven rotation to the rig when no XR session is active', () => {
        webXRManagerMock.isSessionActive.mockReturnValue(false)
        coordinator.updateCameraMovement(cameraRig)
        expect(inputManagerMock.updateCameraRotation).toHaveBeenCalledWith(cameraRig)
    })

    // The user's explicit ask: mouse-type look must be off entirely in VR - the headset is the
    // only source of view rotation. Not just incidentally inert (no pointer-lock deltas) - an
    // explicit gate so this holds regardless of what other input paths might feed rotation later.
    it('skips rotation entirely while an XR session is active', () => {
        webXRManagerMock.isSessionActive.mockReturnValue(true)
        coordinator.updateCameraMovement(cameraRig)
        expect(inputManagerMock.updateCameraRotation).not.toHaveBeenCalled()
    })

    it('starts input listening and registers the render loop callback during setupWebXR', async () => {
        const renderer = { xr: {} } as unknown as THREE.WebGLRenderer
        await coordinator.setupWebXR(renderer)

        expect(webXRManagerMock.setRenderer).toHaveBeenCalledWith(renderer)
        expect(webXRManagerMock.checkCapabilities).toHaveBeenCalled()
        expect(inputManagerMock.startListening).toHaveBeenCalled()
        expect(xrControllerManagerMock.setup).toHaveBeenCalledWith(renderer)
    })

    it('forwards the real XR session to the controller manager on session start/end', () => {
        webXRManagerMock.getCurrentSession.mockReturnValue('fake-session' as unknown as XRSession)

        const onSessionStart = capturedWebXRManagerCallbacks[0]?.onSessionStart
        onSessionStart?.()
        expect(xrControllerManagerMock.setSession).toHaveBeenCalledWith('fake-session')

        const onSessionEnd = capturedWebXRManagerCallbacks[0]?.onSessionEnd
        onSessionEnd?.()
        expect(xrControllerManagerMock.setSession).toHaveBeenCalledWith(null)
    })

    it('disposes the controller manager on dispose', () => {
        coordinator.dispose()
        expect(xrControllerManagerMock.dispose).toHaveBeenCalled()
    })

    it('forwards pause/resume to the input manager', () => {
        coordinator.pauseInput()
        expect(inputManagerMock.pause).toHaveBeenCalled()

        coordinator.resumeInput()
        expect(inputManagerMock.resume).toHaveBeenCalled()
    })

    // Regression test: the headset's tracked pose is a full absolute orientation, composed with
    // the rig's own rotation every XR frame (see WebXRManager.js's updateCamera - confirmed by
    // reading Three.js's source). A residual desktop-mode rotation left on the rig (e.g.
    // RoomManager's initial lookAt() aiming the flat camera at the store) would silently add an
    // unwanted rotation on top of the real headset orientation, rotating the effective view into
    // geometry - reported as "stuck inside something, all skybox until I peek through a sliver."
    // Desktop mode never surfaced this because a parentless camera had the XR pose wholesale
    // *replace* its rotation each frame, not compose with it.
    it('resets the rig rotation to identity when a real XR session starts', () => {
        cameraRig.rotation.set(0, Math.PI, 0) // residual "face the store" rotation from RoomManager
        expect(cameraRig.quaternion.equals(new THREE.Quaternion())).toBe(false)

        const onSessionStart = capturedWebXRManagerCallbacks[0]?.onSessionStart
        expect(onSessionStart).toBeTypeOf('function')
        onSessionStart?.()

        expect(cameraRig.quaternion.equals(new THREE.Quaternion())).toBe(true)
    })

    // Regression test: RoomManager.position.y = 1.6 is a desktop-only eye-height stand-in with no
    // real head tracking behind it. An earlier version of this fix only zeroed Y for reference
    // spaces documented as floor-anchored ('local-floor'/'bounded-floor'), assuming 'local'
    // reports a pose Y near 0. Logged diagnostics from a real PICO 4 / PICO Connect / SteamVR
    // session that negotiated 'local' falsified that: its pose Y consistently contributed real
    // height (~1.1-1.2m) on its own, so stacking our +1.6 on top overshot regardless of the
    // reference-space label. Zero unconditionally instead of trying to infer this from the
    // negotiated type. X/Z (real horizontal room placement) must survive the reset - only Y is a
    // desktop-only artifact.
    it('zeroes the rig Y position (but not X/Z) when a real XR session starts', () => {
        cameraRig.position.set(3, 1.6, -7) // desktop placement: eye height + real room position

        const onSessionStart = capturedWebXRManagerCallbacks[0]?.onSessionStart
        onSessionStart?.()

        expect(cameraRig.position.y).toBe(0)
        expect(cameraRig.position.x).toBe(3)
        expect(cameraRig.position.z).toBe(-7)
    })

    // Regression test: the "Exit VR" button emits the same WebXREventTypes.Toggle as "Enter VR"
    // (see WebXRUIPanel's single click handler) - handleWebXRToggle must branch on session state
    // itself. It used to always call startVRSession(), which no-ops with a console warning when a
    // session is already active - the button could never actually end a session.
    it('ends the active session instead of starting a new one when toggled while active', async () => {
        webXRManagerMock.isSessionActive.mockReturnValue(true)

        await coordinator.handleWebXRToggle()

        expect(webXRManagerMock.endVRSession).toHaveBeenCalled()
        expect(webXRManagerMock.startVRSession).not.toHaveBeenCalled()
    })

    it('starts a new session when toggled while inactive', async () => {
        webXRManagerMock.isSessionActive.mockReturnValue(false)

        await coordinator.handleWebXRToggle()

        expect(webXRManagerMock.startVRSession).toHaveBeenCalled()
        expect(webXRManagerMock.endVRSession).not.toHaveBeenCalled()
    })
})
