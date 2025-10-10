/**
 * Test Mode Enumeration
 * 
 * Defines available test modes for development and debugging.
 * These can be enabled via the app configuration to activate specific test scenarios.
 */

export enum TestMode {
    /** Spawn simple test objects (cubes, spheres) for scene validation */
    SPAWN_TEST_OBJECTS = 'SPAWN_TEST_OBJECTS',
    
    /** GPU instanced rendering with texture arrays for game box labels */
    GPU_INSTANCED_TEXTURES = 'GPU_INSTANCED_TEXTURES'
}

/**
 * Helper to check if a test mode is enabled
 */
export function isTestEnabled(tests: Record<string, string> | undefined, mode: TestMode): boolean {
    if (!tests) return false
    return tests[mode] === 'enabled' || tests[mode] === 'true' || tests[mode] === '1'
}

/**
 * Get all enabled test modes
 */
export function getEnabledTests(tests: Record<string, string> | undefined): TestMode[] {
    if (!tests) return []
    
    return Object.entries(tests)
        .filter(([_, value]) => value === 'enabled' || value === 'true' || value === '1')
        .map(([key, _]) => key as TestMode)
        .filter(key => Object.values(TestMode).includes(key))
}
