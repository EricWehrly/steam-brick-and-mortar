/**
 * Lighting & Mesh Operation Cost Test
 *
 * Measures wall-clock time for individual scene modification operations
 * in a warmed Three.js renderer (with GPU submission included).
 *
 * Run:  yarn dev  (localhost:5173)  – must be running
 *       yarn test:visual --grep "lighting operation costs"
 *
 * Output:
 *   - Inline markdown table in terminal
 *   - JSON file at client/test-results/lighting-costs.json
 */

import { test, expect } from '@playwright/test'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { attachConsoleCollector, waitForSceneReady } from './helpers/scene'

interface OpResult { op: string; ms: number }

const OPS: { key: string; label: string }[] = [
    { key: 'WARMUP',     label: 'Warmup (prime shaders)' },
    { key: 'LM1',        label: 'Move 1 light' },
    { key: 'LA1',        label: 'Add 1 light (batch)' },
    { key: 'LA10',       label: 'Add 10 lights (batch)' },
    { key: 'LA1_SLOW',   label: 'Add 10 lights (serial; anti-pattern)' },
    { key: 'LR1',        label: 'Remove 1 light' },
    { key: 'MM1',        label: 'Move 1 mesh' },
    { key: 'MA1',        label: 'Add 1 mesh (batch)' },
    { key: 'MA10',       label: 'Add 10 meshes (batch)' },
    { key: 'MA1_SLOW',   label: 'Add 10 meshes (serial; anti-pattern)' },
    { key: 'MR1',        label: 'Remove 1 mesh' },
]

test('lighting operation costs', async ({ page }) => {
    const entries = attachConsoleCollector(page)

    // Load with diagnostics so __sceneManager and THREE are exposed
    await page.goto('/?diagnostics=1', { waitUntil: 'domcontentloaded' })
    await waitForSceneReady(page, 45000, 3000)

    // Verify __sceneManager is accessible
    const smCheck = await page.evaluate(() => {
        const sm = (window as any).__sceneManager
        if (!sm?.getScene) return null
        const scene = sm.getScene()
        return { children: scene.children.length, renderer: !!sm.getRenderer() }
    })
    expect(smCheck, '__sceneManager not found – run with ?diagnostics=1').not.toBeNull()
    console.log(`Scene ready: ${smCheck!.children} children`)

    const results: OpResult[] = []

    // WARMUP
    results.push({ op: 'WARMUP', ms: await page.evaluate(() => {
        const THREE = (window as any).THREE
        const scene = (window as any).__sceneManager.getScene()
        const l = new THREE.PointLight(0xffffff, 0, 1)
        scene.add(l)
        scene.remove(l)
        // render not needed here – shader prime
        return 0
    })})
    await page.waitForTimeout(200)

    // LM1 — Move 1 light
    results.push({ op: 'LM1', ms: await page.evaluate(() => {
        const THREE = (window as any).THREE
        const scene = (window as any).__sceneManager.getScene()
        const renderer = (window as any).__sceneManager.getRenderer()
        const camera = (window as any).__sceneManager.getCamera()
        let l = scene.children.find((c: any) => c.isPointLight || c.isSpotLight)
        if (!l) {
            l = new THREE.PointLight(0xff0000, 1, 20)
            l.position.set(0, 5, 0)
            scene.add(l); renderer.render(scene, camera)}
        const t0 = performance.now()
        l.position.x += 0.5; l.position.y += 0.1
        renderer.render(scene, camera)
        return +(performance.now() - t0).toFixed(3)
    })})
    await page.waitForTimeout(100)

    // LA1 — Add 1 light (batch)
    results.push({ op: 'LA1', ms: await page.evaluate(() => {
        const THREE = (window as any).THREE
        const scene = (window as any).__sceneManager.getScene()
        const renderer = (window as any).__sceneManager.getRenderer()
        const camera = (window as any).__sceneManager.getCamera()
        const t0 = performance.now()
        const l = new THREE.PointLight(0x00ff00, 1, 20)
        l.position.set(3, 4, 2)
        scene.add(l)
        renderer.render(scene, camera)
        return +(performance.now() - t0).toFixed(3)
    })})
    await page.waitForTimeout(100)

    // LA10 — Add 10 lights (batch)
    results.push({ op: 'LA10', ms: await page.evaluate(() => {
        const THREE = (window as any).THREE
        const scene = (window as any).__sceneManager.getScene()
        const renderer = (window as any).__sceneManager.getRenderer()
        const camera = (window as any).__sceneManager.getCamera()
        const t0 = performance.now()
        for (let i = 0; i < 10; i++) {
            const l = new THREE.PointLight(0x0000ff, 0.2 + i * 0.1, 15)
            l.position.set(i * 0.5, 4, i * 0.3)
            scene.add(l)
        }
        renderer.render(scene, camera)
        return +(performance.now() - t0).toFixed(3)
    })})
    await page.waitForTimeout(100)

    // LA1_SLOW — Add 10 lights serially (anti-pattern: render after each)
    results.push({ op: 'LA1_SLOW', ms: await page.evaluate(() => {
        const THREE = (window as any).THREE
        const scene = (window as any).__sceneManager.getScene()
        const renderer = (window as any).__sceneManager.getRenderer()
        const camera = (window as any).__sceneManager.getCamera()
        const t0 = performance.now()
        for (let i = 0; i < 10; i++) {
            const l = new THREE.PointLight(0xff00ff, 0.2, 15)
            l.position.set(i * 0.3 + 10, 4, i * 0.2)
            scene.add(l)
            renderer.render(scene, camera)
        }
        return +(performance.now() - t0).toFixed(3)
    })})
    await page.waitForTimeout(100)

    // LR1 — Remove 1 light
    results.push({ op: 'LR1', ms: await page.evaluate(() => {
        const scene = (window as any).__sceneManager.getScene()
        const renderer = (window as any).__sceneManager.getRenderer()
        const camera = (window as any).__sceneManager.getCamera()
        const lights = scene.children.filter((c: any) => c.isPointLight)
        if (lights.length) scene.remove(lights[lights.length - 1])
        const t0 = performance.now()
        renderer.render(scene, camera)
        return +(performance.now() - t0).toFixed(3)
    })})
    await page.waitForTimeout(100)

    // MM1 — Move 1 mesh
    results.push({ op: 'MM1', ms: await page.evaluate(() => {
        const scene = (window as any).__sceneManager.getScene()
        const renderer = (window as any).__sceneManager.getRenderer()
        const camera = (window as any).__sceneManager.getCamera()
        const meshes: any[] = []
        scene.traverse((c: any) => { if (c.isMesh) meshes.push(c) })
        if (!meshes.length) return 0
        const t0 = performance.now()
        meshes[0].position.x += 0.1
        renderer.render(scene, camera)
        return +(performance.now() - t0).toFixed(3)
    })})
    await page.waitForTimeout(100)

    // MA1 — Add 1 mesh (batch)
    results.push({ op: 'MA1', ms: await page.evaluate(() => {
        const THREE = (window as any).THREE
        const scene = (window as any).__sceneManager.getScene()
        const renderer = (window as any).__sceneManager.getRenderer()
        const camera = (window as any).__sceneManager.getCamera()
        const t0 = performance.now()
        const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5)
        const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.1, roughness: 0.8 })
        const m = new THREE.Mesh(geo, mat)
        m.position.set(-5, 1, 0)
        scene.add(m)
        renderer.render(scene, camera)
        return +(performance.now() - t0).toFixed(3)
    })})
    await page.waitForTimeout(100)

    // MA10 — Add 10 meshes (batch)
    results.push({ op: 'MA10', ms: await page.evaluate(() => {
        const THREE = (window as any).THREE
        const scene = (window as any).__sceneManager.getScene()
        const renderer = (window as any).__sceneManager.getRenderer()
        const camera = (window as any).__sceneManager.getCamera()
        const t0 = performance.now()
        const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3)
        const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00, metalness: 0.1, roughness: 0.8 })
        for (let i = 0; i < 10; i++) {
            const m = new THREE.Mesh(geo, mat)
            m.position.set(-8 + i * 0.5, 1, 0)
            scene.add(m)
        }
        renderer.render(scene, camera)
        return +(performance.now() - t0).toFixed(3)
    })})
    await page.waitForTimeout(100)

    // MA1_SLOW — Add 10 meshes serially (anti-pattern: render after each)
    results.push({ op: 'MA1_SLOW', ms: await page.evaluate(() => {
        const THREE = (window as any).THREE
        const scene = (window as any).__sceneManager.getScene()
        const renderer = (window as any).__sceneManager.getRenderer()
        const camera = (window as any).__sceneManager.getCamera()
        const t0 = performance.now()
        const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2)
        const mat = new THREE.MeshStandardMaterial({ color: 0x0000ff, metalness: 0.1, roughness: 0.8 })
        for (let i = 0; i < 10; i++) {
            const m = new THREE.Mesh(geo, mat)
            m.position.set(5, 1 + i * 0.3, i * 0.2)
            scene.add(m)
            renderer.render(scene, camera)
        }
        return +(performance.now() - t0).toFixed(3)
    })})
    await page.waitForTimeout(100)

    // MR1 — Remove 1 mesh
    results.push({ op: 'MR1', ms: await page.evaluate(() => {
        const scene = (window as any).__sceneManager.getScene()
        const renderer = (window as any).__sceneManager.getRenderer()
        const camera = (window as any).__sceneManager.getCamera()
        const meshes: any[] = []
        scene.traverse((c: any) => { if (c.isMesh) meshes.push(c) })
        if (!meshes.length) return 0
        scene.remove(meshes[meshes.length - 1])
        const t0 = performance.now()
        renderer.render(scene, camera)
        return +(performance.now() - t0).toFixed(3)
    })})

    // ── Output ──────────────────────────────────────────────────────────
    // Parse JSON log lines from console
    const parsed: OpResult[] = []
    for (const e of entries) {
        if (e.type === 'log') {
            try {
                const obj = JSON.parse(e.text)
                if (obj.op && typeof obj.ms === 'number') parsed.push(obj as OpResult)
            } catch { /* skip */ }
        }
    }
    const finalResults = parsed.length >= 6 ? parsed : results
    const opMap = new Map<string, number>()
    for (const r of finalResults) opMap.set(r.op, r.ms)

    // Markdown table
    let table = '\n=== Lighting / Mesh Operation Costs ===\n'
    table += '| Op | Description | Time (ms) |\n'
    table += '|-----|-------------|----------|\n'
    for (const o of OPS) {
        const ms = opMap.get(o.key)
        table += `| ${o.key.padEnd(9)} | ${o.label.padEnd(38)} | ${ms !== undefined ? ms.toFixed(2) : 'N/A'} |\n`
    }
    console.log(table)

    // JSON report
    const testResultsDir = 'test-results'; //path.join('..', '..', 'test-results')
    // await mkdir(testResultsDir, { recursive: true })
    const reportPath = path.join(testResultsDir, 'lighting-costs.json')
    await writeFile(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        runner: 'Playwright + SwiftShader',
        sceneChildren: smCheck.children,
        operations: Object.fromEntries(opMap),
        table,
    }, null, 2))
    console.log('\nFull report: ' + reportPath)

    expect(opMap.size).toBeGreaterThanOrEqual(6)
})
