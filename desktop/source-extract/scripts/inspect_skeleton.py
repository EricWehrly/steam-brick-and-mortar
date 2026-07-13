#!/usr/bin/env python3
"""
Inspect a GLB's node/bone hierarchy, skin bindings, and mesh structure.

Answers exactly the questions that matter before attempting to pose a model:
  - Is this a single continuous skinned mesh, or separate rigid pieces that
    will visually disconnect when bones are rotated?
  - What's the real bone hierarchy (parent/child), not just a flat name list?
  - Are there "helper"/"aim"/"piston" nodes floating outside the armature that
    carry zero skin weight (safe to ignore) vs. ones that actually deform the
    mesh (must be accounted for)?

Usage:
    python desktop/source-extract/scripts/inspect_skeleton.py <path-to.glb> [--max-depth N]

Example:
    python desktop/source-extract/scripts/inspect_skeleton.py desktop/source-extract/output/atlas.glb
"""
import struct
import json
import sys


def read_glb_json(path):
    with open(path, 'rb') as f:
        magic, version, length = struct.unpack('<4sII', f.read(12))
        chunk_len, chunk_type = struct.unpack('<II', f.read(8))
        data = f.read(chunk_len)
        return json.loads(data)


def build_child_of(nodes):
    child_of = set()
    for n in nodes:
        for c in n.get('children', []):
            child_of.add(c)
    return child_of


def print_tree(nodes, idx, depth=0, max_depth=10):
    n = nodes[idx]
    name = n.get('name', f'(unnamed #{idx})')
    t = n.get('translation', [0, 0, 0])
    mesh_tag = f'  [MESH #{n["mesh"]}]' if 'mesh' in n else ''
    print('  ' * depth + f'{name}  t={[round(x, 3) for x in t]}{mesh_tag}')
    if depth >= max_depth:
        if n.get('children'):
            print('  ' * (depth + 1) + f'... ({len(n["children"])} more children, truncated at max-depth)')
        return
    for c in n.get('children', []):
        print_tree(nodes, c, depth + 1, max_depth)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)

    path = sys.argv[1]
    max_depth = 10
    if '--max-depth' in sys.argv:
        max_depth = int(sys.argv[sys.argv.index('--max-depth') + 1])

    gltf = read_glb_json(path)
    nodes = gltf.get('nodes', [])
    meshes = gltf.get('meshes', [])
    skins = gltf.get('skins', [])

    print(f'=== {path} ===')
    print(f'nodes: {len(nodes)}   meshes: {len(meshes)}   skins: {len(skins)}')

    mesh_nodes = [(i, n['name']) for i, n in enumerate(nodes) if 'mesh' in n]
    print(f'\nnodes carrying geometry ({len(mesh_nodes)}):')
    for i, name in mesh_nodes:
        print(f'  node[{i}] "{name}"')
    if len(mesh_nodes) > 1:
        print('  WARNING: multiple mesh nodes - separate rigid pieces may visually')
        print('  disconnect from each other when bones are reposed. Check which')
        print('  piece each is parented under before posing.')

    if skins:
        skin = skins[0]
        joint_idx = set(skin.get('joints', []))
        print(f'\nskin[0]: {len(joint_idx)} joints')

        child_of = build_child_of(nodes)
        top_level = [i for i in range(len(nodes)) if i not in child_of]
        orphaned_joints = [nodes[i]['name'] for i in top_level if i in joint_idx]
        orphaned_non_joints = [nodes[i]['name'] for i in top_level if i not in joint_idx]

        if orphaned_joints:
            print(f'  WARNING: {len(orphaned_joints)} top-level nodes ARE real skin joints '
                  f'(they DO deform the mesh) but have no parent in the hierarchy - reposing '
                  f'the main chain will NOT move these, likely causing visible tearing:')
            print(f'    {orphaned_joints}')
        if orphaned_non_joints:
            print(f'  {len(orphaned_non_joints)} top-level nodes are NOT skin joints - inert, '
                  f'safe to ignore for posing purposes (decorative/attachment markers):')
            print(f'    {orphaned_non_joints}')

        print(f'\nbone tree(s) (max depth {max_depth}):')
        for i in top_level:
            print_tree(nodes, i, max_depth=max_depth)
            print()
    else:
        print('\nNo skin found - this GLB has no armature/bones.')


if __name__ == '__main__':
    main()
