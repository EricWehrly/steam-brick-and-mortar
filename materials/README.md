# Materials — Procedural Texture Library

Shared, cross-project library of Material Maker (`.ptex`) sources and their baked PBR texture
output. See `docs/plans/procedural-materials-pipeline-plan.md` (in this repo) for the full
pipeline design and rationale; this file is the short "how do I actually bake something" note.

## Layout

```
materials/
├── src/       # .ptex sources, one dir per material family (not yet populated)
├── variants/  # per-material variant/tier manifests
│   └── tiers.json   # quality (2048px) / performance (768px) tier definitions
├── baked/     # committed export output, organized per material/tier (not yet populated)
└── scripts/
    └── mm-bake.ps1   # the bake wrapper -- use this, don't hand-write the CLI invocation
```

## Prerequisite: Material Maker fork

Baking runs Material Maker **from source**, on our fork at
`F:\FilePrograms\Dropbox\Projects\material-maker`, branch `fix/cli-export-buffer-race`
(not `master`). The bundled release binary's CLI export **hard-crashes**; the from-source path
on stock `master` **silently produces incomplete, nondeterministic output** (a real race in
MM's buffer/texture-readback code). Our fork fixes all three underlying races.

Full investigation + fix writeup: [`mm-cli-export-patch-context.md`](mm-cli-export-patch-context.md).
Don't repeat that investigation if baking ever misbehaves again -- check the "What remains"
section there first, and confirm the clone is still on the fix branch
(`git -C F:\FilePrograms\Dropbox\Projects\material-maker branch --show-current`).

## Baking a material

```powershell
./scripts/mm-bake.ps1 -InputFile <path-to.ptex> -OutDir <dest-dir> -Size 2048
```

- Defaults to the fork + Godot 4.6-stable automatically -- no flags needed for the happy path.
- `-Size` stamps the resolution into a temp copy of the `.ptex` (MM's own `--size` CLI flag is a
  no-op). Use `variants/tiers.json`'s `quality`/`performance` values.
- `-Target` defaults to `GLTF/Plane` (albedo / packed-ORM / normal PNGs, glTF convention --
  what three.js `MeshStandardMaterial` expects directly).
- Full flag reference: `Get-Help ./scripts/mm-bake.ps1 -Full`.

Bake each material at both tiers (two calls, two `-OutDir`s / `-Size`s) until a proper
variant/tier batch script exists (Phase 1+ work, not built yet).

## Community library materials

materialmaker.org community materials are individually licensed, predominantly **CC0 / CC-BY**
-- free to use, including commercially, with the sole restriction being "don't monetize the
library itself." Safe to use as authoring starting points. If a specific material's license is
ever unclear, the fallback is authoring from scratch with MM's built-in node library (ships
under the project's own MIT license) -- never blocked, just potentially slower.

## Asset delivery (this project)

steam-brick-and-mortar serves baked textures from `client/public/textures/materials/<material>/<tier>/<map>.<ext>`,
following the existing static-asset convention in that repo (see `client/src/assets/runtimeAssetUrls.ts`
and `client/src/scene/SkyboxManager.ts` for the pattern: a `new URL(path, import.meta.url).href`
export per asset, loaded through the generic `TextureLoader.loadTexture(url)`). This directory
(`materials/`) is the library-owned canonical bake output; copying/packaging into a given
project's serving location is that project's own concern (Phase 1 wires this up for the client).
