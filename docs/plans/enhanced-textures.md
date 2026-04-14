# Enhanced Textures

**Status:** In progress (carpet and ceiling complete off-thread; wood and wall complete off-thread)  
**Theme:** Procedurally generated PBR materials for the store environment, generated off the main thread via Web Workers.

---

## What this is

Instead of sourcing environment textures from an external asset pipeline (Blender, Substance, etc.), we generate them at runtime using deterministic noise algorithms in Web Workers. The goal is a store that feels like a real physical space — worn carpet, wood-grain shelves, textured ceiling — without shipping multi-MB texture atlases.

The tradeoff: generation is CPU-bound work that must happen off-thread, and the parameters we choose are currently hardcoded. That's intentional for now — get the look right first, add knobs later.

---

## Current materials

| Material | Worker type | Status |
|---|---|---|
| MDF Veneer (shelves) | `wood_enhanced` + `wood_normal` | ✅ Off-thread |
| Carpet | `carpet_classic` + `carpet_normal` | ✅ Off-thread |
| Ceiling (popcorn) | `ceiling_popcorn` + `ceiling_popcorn_normal` | ✅ Off-thread |
| Wall wood panels | `wood_planks` + `wood_normal` | ✅ Off-thread |

All materials are generated in `SharedMaterialManager.generateTexturesAsync()` and applied via `upsertMaterial()`, which preserves object identity so in-scene meshes receive the upgrade without being rebuilt.

---

## Hardcoded parameters (future knobs)

These are the values currently baked into `SharedMaterialManager.prewarmCarpet()` et al. They should eventually be exposed via settings or a design-token system.

### Carpet (`prewarmCarpet`)
```ts
color: '#8B0000'          // deep red base
accentColor: '#722F37'    // darker accent
fiberDensity: 0.4
roughness: 0.9
geometricIntensity: 0.1
variant: 'diamond'
scale: 1.0
seed: 12345               // deterministic — change to vary pattern
normalMapIntensity: 0.3
pileHeight: 0.3
fiberVariation: 0.2
repeat: 4x4
```

### MDF Veneer (`prewarmMDFVeneer`)
```ts
grainStrength: 0.3
ringFrequency: 0.01
color1: '#E6D3B7'  color2: '#D4C4A0'  color3: '#C8B896'
normalStrength: 0.06
repeat: 6x4
```

### Ceiling (`prewarmCeiling`)
```ts
color: '#E8E6D0'
bumpDensity: 14
bumpHeight: 1.4
detailScale: 5
normalStrength: 20
repeat: 6x6
```

### Wall wood (`prewarmWallWood`)
```ts
numPlanks: 4
grainFrequency: 1.2
grainStrength: 0.12
baseColors: ['#7B3F10', '#8B4A14', '#9B5520', '#A8622A', '#8C4A18', '#955218']
edgeColor: '#5C2F0A'
normalStrength: 0.3
repeat: 1x12 (rotated 90° so planks run vertically)
```

---

## What's left

- **Parameter exposure** — a settings/token system so these values can be tweaked without code changes. See `docs/plans/ui-design-tokens.md` for the broader design token direction.
- **Seed control** — carpet seed is hardcoded to `12345`. Randomising per-session or per-user would give each store a slightly different feel.
- **BasicWood** — `prewarmBasicWood()` exists but has no callers. Re-enable if a use is introduced.
- **Live preview** — a debug panel knob for adjusting carpet color/pattern at runtime would help dialling in the look. Deferred until the design token system exists.
