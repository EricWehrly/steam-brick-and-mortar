"""
Converts Source 1 .mdl files to .glb via SourceIO inside Blender (headless).

Usage (via Docker from project root):

  Single model (explicit path inside the container):
    MSYS_NO_PATHCONV=1 docker compose run --rm blender blender --background \\
        --python /app/desktop/scripts/source-extract/convert_mdl.py -- --mdl models/props/turret_01.mdl

  Batch from manifest:
    MSYS_NO_PATHCONV=1 docker compose run --rm blender blender --background \\
        --python /app/desktop/scripts/source-extract/convert_mdl.py -- \\
        --manifest /app/desktop/scripts/source-extract/portal2-manifest.json

  Default (backwards compat — converts companion cube):
    MSYS_NO_PATHCONV=1 docker compose run --rm blender blender --background \\
        --python /app/desktop/scripts/source-extract/convert_mdl.py

Volume layout (project root mounted at /app):
    /app/blender/addons/SourceIO.zip   committed zip; auto-extracted on first run
    /app/desktop/extracted/            VPK extraction output (model + material files)
    /app/desktop/output/               converted .glb files land here
"""
import math
import os
import sys
import json
import zipfile

import bpy

EXTRACTED_DIR = '/app/desktop/extracted'
OUTPUT_DIR    = '/app/desktop/output'
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
    bpy.ops.preferences.addon_refresh()
    result = bpy.ops.preferences.addon_enable(module='SourceIO')
    print(f"  addon_enable: {result}")
    if 'SourceIO' not in bpy.context.preferences.addons:
        print("ERROR: SourceIO not active — is blender/addons/SourceIO/ present?")
        sys.exit(1)
    print("SourceIO active.")


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_mdl(mdl_path):
    print(f"Importing: {mdl_path}")
    if not os.path.exists(mdl_path):
        print(f"ERROR: not found: {mdl_path}")
        return False

    mdl_dir = os.path.dirname(mdl_path) + '/'
    mdl_name = os.path.basename(mdl_path)
    # Must pass directory + files — self.files is empty without Blender's file browser
    result = bpy.ops.sourceio.mdl(
        filepath=mdl_path,
        directory=mdl_dir,
        files=[{'name': mdl_name}],
        discover_resources=True,
    )
    print(f"  import: {result}")

    objects = list(bpy.data.objects)
    if not objects:
        print("ERROR: no objects after import")
        return False

    for obj in objects:
        if obj.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(obj)

    armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    actions = list(bpy.data.actions)
    print(f"  armatures: {len(armatures)}, actions: {len(actions)}")
    for a in actions:
        print(f"    action: {a.name}")

    return True


def apply_upright_rotation():
    # Source Engine uses Z-up; SourceIO preserves that, but GLTF is Y-up.
    # Blender's GLTF exporter handles the Z→Y conversion, but the import
    # orientation leaves models lying on their back in Three.js. Rotating
    # root objects +90° on X here bakes the correction into the GLB.
    for obj in bpy.data.objects:
        if obj.parent is None:
            obj.rotation_euler[0] += math.radians(90)


def export_glb(output_path):
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else OUTPUT_DIR, exist_ok=True)
    print(f"Exporting: {output_path}")
    result = bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_apply=True,
        use_selection=False,
        export_animations=True,
        export_anim_mode='ACTIONS',
    )
    print(f"  export: {result}")
    if not os.path.exists(output_path):
        print("ERROR: output not created")
        return False
    print(f"  OK ({os.path.getsize(output_path) / 1024:.1f} KB)")
    return True


def convert_one(mdl_rel, output_name):
    mdl_path = os.path.join(EXTRACTED_DIR, mdl_rel)
    output_path = os.path.join(OUTPUT_DIR, output_name)
    clear_scene()
    enable_sourceio()
    if not import_mdl(mdl_path):
        return False
    apply_upright_rotation()
    return export_glb(output_path)


def parse_args():
    argv = sys.argv
    script_end = argv.index('--') + 1 if '--' in argv else len(argv)
    argv = argv[script_end:]
    args = {}
    i = 0
    while i < len(argv):
        if argv[i] in ('--mdl', '--manifest') and i + 1 < len(argv):
            args[argv[i].lstrip('-')] = argv[i + 1]
            i += 2
        else:
            i += 1
    return args


def main():
    args = parse_args()
    ensure_sourceio()

    if 'manifest' in args:
        with open(args['manifest']) as f:
            manifest = json.load(f)

        ok, fail, skip = [], [], []
        for asset in manifest['assets']:
            status = asset.get('status', 'pending')
            if status not in ('pending', 'extracted', None):
                skip.append(asset['name'])
                print(f"skip [{status}]: {asset['name']}")
                continue
            if not asset.get('mdl'):
                skip.append(asset['name'])
                continue

            print(f"\n{'='*60}\nConverting: {asset['name']}")
            if convert_one(asset['mdl'], asset['output']):
                ok.append(asset['name'])
            else:
                fail.append(asset['name'])

        print(f"\n{'='*60}")
        print(f"ok={ok}")
        print(f"fail={fail}")
        print(f"skip={skip}")

    elif 'mdl' in args:
        mdl_rel = args['mdl']
        output_name = os.path.basename(mdl_rel).replace('.mdl', '.glb')
        convert_one(mdl_rel, output_name)

    else:
        convert_one('models/props/metal_box.mdl', 'companion_cube.glb')


main()
