# Client

@./typescript.md

TypeScript WebXR application — Vite + Three.js. See root `CLAUDE.md` for project-wide rules (especially the Yarn/npx rule).

## Code Style

- **Named functions**: No anonymous functions — named methods and function declarations give better stack traces
- **No magic values**: Extract numbers and strings to named constants with semantic meaning
- **Meaningful comments only**: Don't restate what well-named code says; only explain why, non-obvious constraints, or links to specs

```typescript
// ❌
eventManager.registerEventHandler('progress', (event) => {
    if (progress > 0.9) { /* ... */ }
})

// ✅
private readonly CACHED_BATCH_THRESHOLD = 0.9
eventManager.registerEventHandler('progress', this.handleProgress.bind(this))
```

## UI Development

Use `UIComponentUtils` for form controls — see `src/utils/UIComponentUtils.ts` for patterns.

Event handler binding:
```typescript
// Simple call: bind
onClick: this.handleClick.bind(this)

// Conditional logic: arrow
onClick: () => { if (this.enabled) this.handleClick() }
```

## Testing

```
test/
├── unit/          # Isolated, mocked, fast (< 100ms, no network)
├── integration/   # Multi-component with mocked external services
├── live/          # Real network calls — excluded from default runs
├── utils/         # Shared helpers and mock factories
├── mocks/         # Mock implementations
└── setup.ts
```

```bash
yarn test           # unit + integration
yarn test:watch     # watch mode, no live
yarn test:live      # live only
yarn test:all       # everything
```

**Live test requirement**: filename must contain `live` (e.g., `steam-api-live.test.ts`) for vitest exclusion to work.

**Naming**: `component-name.test.ts` / `feature-integration.test.ts` / `feature-live.test.ts`

**Strategy**:
- Mock at the boundary (HTTP, browser APIs, external services) — keep business logic unmocked
- Use `test/utils/test-helpers.ts` for shared fixtures and factories
- Live tests: critical happy paths only; use real but safe data (public Steam games); handle timeouts and network failures
- `vi.useFakeTimers()` for time-based tests

## WebXR / Three.js

- `src/webxr.d.ts` — custom type definitions, handle carefully
- VR safety: incorrect spatial or timing assumptions can cause physical discomfort — review carefully
- **DataArrayTexture**: Always use `addLayerUpdate(slotIndex)` before `needsUpdate = true`. Never mark the entire array dirty — it uploads the full texture (~34MB) instead of just changed slots. See `.github/lessons-learned.md` for full context.
