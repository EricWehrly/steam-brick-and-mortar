# Atlas / P-Body Skeleton Notes (working space — not committed to a feature doc)

Findings from directly inspecting `atlas.glb` / `pbody.glb`'s node hierarchy — not assumptions.
Written so a future session (or a different Claude instance) can pick up pose work without
re-deriving any of this.

## Regenerate this data anytime

```bash
python desktop/source-extract/scripts/inspect_skeleton.py desktop/source-extract/output/atlas.glb
python desktop/source-extract/scripts/inspect_skeleton.py desktop/source-extract/output/pbody.glb
```

Prints: mesh/skin counts, full bone parent/child tree, and flags any node that's both
disconnected from the hierarchy AND actually deforms the mesh (the dangerous case — none found
for either model, see below). `--max-depth N` controls tree depth (default 10, use 3-4 for a
quick skim).

## TL;DR

- Both models are **one continuous skinned mesh** (not separate rigid pieces) — bone rotation
  should deform smoothly like a normal rigged character, no parts visually detaching.
- **Atlas and P-Body do NOT share a bone-naming convention** despite being built on the same
  "coop_bots" asset base. Don't assume one model's bone names work for the other.
- Both have "helper" nodes floating outside the real armature (decorative attachment/aim
  points, likely used in Source for particle-effect attachment or the runtime piston
  stretch-constraint system). Confirmed via the script that **none of these orphaned nodes
  carry skin weight** — they're inert, safe to ignore, won't cause tearing.
- The bend-axis convention (which local axis is the hip/knee "hinge") is **not yet verified
  against a render** — we have no way to preview this ourselves. See "Open question" below.

## Key articulation chains

### Atlas (`atlas.glb`)

Root object in the glTF scene is `ballbot_ARM`; the real skeleton root bone is `root`.

| Region | Chain |
|--------|-------|
| Left leg | `root → L_thigh → L_knee → L_foot → L_toe` |
| Right leg | `root → R_thigh → R_knee → R_foot → R_toe` (mirror) |
| Spine/body | `root → spine1 → Body_ball` (main ball body), `spine1 → bicep_L/bicep_R` (arms) |
| Left arm | `spine1 → bicep_L → elbow_L → wrist_L → {ring,index,thumb,mid}_0_L → ..._1_L → ..._2_L` |
| Right arm | mirrors left with `_R` suffix |
| Head/eyes | `Body_ball → eyebrow_joint`, `eye_mechanism_joint → eye_iris_joint`, `{lower,upper}Eyelid_joint` |

Piston helper joints (e.g. `Lfoot_outerFrontPistonBase_joint`) ARE properly parented within
this hierarchy — they'll move rigidly with their parent bone when reposed, which is fine since
they're just skin-weight influence points on the continuous mesh surface, not separate objects.

Orphaned/inert (74 top-level, zero skin weight, safe to ignore): all `vstAttach_*` nodes —
these mirror the piston structure by name but sit disconnected from the armature. Likely
leftover VFX attachment points from the source Source-engine rig.

### P-Body (`pbody.glb`)

Root object in the glTF scene is `eggbot_ARM`; the real skeleton root bone is `root`.
**Different bone names than Atlas** — verified directly, not assumed:

| Region | Chain |
|--------|-------|
| Left leg | `root → thigh_A_L → knee_A_L → ankle_A_L → L_ankle_group_Joint → L_ankle_Yrot_joint` |
| Right leg | `root → thigh_A_R → knee_A_R → ankle_A_R → R_ankle_group_Joint → R_ankle_Yrot_joint` |
| Spine | `root → spine1_1 → spine1_2 → spine1_3` (three-segment spine, unlike Atlas's single `spine1`) |
| Left arm | `spine1_3 → clavicle_A_L → bicep_A_L → elbow_A_L → wrist_A_L → {mid2,index2,thumb2}_0_A_L → ..._1_A_L → ..._2_A_L` |
| Right arm | mirrors left with `_R` (note: right-side fingers are named `mid3_*_A_R`/`index3_*_A_R`/`thumb3_*_A_R` — the "2"/"3" prefix differs from the left side's "2", inconsistent but real) |
| Head/eyes | `core_bone_remover → Core_bone_ZYX → eye_bone → eye_iris`, `upLid_joint`, `lowLid_joint` |

Orphaned/inert (56 top-level, zero skin weight, safe to ignore): all `piston_A*_aim` /
`piston_B*_aim` / `*_thigh_piston_*_aim` / `*_knee_piston_*_aim` nodes, plus `vstAttach_Lhand`/
`vstAttach_Rhand`, plus damage/impact/marker attachment points.

## Current pose implementation

Code lives in `client/src/scene/props/UserPropPlacer.ts`:

- `SIT_POSE_BONES` — per-model bone name lookup (`atlas` / `pbody` keys, matching the chains above)
- `SIT_HIP_BEND_DEG` / `SIT_KNEE_BEND_DEG` / `SIT_BEND_AXIS` — the pose values, currently a
  first-pass guess (hip 55°, knee -100°, axis Z)
- Applied automatically in `placeModel()` right after the existing upright-rotation fix

## Diagnostic tool (browser console, no rebuild needed)

```js
listPropBones('atlas')                        // print every bone name + parent
posePropBone('atlas', 'L_knee', 0, 0, -90)     // set one bone's LOCAL rotation live (degrees)
resetPropPose('atlas')                         // zero all bone rotations back out
```

Same three functions work for `'pbody'` with its own bone names from the table above.

## Open question — bend axis

We picked `z` as the hinge axis based on one clue: every leg-chain child's `translation` vector
is almost purely along local X (e.g. Atlas `L_knee: t=[0.35, -0.0, -0.0]`, `L_foot: t=[0.418, 0,
-0.0]`) — meaning local **X is the bone-length axis** for both models' legs. That narrows the
hinge to Y or Z, but doesn't say which. We have no way to render and check ourselves, so `z` is
an educated guess, not a verified fact.

If the sit pose looks wrong in a way that suggests wrong-axis rather than wrong-angle (e.g. the
leg twists instead of bending, or bends sideways instead of forward/back), try `y` instead of
`z` via `posePropBone()` before touching angle values — cheaper to rule out first.

## If asked for a different pose later

1. Check whether the target pose only needs the leg chains (reuse `SIT_POSE_BONES` structure)
   or needs arm/spine bones too (use the region tables above, or re-run the script for full detail).
2. Tune live via the console functions first — confirm bone names + axis + angle actually look
   right before writing constants back into `UserPropPlacer.ts`.
3. Remember Atlas and P-Body need separate bone names in whatever config drives the new pose —
   there is no shared naming to lean on.
