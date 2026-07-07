# Feature: User-Supplied Wall Media (Murals & Posters)

**Act**: 4 / best-effort — **stub, not yet planned**
**Status**: Idea captured 2026-07-06 — map out later
**Priority**: Low — nice-to-have personal-expression mode

## Goal

Let users drop in their own **images** (JPG/PNG/WebP) to appear in the store as **wall murals,
posters, or backdrop art** — the 2D/wall-surface counterpart to the 3D
[User Prop Folder](user-prop-folder.md) ("bring your own models") effort.

Canonical use cases: a big wall mural of a favorite game's key art; personal posters filling the
wall space behind shelves; a custom backdrop for a room variant. IP is the user's (same posture as
User Prop Folder — they supply it, it's on them).

## Why it's cheap to add (mostly reuse)

Two pieces already exist or are in flight:

1. **File loading** — reuse the cross-browser infra being built for
   [User Prop Folder](user-prop-folder.md): hidden `<input type="file" webkitdirectory multiple>`
   (Chrome+Firefox+Safari base tier) → filter to image types → bytes in IndexedDB → `Blob` object
   URLs. The `showDirectoryPicker()` enhancement tier applies equally. Same storage/permission model.
2. **Wall material application** — reuse the wall-material seam from the
   [Procedural Textures Phase 1](../plans/procedural-textures-phase1-plan.md) work: a user image
   becomes a wall material (or a poster mesh's map), applied through
   `SharedMaterialManager`/`RoomManager` the same way baked textures are. A mural is essentially a
   non-tiling wall texture; a poster is a small quad with the image as its map.

## Open questions (for when this gets mapped)

- **Mural vs poster vs backdrop** — full-wall stretch (mural), placed rectangles (posters), or
  skybox/backdrop? Probably support at least mural + poster.
- **Placement** — which wall(s), auto-fit vs user-positioned, interaction with shelf/poster
  occlusion and Room Variants.
- **Aspect / tiling** — murals stretch or letterbox; posters keep aspect; neither tiles.
- **Color space / HDR** — user images are sRGB; straightforward.
- **Overlap with harvested set-dressing** — screenshot/game *posters* we source vs. user-supplied
  ones share the poster-mesh machinery; build the poster surface once.

## Related

- [User Prop Folder](user-prop-folder.md) — sibling (3D models); shares the file-loading infra.
- [Procedural Textures Phase 1 plan](../plans/procedural-textures-phase1-plan.md) — wall-material seam.
- [Scene Clutter & Props](scene-clutter-and-props.md) / [Fabricated Set Dressing](fabricated-set-dressing.md)
  — sourced posters/standees share the poster-mesh surface.
- [Room Variants](room-variants.md) — a custom backdrop could be a variant input.

---
*Stub — captured to preserve the idea; expand into a real feature doc + plan when prioritized.*
