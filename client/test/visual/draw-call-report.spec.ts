import { test } from '@playwright/test'
import { writeFile } from 'fs/promises'
import { getResultPath } from './helpers/results'
import { waitForSceneReady } from './helpers/scene'

/**
 * Draw Call Report
 *
 * Navigates to the app, waits for scene ready, then extracts a breakdown of
 * what's contributing to each draw call via Three.js renderer.info and a
 * scene-graph walk.
 *
 * Output: test-results/draw-call-report.md (markdown table) and
 *         test-results/draw-call-report.json (raw data)
 *
 * Run: yarn test:visual --grep "draw call report"
 */
test('draw call report', async ({ page }) => {
  await page.goto('/')
  await waitForSceneReady(page, 30000, 5000)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const report = await page.evaluate(() => {
    const w = window as any

    // Set by SceneManager constructor
    const renderer = w.__threeRenderer ?? null
    const scene = w.__threeScene ?? null

    const rendererInfo = renderer?.info ?? null
    const objects: Array<{
      name: string
      type: string
      visible: boolean
      instanceCount: number | null
      triangles: number | null
      material: string | null
    }> = []

    if (scene) {
      scene.traverse((obj: any) => {
        if (obj.isMesh || obj.isInstancedMesh || obj.isLine || obj.isPoints) {
          const geo = obj.geometry
          const mat = obj.material
          const triCount = geo?.index
            ? geo.index.count / 3
            : (geo?.attributes?.position?.count ?? 0) / 3
          objects.push({
            name: obj.name || '(unnamed)',
            type: obj.isInstancedMesh ? 'InstancedMesh' : obj.isLine ? 'Line' : obj.isPoints ? 'Points' : 'Mesh',
            visible: obj.visible,
            instanceCount: obj.isInstancedMesh ? obj.count : null,
            triangles: Math.round(triCount * (obj.isInstancedMesh ? (obj.count ?? 1) : 1)),
            material: mat?.type ?? null,
          })
        }
      })
    }

    return {
      timestamp: new Date().toISOString(),
      rendererInfo: rendererInfo ? {
        calls: rendererInfo.render?.calls ?? 0,
        triangles: rendererInfo.render?.triangles ?? 0,
        points: rendererInfo.render?.points ?? 0,
        lines: rendererInfo.render?.lines ?? 0,
        programs: rendererInfo.programs?.length ?? 0,
        geometries: rendererInfo.memory?.geometries ?? 0,
        textures: rendererInfo.memory?.textures ?? 0,
      } : null,
      sceneObjects: objects,
    }
  })

  // Build markdown table
  const lines: string[] = []
  lines.push('# Draw Call Report')
  lines.push('')
  lines.push(`**Captured:** ${report.timestamp}`)
  lines.push('')

  if (report.rendererInfo) {
    const r = report.rendererInfo
    lines.push('## Renderer Summary')
    lines.push('')
    lines.push(`| Metric | Value |`)
    lines.push(`|--------|-------|`)
    lines.push(`| Draw Calls | ${r.calls} |`)
    lines.push(`| Triangles | ${r.triangles.toLocaleString()} |`)
    lines.push(`| Points | ${r.points} |`)
    lines.push(`| Lines | ${r.lines} |`)
    lines.push(`| Shader Programs | ${r.programs} |`)
    lines.push(`| Geometries | ${r.geometries} |`)
    lines.push(`| Textures | ${r.textures} |`)
    lines.push('')
  } else {
    lines.push('> ⚠️ renderer.info not available — renderer not exposed on window. See notes below.')
    lines.push('')
  }

  lines.push('## Scene Objects')
  lines.push('')
  if (report.sceneObjects.length > 0) {
    lines.push('| Name | Type | Visible | Instances | Triangles | Material |')
    lines.push('|------|------|---------|-----------|-----------|----------|')
    for (const obj of report.sceneObjects) {
      lines.push(`| ${obj.name} | ${obj.type} | ${obj.visible ? '✓' : '✗'} | ${obj.instanceCount ?? '—'} | ${obj.triangles?.toLocaleString() ?? '?'} | ${obj.material ?? '?'} |`)
    }
  } else {
    lines.push('> ⚠️ Scene not accessible via window.__threeScene. Wire it up in SceneManager for this report to work.')
  }

  lines.push('')
  lines.push('## Notes')
  lines.push('- Renderer info is available via `window.lodArtworkRenderer._renderer` or set `window.__threeRenderer` in SceneManager.')
  lines.push('- Scene walk requires `window.__threeScene` to be set (e.g. in SceneManager.buildScene).')
  lines.push('- Triangle count per InstancedMesh = per-instance triangles × instance count.')
  lines.push('- One draw call per visible InstancedMesh, plus one per standard Mesh and Line.')

  const md = lines.join('\n')
  const mdPath = await getResultPath('draw-call-report.md')
  const jsonPath = await getResultPath('draw-call-report.json')

  await Promise.all([
    writeFile(mdPath, md),
    writeFile(jsonPath, JSON.stringify(report, null, 2)),
  ])

  console.log('\n=== Draw Call Report ===')
  if (report.rendererInfo) {
    const r = report.rendererInfo
    console.log(`  Draw calls:    ${r.calls}`)
    console.log(`  Triangles:     ${r.triangles.toLocaleString()}`)
    console.log(`  Programs:      ${r.programs}`)
    console.log(`  Geometries:    ${r.geometries}`)
    console.log(`  Textures:      ${r.textures}`)
  } else {
    console.log('  ⚠️  renderer.info not available (window.lodArtworkRenderer or __threeRenderer not set)')
  }
  console.log(`  Scene objects: ${report.sceneObjects.length}`)
  console.log(`  Report:        ${mdPath}`)
})
