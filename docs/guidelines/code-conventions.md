# Code Conventions

These are "clean as you go" rules — not separate tasks, but quick checks when you're already editing a file.

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
