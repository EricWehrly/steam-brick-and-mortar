# Source 1 Asset Wishlist (working space — not committed)

Tracking iconic props from Source 1 games that are candidates for the store scene.
Pipeline proven: vpkeditcli → Blender + SourceIO → GLB. See `desktop/README.md`.

Canonical paths and batch tooling are in `desktop/source-extract/`.

## Status key
- ✅ Extracted and converted
- 🔄 In progress
- ❌ Blocked (dependency, license concern)
- 🔮 Future candidate

---

## Portal 2

| Model path (in VPK) | Prop | Status | Notes |
|---|---|---|---|
| `models/props/metal_box.mdl` | Companion Cube | ✅ | 482 KB GLB |
| `models/npcs/turret/turret.mdl` | Sentry Turret | ✅ | 11 MB GLB |
| `models/props/sphere.mdl` | Weighted Sphere | ✅ | 26 KB GLB |
| `models/npcs/personality_sphere/personality_sphere.mdl` | Wheatley | ✅ | 2.8 MB GLB |
| `models/npcs/glados/glados_animation.mdl` | GLaDOS | ✅ | 6.4 MB GLB — full rig |
| `models/player/ballbot/ballbot.mdl` | Atlas | ✅ | 1.7 MB GLB — blue co-op robot |
| `models/player/eggbot/eggbot.mdl` | P-Body | ✅ | 1.6 MB GLB — orange co-op robot |
| `models/player/chell/player.mdl` | Chell | ✅ | 32 MB GLB — high-res character textures |

---

## Half-Life 2 / Episodes

| Model path (in VPK) | Prop | Status | Notes |
|---|---|---|---|
| `models/weapons/w_crowbar.mdl` | Crowbar | 🔮 | iconic |
| (unknown) | Gravity Gun | 🔮 | search: `vpk.py search hl2 physcannon` |
| (unknown) | Gordon's HEV Suit | 🔮 | search: `vpk.py search hl2 hev` |
| (unknown) | D.O.G. | 🔮 | search: `vpk.py search hl2 dog` |
| (unknown) | Barney | 🔮 | search: `vpk.py search hl2 barney` |

---

## Team Fortress 2

| Model path (in VPK) | Prop | Status | Notes |
|---|---|---|---|
| (unknown) | All class characters | 🔮 | search: `vpk.py search tf2 <class>` |
| (unknown) | Heavy's Sandwich | 🔮 | |
| (unknown) | Engineer's Sentry | 🔮 | |
| (unknown) | Briefcase | 🔮 | |

---

## Pipeline notes

- VPK locations vary by game — check `pak01_dir.vpk` in the game's main folder
- Material files (`.vmt` + `.vtf`) must also be extracted alongside the model
- Some models have LOD variants (`.dx80.vtx`, `.dx90.vtx`) — prefer `.dx90.vtx`
- Portal 2 VPKs are at: `Steam\steamapps\common\Portal 2\portal2\pak01_dir.vpk`
- TF2 VPKs are at: `Steam\steamapps\common\Team Fortress 2\tf\tf2_misc_dir.vpk`
