# Client

@./typescript.md

TypeScript WebXR application — Vite + Three.js. See root `CLAUDE.md` for project-wide rules (especially the Yarn/npx rule).

## Code Style

- **No magic values**: Extract numbers and strings to named constants with semantic meaning

(Named-function and comment conventions are covered by the global TypeScript instructions — not repeated here.)

## UI Development

Use `UIComponentUtils` for form controls — see `src/utils/UIComponentUtils.ts` for patterns.

**Colors**: `src/ui/tokens.css`'s `--color-*` custom properties are the one design-token source for
the whole app — DOM UI chrome AND in-scene/3D surfaces alike (a game box's own printed-material
color is still a color the rest of the app might need to reuse or reference later; it doesn't get a
separate palette just because it renders as a mesh instead of a `<div>`). Non-DOM code (uikit/
three.js, or any other TypeScript that isn't itself a styled DOM element) can't read CSS custom
properties directly, so `src/ui/ColorTokens.ts` resolves each token once at module load into
`COLOR_TOKENS`, a plain hex-string object anything can import — deliberately generic, not scoped to
uikit specifically, even though that was its first consumer. Before writing a bare hex literal
anywhere, check whether an existing `COLOR_TOKENS` key already means what you need; if the *concept*
doesn't exist yet (not just the color), add a new `--color-*` token to tokens.css and a matching key
to `ColorTokens.ts` rather than inlining a literal "because this is content/box-art, not app chrome"
— that reasoning has been wrong before.

Event handler binding:
```typescript
// Simple call: bind
onClick: this.handleClick.bind(this)

// Conditional logic: arrow
onClick: () => { if (this.enabled) this.handleClick() }
```

## Type Checking

Run plain `yarn tsc` (no args, no piping/grep) after finishing a change, not just when explicitly asked. When everything compiles, output is just the yarn banner + `Done in Xs` — minimal tokens. Don't pre-filter with `Where-Object`/`grep` for a specific file; that produces a slightly different command every time, which re-triggers permission prompts. Only reach for filtering if the plain run actually shows unrelated pre-existing errors you need to distinguish from new ones.

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

### Running tests

```bash
yarn test                    # unit + integration — always prints FAILURES: N summary
yarn test:watch              # watch mode with verbose reporter
yarn test:integration        # integration suite only
yarn test:live               # live network tests only
yarn test:all                # everything except live
```

Scoped runs (vitest pattern passthrough — faster for targeted fixes):
```bash
yarn vitest run test/unit/scene/
yarn vitest run test/unit/scene/SceneManager-lighting.test.ts
yarn vitest run --reporter=verbose   # full output when needed
```

**Reading results**: `yarn test` always prints `FAILURES: N` as the first line, followed by a `SLOW (>2s)` section if any tests exceeded that threshold. For full detail, read `test-results/test-results.json` — pretty-printed, summary in the first 8 lines, failures immediately after. Don't parse raw stdout.

**Live test requirement**: filename must contain `live` (e.g., `steam-api-live.test.ts`) for vitest exclusion to work.

**Naming**: `component-name.test.ts` / `feature-integration.test.ts` / `feature-live.test.ts`

**Strategy**:
- Mock at the boundary (HTTP, browser APIs, external services) — keep business logic unmocked
- Use `test/utils/test-helpers.ts` for shared fixtures and factories
- Live tests: critical happy paths only; use real but safe data (public Steam games); handle timeouts and network failures
- `vi.useFakeTimers()` for time-based tests

## Logging

Logger is in `src/utils/Logger.ts`. Default global level is **INFO** — `debug()` and `lifecycle()` calls are suppressed unless you opt in.

**To see debug output for a class during development:**

From the browser console (no code change needed):
```js
setLogLevel('PropUserModel', 'DEBUG')   // enable debug for one class
setGlobalLogLevel('DEBUG')              // enable for everything
listLogLevels()                         // see what's currently overridden
resetLogLevel('PropUserModel')          // revert one class
```

From code (e.g. a dev-only shim, or temporarily in the class itself):
```typescript
import { Logger, LogLevel } from '../utils/Logger'
Logger.setContextLevel('PropUserModel', LogLevel.DEBUG)
```

URL shortcut: `?debug=true` on the dev server sets global level to DEBUG on load.

**Permanently silencing a noisy class**: add it to `initializeDefaultContextLevels()` in `Logger.ts` — that's the canonical place for context-level defaults.

**`runtime` logs** are a separate category (disabled by default regardless of level — high-frequency frame events). Enable with `enableRuntimeLogs()` from the console.

**During tests**: global level is automatically set to WARN to reduce noise.

## WebXR / Three.js

- `src/webxr.d.ts` — custom type definitions, handle carefully
- VR safety: incorrect spatial or timing assumptions can cause physical discomfort — review carefully
- **DataArrayTexture**: Always use `addLayerUpdate(slotIndex)` before `needsUpdate = true`. Never mark the entire array dirty — it uploads the full texture (~34MB) instead of just changed slots. See `.github/lessons-learned.md` for full context.

### Webserver

Stop trying to start / `yarn dev`. This has too many times resulted in a rogue background process that has to be hunted down and terminated to free the port. It's easier to just leave the thing running. Our typical state currently is that the dev server is running during development, and you should be able to curl localhost to quick check if it needs to come up. Ask the user to start it if it is not running. 
If your MCP allows you to interface with the browser, you should be able to do so for whatever the "client" side of those permissions is configured for. Assume the webserver is available.
(Side note, very project-specific: we should make a quick deterministic way to broadcast version so we can double-check that it's our workspace, or commit, or branch, or whatever works best that's running)
