# Plan: Neon Sign Stroke-Skeleton Rendering

**Status:** Deferred — neon entrance sign disabled pending implementation  
**Target phase:** Phase 3 (Polish)  
**Effort estimate:** Medium-large spike (2–4 days)

---

## Problem

The current neon sign renders each glyph *outline contour* as a tube loop. This produces:
- Multiple disjoint tube segments per letter (one per bezier contour)
- Visible seams at contour start/end points
- Hollow-outline appearance rather than solid neon strokes
- Inner cutouts on letters like 'e', 'a', 'o' appearing as separate floating loops

Real neon tube signs bend a **single continuous tube** along the *medial axis* (centreline) of each stroke — equidistant from both edges of the stroke.

---

## Preferred approach: Medial axis / stroke skeleton

Extract the stroke skeleton from glyph outlines and trace tubes along it.

### Why this is flexible
- Works with any font whose outlines can be parsed (typeface.js format, or opentype.js)
- Produces a single tube path per stroke rather than per contour segment
- Eliminates seam artifacts
- Allows variable tube radius along the path (tapers, bends at joints)

### No runtime dependencies
We keep Three.js as the only runtime dependency. All extraction runs in the existing
`neon-geometry.worker.ts` (off-main-thread), which already handles font fetch + path parsing.

### Implementation steps

1. **Font data input** — continue using `helvetiker_bold.typeface.json` (already loaded)
   or switch to a Hershey font (see Alternative below). No new runtime dep either way.

2. **Glyph polygon fill** — rasterize each glyph outline to a binary pixel grid inside
   the worker. Resolution ~64×64 px per em is sufficient for smooth skeletons at VR scale.
   Use scanline fill (standard CS algorithm, no deps).

3. **Thinning / skeletonization** — apply Zhang-Suen thinning (a classical pixel-grid
   algorithm, ~80 lines of pure JS) to reduce the filled glyph to a 1-pixel-wide skeleton.
   Reference: Zhang & Suen, "A Fast Parallel Algorithm for Thinning Digital Patterns", 1984.

4. **Path extraction** — trace connected skeleton pixels into ordered polylines.
   Handle branch points (letter joins, crossbars like 'H', 'A') by splitting at junctions.

5. **Smooth + sample** — run a simple moving-average smooth pass over each polyline,
   then sample at a configurable point density before handing to `CatmullRomCurve3` + `TubeGeometry`
   (same as current code from step 5 onward).

6. **Centering** — same offsetX/offsetY logic as current worker.

### Alternative: Hershey fonts

Hershey fonts (public domain, 1960s) are defined as polyline stroke data rather than
outlines — no skeleton extraction needed. Each letter is already a set of line segments.

Pros:
- Trivial to parse (simple integer coordinate format)
- Naturally produces single continuous strokes
- Zero extraction logic needed

Cons:
- Distinctive aesthetic (engineering/drafting look — could be a feature for neon)
- Limited character set (ASCII only, no Unicode)
- Would need to bundle the Hershey font data file (~30 KB) instead of helvetiker

A Hershey font renderer in the worker would be ~100 lines. Worth a prototype to compare
visual quality before committing to the skeleton approach.

---

## Font file concern

Both `BlockLetterSignRenderer` (FontLoader / typeface.json) and the neon worker
(fetch + typeface.json) depend on `/fonts/helvetiker_bold.typeface.json` being present
at runtime as a public asset.

This is a bundled static file, not a network dependency — it ships with the client.
However, it is third-party font data (Three.js examples asset, MIT licensed).

Options if we want to eliminate it:
- **Canvas fallback:** render text to a canvas, use the result as a texture (already done
  for canvas signs — same approach won't give 3D extrusion)
- **SVG path text:** use browser SVG text measurement to get bounding paths, convert to
  Three.js shapes. Works in the main thread but not in workers.
- **Hershey:** as above — different file, but smaller and unambiguously public domain

Recommended: keep helvetiker for now (it uses the MgOpen license — permissive for
software distribution but NOT the same as MIT; the font cannot be sold standalone).
Document the license in `THIRD_PARTY_LICENSES.md` (already done), note it in credits,
and revisit if the font file becomes a compliance concern at public release.

---

## Acceptance criteria (when this is picked up)

- [ ] Neon sign renders visible solid-stroke letters with no seam artifacts
- [ ] Each letter stroke is a single `TubeGeometry` path (or at most one per stroke branch)
- [ ] Works for the full ASCII printable range at minimum
- [ ] Existing `NeonGeometryWorker` tests still pass (API unchanged)
- [ ] No new runtime dependencies added
- [ ] Performance: geometry builds in < 500 ms for a 10-character string on a mid-range machine

---

## Current state

- `NeonTubeSignRenderer` and `NeonGeometryWorker` are intact and tested
- Neon entrance sign spawn is disabled in `SceneSignManager.syncNeonEntranceSign()`
  (one commented-out line — trivial to re-enable)
- `BlockLetterSignRenderer` is also disabled pending the font file decision
- See `docs/roadmaps/phase3-ready-for-everyone.md` Feature 10.1 for roadmap entry
