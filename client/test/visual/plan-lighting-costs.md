# Execution Plan: Lighting & Mesh Operation Cost Tests

## File
`client/test/visual/lighting-operation-costs.spec.ts`

## Approach
One Playwright test that loads the demo store once, waits for scene readiness, then performs a series of operations via `page.evaluate()`, each logging its wall-clock time to the console. All operations share the same warmed scene (shaders compiled, meshes in scene, render loop active).

## Operations measured
| ID | Operation | What it does |
|---|-----------|-------------|
| WARMUP | Add + remove a dummy light | Ensures shader warmup doesn't skew first measurement |
| LM1 | Move 1 light | Repositions 1 existing point light |
| LA1 | Add 1 light | Adds 1 new `THREE.PointLight` |
| LA10 | Add 10 lights (batched) | Adds 10 lights, then does one renderer update |
| LA1_SLOW | Add 10 lights (serial) | Add 1 light → update → add 1 → update... (the anti-pattern) |
| LR1 | Remove 1 light | Removes 1 light from scene |
| MM1 | Move 1 mesh | Changes position of 1 existing mesh |
| MA1 | Add 1 mesh | Adds a simple `BoxGeometry` + `MeshStandardMaterial` |
| MA10 | Add 10 meshes (batched) | Adds 10 meshes, then one renderer update |
| MA1_SLOW | Add 10 meshes (serial) | Add → update → add → update... (anti-pattern) |
| MR1 | Remove 1 mesh | Removes 1 mesh from scene |
| LCTRL | Logic control (reference) | Calls `EventManager.emit(ArrangementRequested)` — already measured ~12ms |

## Output format
Each `page.evaluate` step writes a JSON line to the console:
```json
{"op": "LA10", "ms": 2.34}
```

After all operations, the test parses all captured console entries and prints:
1. A **JSON blob** (machine-readable)
2. A **markdown table** (human-readable summary)

Results go to:
- Console output during `yarn test:visual`
- A JSON file at `client/test-results/lighting-costs.json`

## Run command
```
yarn dev              # terminal 1 — must be running on localhost:5173
yarn test:visual --grep "lighting operation costs"   # terminal 2
```

Output appears:
- **Inline** in the terminal running `yarn test:visual`
- **File**: `client/test-results/lighting-costs.json` (full JSON + markdown table)

## Notes
- SwiftShader timing ≠ real GPU, but **relative ratios** are stable.
- Each operation runs once per test run. If we need medians, we can run with `--retries=2` or add an internal loop.
- No changes to app code needed — scene, renderer, lights, and meshes are all reachable via `window.sceneManager` / `window.AppSettings` / scene traversal.
