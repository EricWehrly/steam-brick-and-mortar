#!/usr/bin/env python3
"""
Blender Script: Generate Blockbuster-Style Video Store Shelf
===============================================

This script procedurally generates a 3D model of a video store shelf
similar to those found in Blockbuster stores. The shelf includes:
- Main shelf structure (rectangular frame)
- Support brackets (triangular prisms) 
- Backing panel with optional pegboard pattern
- Crown molding (cylindrical ovoid top piece)

Usage:
    blender --background --python gen_shelf.py
    
    Or with arguments:
    blender --background --python gen_shelf.py -- --width 2.0 --height 0.3 --depth 0.4

Author: SteamVR Blockbuster Shelf Project
"""

import bpy
import bmesh
import mathutils
from mathutils import Vector
import os
import sys
import argparse
import json


def clear_scene():
    """Remove all mesh objects from the scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False, confirm=False)
    
    # Clear mesh data that might be left behind
    for mesh in bpy.data.meshes:
        bpy.data.meshes.remove(mesh, do_unlink=True)


def create_shelf_base(width=2.0, height=0.3, depth=0.4, thickness=0.05):
    """
    Create the main shelf structure as a hollow rectangular frame.
    
    Args:
        width (float): Shelf width in meters
        height (float): Shelf height in meters  
        depth (float): Shelf depth in meters
        thickness (float): Material thickness in meters
    
    Returns:
        bpy.types.Object: The created shelf object
    """
    print(f"Creating shelf base: {width}x{height}x{depth}m, thickness {thickness}m")
    
    # Create a box and make it hollow
    bpy.ops.mesh.primitive_cube_add(size=1)
    shelf = bpy.context.active_object
    shelf.name = "ShelfBase"
    
    # Scale to desired dimensions
    shelf.scale = (width, depth, height)
    bpy.ops.object.transform_apply(transform=True, location=True, rotation=True, scale=True)
    
    # Enter edit mode to create hollow interior
    bpy.context.view_layer.objects.active = shelf
    bpy.ops.object.mode_set(mode='EDIT')
    
    # Inset faces to create thickness
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.inset_faces(thickness=thickness)
    
    # Select inner faces and delete them to make hollow
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.mesh.select_face_by_sides(number=4, type='EQUAL')
    
    # Switch to face select mode and select inner faces
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)
    
    # Extrude inward and delete to create hollow effect
    bpy.ops.mesh.extrude_region_move(
        MESH_OT_extrude_region={"use_normal_flip":False, "mirror":False},
        TRANSFORM_OT_translate={"value":(0, 0, -thickness*2)}
    )
    bpy.ops.mesh.delete(type='FACE')
    
    bpy.ops.object.mode_set(mode='OBJECT')
    
    return shelf


def create_support_bracket(width=0.15, height=0.2, depth=0.3):
    """
    Create triangular support brackets for the shelf.
    
    Args:
        width (float): Bracket width in meters
        height (float): Bracket height in meters
        depth (float): Bracket depth in meters
    
    Returns:
        bpy.types.Object: The created bracket object
    """
    print(f"Creating support bracket: {width}x{height}x{depth}m")
    
    # Create custom mesh for triangular bracket
    mesh = bpy.data.meshes.new("BracketMesh")
    obj = bpy.data.objects.new("SupportBracket", mesh)
    bpy.context.collection.objects.link(obj)
    
    # Define vertices for a triangular prism
    vertices = [
        # Front triangle
        (0, 0, 0),           # bottom left
        (width, 0, 0),       # bottom right  
        (width, 0, height),  # top right
        # Back triangle
        (0, depth, 0),       # bottom left back
        (width, depth, 0),   # bottom right back
        (width, depth, height) # top right back
    ]
    
    # Define faces (triangular prism)
    faces = [
        (0, 1, 2),        # front triangle
        (3, 5, 4),        # back triangle (flipped)
        (0, 3, 4, 1),     # bottom face
        (1, 4, 5, 2),     # right face  
        (0, 2, 5, 3),     # hypotenuse face
    ]
    
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    
    return obj


def create_backing_panel(width=2.0, height=1.5, thickness=0.02, pegboard=False):
    """
    Create a backing panel, optionally with pegboard holes.
    
    Args:
        width (float): Panel width in meters
        height (float): Panel height in meters
        thickness (float): Panel thickness in meters
        pegboard (bool): Whether to add pegboard holes
    
    Returns:
        bpy.types.Object: The created backing panel object
    """
    print(f"Creating backing panel: {width}x{height}x{thickness}m, pegboard={pegboard}")
    
    bpy.ops.mesh.primitive_cube_add(size=1)
    panel = bpy.context.active_object
    panel.name = "BackingPanel"
    
    # Scale to panel dimensions
    panel.scale = (width, thickness, height)
    bpy.ops.object.transform_apply(transform=True, location=True, rotation=True, scale=True)
    
    if pegboard:
        # Add pegboard holes using array modifier and boolean operations
        # For performance, we'll create a simple pattern
        
        # Create a small cylinder for the hole pattern
        bpy.ops.mesh.primitive_cylinder_add(radius=0.01, depth=thickness*2)
        hole = bpy.context.active_object
        hole.name = "PegboardHole"
        
        # Position the hole
        hole.location = (-width/2 + 0.1, 0, -height/2 + 0.1)
        
        # Array modifier for X direction
        array_x = hole.modifiers.new(name="ArrayX", type='ARRAY')
        array_x.count = int(width / 0.05)  # 5cm spacing
        array_x.relative_offset_displace = (0.05/width*2, 0, 0)
        
        # Array modifier for Z direction  
        array_z = hole.modifiers.new(name="ArrayZ", type='ARRAY')
        array_z.count = int(height / 0.05)  # 5cm spacing
        array_z.relative_offset_displace = (0, 0, 0.05/height*2)
        
        # Apply modifiers
        bpy.context.view_layer.objects.active = hole
        bpy.ops.object.modifier_apply(modifier="ArrayX")
        bpy.ops.object.modifier_apply(modifier="ArrayZ")
        
        # Boolean subtract holes from panel
        bool_mod = panel.modifiers.new(name="Boolean", type='BOOLEAN')
        bool_mod.operation = 'DIFFERENCE'
        bool_mod.object = hole
        
        bpy.context.view_layer.objects.active = panel
        bpy.ops.object.modifier_apply(modifier="Boolean")
        
        # Clean up hole object
        bpy.data.objects.remove(hole, do_unlink=True)
    
    return panel


def create_crown_molding(width=2.0, radius=0.08, segments=16):
    """
    Create cylindrical crown molding for the top of the shelf.
    
    Args:
        width (float): Molding length in meters
        radius (float): Molding radius in meters
        segments (int): Number of segments for cylinder
    
    Returns:
        bpy.types.Object: The created crown molding object
    """
    print(f"Creating crown molding: {width}m long, radius {radius}m")
    
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, 
        depth=width,
        vertices=segments
    )
    crown = bpy.context.active_object
    crown.name = "CrownMolding"
    
    # Rotate to align with shelf width
    crown.rotation_euler = (0, 1.5708, 0)  # 90 degrees in Y
    bpy.ops.object.transform_apply(transform=True, location=True, rotation=True, scale=True)
    
    return crown


def position_components(shelf, brackets, backing, crown, shelf_width, shelf_height, shelf_depth):
    """
    Position all components relative to each other.
    
    Args:
        shelf: Main shelf object
        brackets: List of bracket objects
        backing: Backing panel object
        crown: Crown molding object
        shelf_width, shelf_height, shelf_depth: Shelf dimensions
    """
    print("Positioning shelf components...")
    
    # Position backing panel behind shelf
    backing.location = (0, -shelf_depth/2 - 0.01, shelf_height/2)
    
    # Position brackets under shelf at corners
    bracket_spacing = shelf_width * 0.4  # 40% from center
    for i, bracket in enumerate(brackets):
        x_pos = bracket_spacing if i % 2 == 0 else -bracket_spacing
        bracket.location = (x_pos, 0, -shelf_height/2 - 0.1)
    
    # Position crown molding on top
    crown.location = (0, 0, shelf_height/2 + 0.08)


def setup_materials():
    """Create and assign materials for realistic appearance."""
    print("Setting up materials...")
    
    # Wood material for shelf and brackets
    wood_mat = bpy.data.materials.new(name="Wood")
    wood_mat.use_nodes = True
    nodes = wood_mat.node_tree.nodes
    nodes.clear()
    
    # Create principled BSDF node
    bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
    bsdf.inputs[0].default_value = (0.6, 0.4, 0.2, 1.0)  # Brown wood color
    bsdf.inputs[7].default_value = 0.3  # Roughness
    
    # Create output node
    output = nodes.new(type='ShaderNodeOutputMaterial')
    wood_mat.node_tree.links.new(bsdf.outputs[0], output.inputs[0])
    
    # Metal material for brackets
    metal_mat = bpy.data.materials.new(name="Metal")
    metal_mat.use_nodes = True
    nodes = metal_mat.node_tree.nodes
    nodes.clear()
    
    bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
    bsdf.inputs[0].default_value = (0.7, 0.7, 0.7, 1.0)  # Gray metal
    bsdf.inputs[4].default_value = 1.0  # Metallic
    bsdf.inputs[7].default_value = 0.1  # Low roughness
    
    output = nodes.new(type='ShaderNodeOutputMaterial')
    metal_mat.node_tree.links.new(bsdf.outputs[0], output.inputs[0])
    
    return wood_mat, metal_mat


def export_shelf(export_path="/app/output", export_format="FBX"):
    """
    Export the generated shelf to specified format.
    
    Args:
        export_path (str): Directory to export to
        export_format (str): Export format (FBX, OBJ, PLY)
    """
    print(f"Exporting shelf to {export_path} as {export_format}")
    
    # Ensure output directory exists
    os.makedirs(export_path, exist_ok=True)
    
    # Select all objects
    bpy.ops.object.select_all(action='SELECT')
    
    filepath = os.path.join(export_path, f"blockbuster_shelf.{export_format.lower()}")
    
    if export_format.upper() == "FBX":
        bpy.ops.export_scene.fbx(
            filepath=filepath,
            use_selection=True,
            global_scale=1.0,
            apply_unit_scale=True
        )
    elif export_format.upper() == "OBJ":
        bpy.ops.export_scene.obj(
            filepath=filepath,
            use_selection=True,
            global_scale=1.0
        )
    elif export_format.upper() == "PLY":
        bpy.ops.export_mesh.ply(
            filepath=filepath,
            use_selection=True
        )
    
    print(f"Shelf exported to: {filepath}")


def save_generation_info(export_path="/app/output", **kwargs):
    """Save information about the generated shelf to JSON."""
    info = {
        "description": "Procedurally generated Blockbuster-style video store shelf",
        "generator": "Blender Python Script",
        "timestamp": bpy.context.scene.frame_current,
        "parameters": kwargs,
        "components": [
            "ShelfBase",
            "SupportBrackets", 
            "BackingPanel",
            "CrownMolding"
        ]
    }
    
    info_path = os.path.join(export_path, "shelf_info.json")
    with open(info_path, 'w') as f:
        json.dump(info, f, indent=2)
    
    print(f"Generation info saved to: {info_path}")


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='Generate Blockbuster-style shelf')
    parser.add_argument('--width', type=float, default=2.0, help='Shelf width in meters')
    parser.add_argument('--height', type=float, default=0.3, help='Shelf height in meters')
    parser.add_argument('--depth', type=float, default=0.4, help='Shelf depth in meters')
    parser.add_argument('--backing-height', type=float, default=1.5, help='Backing panel height')
    parser.add_argument('--pegboard', action='store_true', help='Add pegboard holes to backing')
    parser.add_argument('--export-format', default='FBX', choices=['FBX', 'OBJ', 'PLY'])
    parser.add_argument('--export-path', default='/app/output', help='Export directory')
    parser.add_argument('--no-materials', action='store_true', help='Skip material setup')
    
    # Parse args from sys.argv, handling Blender's argument passing
    if '--' in sys.argv:
        argv = sys.argv[sys.argv.index('--') + 1:]
    else:
        argv = []
    
    return parser.parse_args(argv)


def main():
    """Main function to generate the shelf."""
    print("=== Blender Blockbuster Shelf Generator ===")
    
    # Parse arguments
    args = parse_arguments()
    
    print(f"Generating shelf with dimensions: {args.width}x{args.height}x{args.depth}m")
    
    # Clear existing scene
    clear_scene()
    
    # Create main components
    shelf = create_shelf_base(args.width, args.height, args.depth)
    
    # Create multiple support brackets
    brackets = []
    for i in range(4):  # 4 brackets for stability
        bracket = create_support_bracket()
        brackets.append(bracket)
    
    # Create backing panel
    backing = create_backing_panel(
        args.width, 
        args.backing_height,
        pegboard=args.pegboard
    )
    
    # Create crown molding
    crown = create_crown_molding(args.width)
    
    # Position everything
    position_components(shelf, brackets, backing, crown, args.width, args.height, args.depth)
    
    # Setup materials unless disabled
    if not args.no_materials:
        wood_mat, metal_mat = setup_materials()
        
        # Assign materials
        shelf.data.materials.append(wood_mat)
        backing.data.materials.append(wood_mat)
        crown.data.materials.append(wood_mat)
        
        for bracket in brackets:
            bracket.data.materials.append(metal_mat)
    
    # Export the shelf
    export_shelf(args.export_path, args.export_format)
    
    # Save generation information
    save_generation_info(
        args.export_path,
        width=args.width,
        height=args.height,
        depth=args.depth,
        backing_height=args.backing_height,
        pegboard=args.pegboard,
        export_format=args.export_format
    )
    
    print("=== Shelf generation complete! ===")


if __name__ == "__main__":
    main()
