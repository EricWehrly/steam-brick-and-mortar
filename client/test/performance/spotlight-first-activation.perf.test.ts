/**
 * Spotlight First-Activation Performance Test
 *
 * Measures how long the main thread is locked when `spotlight()` is first called.
 * The goal is NOT to set a pass/fail threshold — it is to produce a detailed timing
 * breakdown that lets us bisect the spike by commenting out sections of code and
 * re-running.
 *
 * ── HOW TO USE ─────────────────────────────────────────────────────────────────
 *  yarn vitest run --config vitest.performance.config.ts \
 *      test/performance/spotlight-first-activation.perf.test.ts
 *
 *  To isolate a section:
 *   1. Comment out the relevant lines below in the "Sections under test" suite.
 *   2. Re-run and compare the full-call time.
 *   3. The difference is the cost of the removed section.
 * ───────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import * as THREE from 'three'

import { GameSpotlight } from '../../src/debug/GameSpotlight'
import { GameFinder } from '../../src/debug/GameFinder'
import { DataManager } from '../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../src/core/data/DataTypes'
import { LightRegistry } from '../../src/lighting/LightRegistry'
import { ManagedRectAreaLight } from '../../src/lighting/ManagedLights'
import type { InstanceMetadata } from '../../src/debug/GameFinder'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ms(label: string, start: number, end: number): string {
    return `  ${label.padEnd(42)} ${(end - start).toFixed(3)} ms`
}

function addLegacyGames(scene: THREE.Scene, count: number): void {
    for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.3, 0.02),
            new THREE.MeshBasicMaterial()
        )
        mesh.name = `game-box-${i}`
        mesh.userData.isGameBox = true
        mesh.userData.name = `Legacy Game ${i}`
        mesh.userData.appid = 1000 + i
        mesh.position.set(i * 0.3, 0, 0)
        scene.add(mesh)
    }
}

function addInstancedMetadata(dataManager: DataManager, count: number): void {
    const artworkMetadata = new Map<number, InstanceMetadata>()
    for (let i = 0; i < count; i++) {
        artworkMetadata.set(i, {
            name: `Instanced Game ${i}`,
            appid: 2000 + i,
            position: new THREE.Vector3(i * 0.3, 0, 0)
        })
    }
    dataManager.set(DataKey.InstancedArtworkMetadata, artworkMetadata, { domain: DataDomain.Renderer })
}

function addRectAreaLights(scene: THREE.Scene, count: number): ManagedRectAreaLight[] {
    const lights: ManagedRectAreaLight[] = []
    for (let i = 0; i < count; i++) {
        const light = new ManagedRectAreaLight(0xffffff, 10, 1, 0.3)
        light.name = `rect-area-light-${i}`
        light.addToScene(scene)
        lights.push(light)
    }
    return lights
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const LEGACY_GAME_COUNT = 0    // ← tune: games using legacy userData in scene
const INSTANCED_GAME_COUNT = 400 // ← tune: games in instanced metadata
const RECT_LIGHT_COUNT = 6      // ← realistic: one per shelf row pair

let scene: THREE.Scene
let dataManager: DataManager
let spotlight: GameSpotlight

beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    dataManager = DataManager.getInstance()
    dataManager.clear()
    LightRegistry.getInstance().clear()

    scene = new THREE.Scene()
    dataManager.set(DataKey.MainScene, scene, { domain: DataDomain.Scene })

    addLegacyGames(scene, LEGACY_GAME_COUNT)
    addInstancedMetadata(dataManager, INSTANCED_GAME_COUNT)
    addRectAreaLights(scene, RECT_LIGHT_COUNT)

    // Construct spotlight (constructor calls GameFinder, which reads DataKey.MainScene)
    spotlight = new GameSpotlight()
})

afterEach(() => {
    spotlight.clear()
    dataManager.clear()
    LightRegistry.getInstance().clear()
    vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Full-path timing
// ---------------------------------------------------------------------------

describe('Spotlight first activation — full path', () => {
    it('measures total duration of spotlight() on an instanced game', () => {
        const target = `Instanced Game ${Math.floor(INSTANCED_GAME_COUNT / 2)}`

        const t0 = performance.now()
        spotlight.spotlight(target)
        const t1 = performance.now()

        const total = t1 - t0
        console.log(`\n── spotlight("${target}") ─────────────────────────`)
        console.log(`  TOTAL                                      ${total.toFixed(3)} ms`)
        console.log(`  Legacy games in scene: ${LEGACY_GAME_COUNT}`)
        console.log(`  Instanced games in metadata: ${INSTANCED_GAME_COUNT}`)
        console.log(`  RectAreaLights: ${RECT_LIGHT_COUNT}`)

        // Not a hard limit — just a sanity check that something ran
        expect(total).toBeGreaterThan(0)
    })

    it('measures total duration of spotlight() on a legacy game', () => {
        if (LEGACY_GAME_COUNT === 0) {
            console.log('\n  (Skip — LEGACY_GAME_COUNT is 0, set it above to test legacy path)')
            return
        }
        const target = `Legacy Game ${Math.floor(LEGACY_GAME_COUNT / 2)}`

        const t0 = performance.now()
        spotlight.spotlight(target)
        const t1 = performance.now()

        console.log(`\n── spotlight("${target}") ─────────────────`)
        console.log(`  TOTAL                                      ${(t1 - t0).toFixed(3)} ms`)
    })

    it('measures second call (warm path) vs first call', () => {
        const target = `Instanced Game 0`

        const t0 = performance.now()
        spotlight.spotlight(target)
        const t1 = performance.now()

        // Clear and re-spotlight so spotlights are rebuilt
        spotlight.clear()

        const t2 = performance.now()
        spotlight.spotlight(target)
        const t3 = performance.now()

        const first = t1 - t0
        const second = t3 - t2
        console.log(`\n── First vs second call ────────────────────────────`)
        console.log(`  First call                                 ${first.toFixed(3)} ms`)
        console.log(`  Second call (warm)                         ${second.toFixed(3)} ms`)
        console.log(`  Delta                                      ${(first - second).toFixed(3)} ms`)
    })
})

// ---------------------------------------------------------------------------
// Sections under test
// Comment out individual sections below and compare total time to isolate cost.
// ---------------------------------------------------------------------------

describe('Spotlight first activation — section timings', () => {
    it('measures each section in isolation', () => {
        const results: string[] = []

        // ── SECTION A: GameFinder.find() ─────────────────────────────────────
        // Comment out this block to remove GameFinder cost from total
        {
            const finder = new GameFinder()
            const target = `Instanced Game ${Math.floor(INSTANCED_GAME_COUNT / 2)}`
            const t0 = performance.now()
            finder.find(target)
            const t1 = performance.now()
            results.push(ms('A: GameFinder.find() [instanced]', t0, t1))
        }

        // ── SECTION B: GameFinder.find() — legacy traverse ──────────────────
        // Comment out to remove scene.traverse cost
        if (LEGACY_GAME_COUNT > 0) {
            const finder = new GameFinder()
            const target = `Legacy Game ${Math.floor(LEGACY_GAME_COUNT / 2)}`
            const t0 = performance.now()
            finder.find(target)
            const t1 = performance.now()
            results.push(ms(`B: GameFinder.find() [legacy traverse, ${LEGACY_GAME_COUNT} nodes]`, t0, t1))
        }

        // ── SECTION C: LightRegistry.getLightsByType() ───────────────────────
        // Comment out to remove registry lookup cost
        {
            const registry = LightRegistry.getInstance()
            const t0 = performance.now()
            registry.getLightsByType(THREE.RectAreaLight)
            const t1 = performance.now()
            results.push(ms(`C: LightRegistry.getLightsByType() [${RECT_LIGHT_COUNT} lights]`, t0, t1))
        }

        // ── SECTION D: THREE.SpotLight construction ──────────────────────────
        // Comment out to remove SpotLight allocation cost
        {
            const t0 = performance.now()
            const sl = new THREE.SpotLight(0xfff8e7, 3.0, 6, Math.PI / 10, 0.5, 2)
            const t1 = performance.now()
            sl.dispose()
            results.push(ms('D: new THREE.SpotLight()', t0, t1))
        }

        // ── SECTION E: CylinderGeometry construction ─────────────────────────
        // Comment out to remove beam geometry allocation cost
        {
            const t0 = performance.now()
            const geo = new THREE.CylinderGeometry(0.08, 0.12, 3.5, 24, 1, true)
            const t1 = performance.now()
            geo.dispose()
            results.push(ms('E: new THREE.CylinderGeometry() [beam]', t0, t1))
        }

        // ── SECTION F: ShaderMaterial construction ───────────────────────────
        // Comment out to remove ShaderMaterial allocation cost (before GPU compile)
        {
            const t0 = performance.now()
            const mat = new THREE.ShaderMaterial({
                uniforms: {
                    color: { value: new THREE.Color(0xfff8e7) },
                    opacity: { value: 0.2 },
                    gameBottomY: { value: 0.0 },
                    beamBottomY: { value: 0.0 }
                },
                vertexShader: 'void main() { gl_Position = vec4(0.0); }',
                fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
                transparent: true,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
            const t1 = performance.now()
            mat.dispose()
            results.push(ms('F: new THREE.ShaderMaterial() [beam]', t0, t1))
        }

        // ── SECTION G: Full spotlight() call ─────────────────────────────────
        // This is the number to compare against the sum of A–F.
        // Difference = overhead not yet accounted for.
        {
            const target = `Instanced Game ${Math.floor(INSTANCED_GAME_COUNT / 2)}`
            const t0 = performance.now()
            spotlight.spotlight(target)
            const t1 = performance.now()
            results.push(ms('G: full spotlight.spotlight() call', t0, t1))
        }

        console.log('\n── Section timings ─────────────────────────────────')
        results.forEach(r => console.log(r))
        console.log('────────────────────────────────────────────────────')
        console.log('  Compare G against sum of A–F to find unaccounted overhead.')
        console.log('  Comment out a section, re-run, see how G changes.\n')

        expect(results.length).toBeGreaterThan(0)
    })
})

// ---------------------------------------------------------------------------
// Scale sensitivity — does cost grow with scene size?
// ---------------------------------------------------------------------------

describe('Spotlight activation — scale sensitivity', () => {
    it('measures GameFinder.find() across scene sizes', () => {
        const sizes = [50, 200, 500, 1000]
        const results: string[] = []

        for (const count of sizes) {
            // Fresh scene for each size
            const scaledScene = new THREE.Scene()
            dataManager.clear()
            dataManager.set(DataKey.MainScene, scaledScene, { domain: DataDomain.Scene })

            const metadata = new Map<number, InstanceMetadata>()
            for (let i = 0; i < count; i++) {
                metadata.set(i, {
                    name: `Scale Game ${i}`,
                    appid: 3000 + i,
                    position: new THREE.Vector3(i * 0.3, 0, 0)
                })
            }
            dataManager.set(DataKey.InstancedArtworkMetadata, metadata, { domain: DataDomain.Renderer })

            const finder = new GameFinder()
            const target = `Scale Game ${Math.floor(count / 2)}`

            const t0 = performance.now()
            finder.find(target)
            const t1 = performance.now()

            results.push(ms(`GameFinder.find() @ ${count} instanced games`, t0, t1))
        }

        // Restore scene for afterEach
        dataManager.set(DataKey.MainScene, scene, { domain: DataDomain.Scene })
        addInstancedMetadata(dataManager, INSTANCED_GAME_COUNT)

        console.log('\n── Scale sensitivity ────────────────────────────────')
        results.forEach(r => console.log(r))
        console.log('────────────────────────────────────────────────────\n')

        expect(results.length).toBe(sizes.length)
    })
})
