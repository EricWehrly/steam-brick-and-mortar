# Service Locator / Service Registry — Abandoned Spike

**Branch**: `origin/service-registry` (kept for reference)  
**Date explored**: Oct 2025  
**Status**: Explored, reconsidered, abandoned  

---

## What was built

A capability-aware service locator pattern for resolving renderer implementations at runtime:

- `ServiceLocator` — registry + resolution engine, picks best-matching implementation based on `ServiceCapabilities`
- `CapabilityDetector` — wraps `SystemCapabilitiesDetector` to produce a `RuntimeCapabilities` struct
- `StorePropsRendererServices` — wired `GpuStorePropsRenderer` and `LegacyStorePropsRenderer` as registered implementations

```typescript
serviceLocator.register(IStorePropsRenderer, {
    name: 'InstancedStorePropsRenderer',
    implementation: InstancedStorePropsRenderer,
    capabilities: { webgl: '2', instancedArrays: true },
    preference: 10
})
const renderer = serviceLocator.get(IStorePropsRenderer, { args: [...] })
```

---

## Why it was abandoned

The DI container we already have (`ServiceContainer` / `ServiceRegistration`) plus the existing capability check at registration time covers the same need more simply. Adding a full service locator layer introduced indirection without proportionate benefit.

The `LegacyStorePropsHandler` fallback is already handled at registration time — if the GPU check fails, the legacy handler registers instead. The service locator pattern would have been a more elaborate version of this.

---

## When to revisit

If the codebase grows to a point where we're registering many competing implementations of the same interface and the manual `if (capable) register(GpuVersion) else register(LegacyVersion)` pattern becomes unwieldy. At that point the `ServiceLocator` approach from this branch is a reasonable starting point.

For now: the simpler approach wins.
