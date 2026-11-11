/** Named camera projections the settings menus offer; applying one sets the camera settings. */

export interface CameraPreset {
    name: string
    fov: number
    near: number
    far: number
    description: string
}

export const CAMERA_PRESETS = {
    NORMAL: { name: 'Normal', fov: 75, near: 0.1, far: 1000, description: 'Standard perspective, natural look' },
    WIDE: { name: 'Wide', fov: 90, near: 0.1, far: 1000, description: 'Wider view, better for VR (default)' },
    ULTRA_WIDE: { name: 'Ultra Wide', fov: 110, near: 0.1, far: 1000, description: 'Maximum awareness, slight distortion' },
    CINEMATIC: { name: 'Cinematic', fov: 60, near: 0.1, far: 1000, description: 'Narrow FOV, focused view, less distortion' },
    TELEPHOTO: { name: 'Telephoto', fov: 45, near: 0.5, far: 1000, description: 'Very narrow, compressed perspective' }
} as const satisfies Record<string, CameraPreset>

export type CameraPresetKey = keyof typeof CAMERA_PRESETS
