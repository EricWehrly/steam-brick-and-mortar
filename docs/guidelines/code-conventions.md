# Code Conventions

These are "clean as you go" rules — not separate tasks, but quick checks when you're already editing a file.

---

## Event-driven coupling

**Prefer events over direct calls between coordinators and managers.** When one system needs to react to a state change in another, emit an event and subscribe — don't hold a reference and call methods directly.

Direct calls create import cycles, make testing harder, and violate the coordinator pattern. New coupling via direct method calls is a red flag.

**Bad** (FocusCoordinator holding a SceneManager reference to pause/resume it):
```typescript
const focusCoordinator = new FocusCoordinator(eventManager, sceneManager)
// ...
this.sceneManager.pauseRenderLoop()
```

**Good** (emit an event; SceneManager subscribes internally):
```typescript
this.eventManager.emit<VisibilityChangedEvent>(AppEventTypes.VisibilityChanged, { visible: false, ... })
// SceneManager.constructor registers its own handler
```

Singletons like `EventManager` don't need to be injected — call `EventManager.getInstance()` directly. See below for the canonical shape.

---

## Singletons

**Canonical pattern** (`EventManager`, `AppSettings`, `SteamApiClient`): private static instance, private constructor, a public static `getInstance()` that lazily constructs on first call.

```typescript
export class Foo {
    private static instance: Foo | null = null
    private constructor() { /* ... */ }

    public static getInstance(): Foo {
        if (!Foo.instance) {
            Foo.instance = new Foo()
        }
        return Foo.instance
    }
}
```

Call `Foo.getInstance()` directly at the point of use — singletons don't need constructor injection.

If tests need a clean instance between runs, add a `static dispose()` that nulls the instance so the next `getInstance()` call constructs fresh (see `AppSettings.dispose()`, `SteamApiClient.dispose()`).

**Not the pattern to copy**: `SteamIntegration` uses a different shape — `static getInstance(): SteamIntegration | null`, which can return `null`, with the instance assigned *inside the constructor* (`SteamIntegration._instance = this`) rather than lazily created by `getInstance()` itself. This exists because `SteamIntegration` needs bootstrap-supplied config (e.g. `maxGames`) constructed once by `SteamBrickAndMortarApp` — its `getInstance()` only lets other code reach the already-constructed instance, it doesn't create one. Default to the lazy `getInstance()` pattern above for any new singleton; only reach for `SteamIntegration`'s registry-style shape if the class genuinely can't be constructed with no arguments.

---

## JSDoc hygiene

**Remove JSDoc that just restates the signature.** TypeScript types already document parameters and return types. A comment like:

```typescript
/** Gets the material type */
getMaterial(type: MaterialType): THREE.MeshStandardMaterial
```

adds zero signal. Delete it.

**Keep comments that explain:**
- *Why* a decision was made
- Non-obvious behavior or edge cases
- Architecture intent or constraints
- TODOs with context

**Bad** (restate the obvious):
```typescript
/** Initializes the renderer with the given config */
public initialize(config: RendererConfig): void
```

**Good** (explains why):
```typescript
// Deferred init — we don't have the camera reference until GameStart fires
public initialize(config: RendererConfig): void
```

---

## File size

Files over ~500 lines (including whitespace) are a signal of responsibility bloat. When you're already making substantial changes to a file near this threshold, consider splitting as part of the same PR. Not a hard rule — test files and generated types can be legitimately large. Use judgment.

Check line count with: `wc -l <file>` or `Get-Content <file> | Measure-Object -Line`

---

## TD tags

Source files may have `// TD: <tag-id>` comments at the file top (not per-method). These link to entries in `docs/tech-debt.md`. See `docs/README.md` for the full convention.

---

## Naming

- Prefer descriptive names over generic ones (`GameArtworkRequest` > `GameArtworkHandle`)
- Class names should say what the thing *is*, not how it's used internally
- Interface names describe the contract; impl names describe the thing (`GameArtwork` interface, `GameArtworkRequest` impl)
