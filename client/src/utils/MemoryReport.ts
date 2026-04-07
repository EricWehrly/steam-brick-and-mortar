import { GpuMemoryEstimator } from '../debug/GpuMemoryEstimator'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'
import * as THREE from 'three'

export interface MemorySnapshot {
  timestamp: string
  mainHeapMB?: number        // window.performance.memory.usedJSHeapSize / 1e6 if available
  gpuEstimateMB?: number     // from GpuMemoryEstimator.getEstimate() if available
  textureArrayCount?: number // from DataManager if InstancedArtworkMetadata exists
  notes: string[]            // any warnings (e.g. "GPU estimator not available")
}

/**
 * Captures a structured memory snapshot of the application.
 * Collects JS heap (if available), GPU memory estimation, and internal data stats.
 */
export function captureMemorySnapshot(): MemorySnapshot {
  const notes: string[] = []
  const snapshot: MemorySnapshot = {
    timestamp: new Date().toISOString(),
    notes
  }

  // 1. JS Main Heap (Chrome-only non-standard API)
  const perf = window.performance as any
  if (perf && perf.memory && perf.memory.usedJSHeapSize) {
    snapshot.mainHeapMB = perf.memory.usedJSHeapSize / 1e6
  } else {
    notes.push('window.performance.memory not available (non-standard API)')
  }

  // 2. GPU Memory Estimate
  try {
    const dataManager = DataManager.getInstance()
    const renderer = dataManager.get<THREE.WebGLRenderer>(DataKey.Renderer)
    
    // GpuMemoryEstimator.estimate() handles missing renderer gracefully by calculating 
    // from scene traversal and registered consumers.
    const breakdown = GpuMemoryEstimator.estimate(renderer)
    snapshot.gpuEstimateMB = breakdown.totalEstimatedMB
    
    if (breakdown.warning) {
      notes.push(breakdown.warning)
    }
  } catch (err) {
    notes.push(`GPU estimator failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 3. Internal Data Stats (Texture Arrays)
  try {
    const dataManager = DataManager.getInstance()
    // Check if InstancedArtworkMetadata exists - it usually contains info about the texture arrays
    const artworkMetadata = dataManager.get(DataKey.InstancedArtworkMetadata)
    if (artworkMetadata) {
      // If it exists, we count it as active texture array usage.
      // In this codebase, 'textureArrayCount' often refers to the layers in the DataArrayTexture.
      // We'll check for common properties like 'count' or 'layers' if they exist, 
      // otherwise just flag that metadata exists.
      snapshot.textureArrayCount = (artworkMetadata as any).count || (artworkMetadata as any).layers || 1
    }
  } catch (err) {
    notes.push(`Texture array metadata check failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  return snapshot
}

// Global exposure for dev mode is handled in Task 4 (likely LodArtworkOrchestratorDebug.ts)
