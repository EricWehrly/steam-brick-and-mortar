"""
Converts a Source 1 .mdl to .glb using SourceIO inside Blender (headless).

Usage (via Docker from project root):
    MSYS_NO_PATHCONV=1 docker compose run --rm blender blender --background --python /app/desktop/scripts/convert_mdl.py

Volume layout (project root mounted at /app):
    /app/blender/addons/SourceIO.zip  <- SourceIO addon zip (committed); auto-extracted on first run
    /app/blender/addons/SourceIO/     <- extracted by this script if not present
    /app/desktop/
        extracted/
            models/props/
                metal_box.mdl  .vvd  .vtx  .dx90.vtx  .phy
            materials/models/props/
                metal_box.vmt  .vtf  metal_box_normal.vtf  metal_box_exponent.vtf
        output/                     <- created by this script; .glb lands here

Extraction step (run on host first):
    vpkeditcli --extract "models/props/metal_box.mdl" -o desktop/extracted/models/props/metal_box.mdl <pak01_dir.vpk>
    (repeat for .vvd, .vtx, .dx90.vtx, .phy and material files)
    See desktop/tools/vpkedit/README.md for VPKEdit download + usage.
"""
import os
import sys
import zipfile

import bpy

MDL_PATH      = '/app/desktop/extracted/models/props/metal_box.mdl'
OUTPUT_DIR    = '/app/desktop/output'
OUTPUT_GLB    = os.path.join(OUTPUT_DIR, 'metal_box.glb')
SOURCEIO_ZIP  = '/app/blender/addons/SourceIO.zip'
SOURCEIO_DIR  = '/app/blender/addons/SourceIO'


def ensure_sourceio():
    if os.path.exists(SOURCEIO_DIR):
        return
    if not os.path.exists(SOURCEIO_ZIP):
        print(f"ERROR: SourceIO zip not found at {SOURCEIO_ZIP}")
        sys.exit(1)
    print(f"Extracting SourceIO from {SOURCEIO_ZIP}...")
    with zipfile.ZipFile(SOURCEIO_ZIP) as z:
        z.extractall('/app/blender/addons/')
    print("SourceIO extracted.")


def enable_sourceio():
    # BLENDER_USER_SCRIPTS=/app/blender is set in the Dockerfile.
    # SourceIO lives at blender/addons/SourceIO/ (volume-mounted to /app/blender/addons/SourceIO/),
    # so no install or symlink step is needed — just enable it.
    bpy.ops.preferences.addon_refresh()
    result = bpy.ops.preferences.addon_enable(module='SourceIO')
    print(f"  addon_enable result: {result}")

    if 'SourceIO' not in bpy.context.preferences.addons:
        print("ERROR: SourceIO addon is not active — is blender/addons/SourceIO/ present?")
        sys.exit(1)
    print("SourceIO active.")


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_mdl():
    print(f"Importing: {MDL_PATH}")
    if not os.path.exists(MDL_PATH):
        print(f"ERROR: MDL not found at {MDL_PATH}")
        sys.exit(1)

    mdl_dir = os.path.dirname(MDL_PATH) + '/'
    mdl_name = os.path.basename(MDL_PATH)
    # Must pass directory + files — self.files is empty when called without Blender's file browser
    result = bpy.ops.sourceio.mdl(
        filepath=MDL_PATH,
        directory=mdl_dir,
        files=[{'name': mdl_name}],
        discover_resources=True,
    )
    print(f"Import result: {result}")

    all_objects = list(bpy.data.objects)
    print(f"bpy.data.objects: {[o.name for o in all_objects]}")

    if not all_objects:
        print("ERROR: No objects in bpy.data — import produced nothing.")
        sys.exit(1)

    for obj in all_objects:
        if obj.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(obj)


def export_glb():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Exporting to: {OUTPUT_GLB}")
    result = bpy.ops.export_scene.gltf(
        filepath=OUTPUT_GLB,
        export_format='GLB',
        export_apply=True,
        use_selection=False,
    )
    print(f"Export result: {result}")

    if os.path.exists(OUTPUT_GLB):
        size_kb = os.path.getsize(OUTPUT_GLB) / 1024
        print(f"SUCCESS: {OUTPUT_GLB} ({size_kb:.1f} KB)")
    else:
        print("ERROR: Output file not created.")
        sys.exit(1)


ensure_sourceio()
clear_scene()
enable_sourceio()
import_mdl()
export_glb()
