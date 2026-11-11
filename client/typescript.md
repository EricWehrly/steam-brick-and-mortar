# TypeScript Standards

## Types & Interfaces

- Use `interface` for data structures and object shapes; `type` for unions, intersections, and aliases
- Prefer `readonly` on properties and arrays where mutation isn't intended
- Avoid `any` — use `unknown` when the type is genuinely unknown, then narrow it

## Event Types

Events emit only readonly data:

```typescript
// ❌
interface TextureLoadedEvent { slots: number[] }

// ✅
interface TextureLoadedEvent { readonly slots: readonly number[] }
```

## Nullability

- Use optional chaining (`?.`) and nullish coalescing (`??`) — not `||` for defaults (it swallows `0` and `""`)
- Return `null` (intentional absence) vs. `undefined` (not provided) consistently within a module

## Patterns

- Prefer `private readonly` for dependencies injected at construction
- Name boolean flags positively: `isLoaded`, not `notLoaded`

---
**Signature**: T1
