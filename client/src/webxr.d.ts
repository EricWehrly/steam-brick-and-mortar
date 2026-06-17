// ⚠️ CUSTOM WEBXR TYPE DEFINITIONS — DELIBERATE TECHNICAL DEBT
//
// Risk: HIGH — incorrect pose/transform types can cause physical discomfort in VR.
// Decision: custom types chosen over @types/webxr for faster iteration (may be outdated).
// Alternative: find a well-maintained community fork, or contribute to official types.
//
// Status: ❌ NOT tested against real WebXR implementations
//         ❌ NOT validated for VR safety
//         🚨 Requires explicit expert review before production use

// Global type definitions for WebXR — automatically included by TypeScript

declare global {
  interface Navigator {
    xr?: XRSystem
  }
  
  interface Window {
    spotlightGame?: (target: string | number | Array<string | number>) => void
    clearSpotlights?: () => void
    findGame?: (identifier: string | number) => unknown
    findAllGames?: () => unknown[]
    debugGames?: () => void
    debugScene?: () => void
  }

  interface XRSystem {
    isSessionSupported(mode: XRSessionMode): Promise<boolean>
    requestSession(mode: XRSessionMode, options?: XRSessionInit): Promise<XRSession>
  }

  interface XRSession extends EventTarget {
    end(): Promise<void>
    requestReferenceSpace(type: XRReferenceSpaceType): Promise<XRReferenceSpace>
    requestAnimationFrame(callback: XRFrameRequestCallback): number
    cancelAnimationFrame(id: number): void
  }

  interface XRReferenceSpace extends XRSpace {
    getOffsetReferenceSpace(originOffset: XRRigidTransform): XRReferenceSpace
  }

  interface XRSpace extends EventTarget {}

  interface XRRigidTransform {
    position: DOMPointReadOnly
    orientation: DOMPointReadOnly
    matrix: Float32Array
    inverse: XRRigidTransform
  }

  type XRSessionMode = 'inline' | 'immersive-vr' | 'immersive-ar'
  type XRReferenceSpaceType = 'viewer' | 'local' | 'local-floor' | 'bounded-floor' | 'unbounded'
  type XRFrameRequestCallback = (time: DOMHighResTimeStamp, frame: XRFrame) => void

  interface XRSessionInit {
    optionalFeatures?: string[]
    requiredFeatures?: string[]
  }

  interface XRFrame {
    session: XRSession
    getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | null
  }

  interface XRViewerPose {
    transform: XRRigidTransform
    views: ReadonlyArray<XRView>
  }

  interface XRView {
    eye: XREye
    projectionMatrix: Float32Array
    transform: XRRigidTransform
  }

  type XREye = 'left' | 'right' | 'none'
}

export {}
