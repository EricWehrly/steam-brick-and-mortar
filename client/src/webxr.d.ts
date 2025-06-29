// ⚠️⚠️⚠️ CRITICAL RISK WARNING ⚠️⚠️⚠️
// 
// CUSTOM WEBXR TYPE DEFINITIONS - REQUIRES EXPERT REVIEW
//
// This file contains CUSTOM WebXR type definitions instead of using official types.
// 
// RISK LEVEL: HIGH
// - Incorrect WebXR types could cause PHYSICAL DISCOMFORT for VR users
// - Vision-replacing VR environments require 100% correct spatial/timing assumptions
// - Wrong pose/transform data could cause motion sickness or disorientation
//
// DELIBERATE TECHNICAL DEBT:
// - Decision: Use custom types for faster development iteration
// - Rationale: Official @types/webxr may be outdated, faster to implement basic types
// - Alternative: Find reliable community fork with updated WebXR types
//
// REQUIRED ACTION AFTER BASIC FUNCTIONALITY WORKS:
// - EXPLICIT EXPERT REVIEW REQUIRED before production use
// - Validate against actual WebXR implementations
// - Consider switching to well-maintained community types
// - Test extensively on real VR hardware for safety
//
// STATUS: ❌ NOT VALIDATED FOR VR SAFETY
//
// ⚠️⚠️⚠️ END CRITICAL RISK WARNING ⚠️⚠️⚠️

// Global type definitions for WebXR
// This will be automatically included by TypeScript

// ⚠️ **CRITICAL RISK WARNING** ⚠️
// CUSTOM WEBXR TYPE DEFINITIONS - DELIBERATE TECHNICAL DEBT
// 
// Risk Level: HIGH - Incorrect WebXR types could cause PHYSICAL DISCOMFORT for VR users
// Decision: Using custom types instead of @types/webxr or official definitions
// Rationale: Faster development iteration, official types may be outdated
// 
// 🚨 REQUIRED ACTION: EXPLICIT REVIEW REQUIRED after basic functionality works
// Alternative: Find reliable fork with updates or contribute to official types
// Impact: Vision-replacing VR environments require 100% correct spatial/timing assumptions
//
// Status: ❌ NOT TESTED against real WebXR implementations
//         ❌ NOT VALIDATED for VR safety and comfort
//         🚨 REQUIRES EXPERT REVIEW before production use

declare global {
  interface Navigator {
    xr?: XRSystem
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
