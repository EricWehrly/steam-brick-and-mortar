"""
Backing and Pegboard Generation Module

Creates the backing plane/pegboard behind the shelf.
"""

import bpy
import bmesh
from mathutils import Vector
import math


def create_backing_plane(name="Backing", width=2.2, height=1.5, thickness=0.02):
    """
    Create a backing plane behind the shelf.
    
    Args:
        name (str): Name for the backing object
        width (float): Width of the backing
        height (float): Height of the backing
        thickness (float): Thickness of the backing
        
    Returns:
        bpy.types.Object: The created backing object
    """
    # Create mesh
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    obj = bpy.data.objects.new(name, mesh)
    
    # Add to scene
    bpy.context.collection.objects.link(obj)
    
    # Create bmesh
    bm = bmesh.new()
    
    # Create plane
    bmesh.ops.create_cube(bm, size=1.0)
    
    # Scale to backing dimensions
    bmesh.ops.scale(bm,
                   vec=(width, thickness, height),
                   verts=bm.verts)
    
    # Update mesh
    bm.to_mesh(mesh)
    bm.free()
    
    return obj


def create_pegboard_holes(backing_obj, hole_spacing=0.1, hole_diameter=0.01):
    """
    Add pegboard holes to a backing plane.
    
    Args:
        backing_obj (bpy.types.Object): The backing plane object
        hole_spacing (float): Distance between holes
        hole_diameter (float): Diameter of each hole
    """
    # Get backing dimensions
    width = backing_obj.dimensions.x
    height = backing_obj.dimensions.z
    
    # Calculate hole grid
    holes_x = int(width / hole_spacing)
    holes_z = int(height / hole_spacing)
    
    # Set backing as active object
    bpy.context.view_layer.objects.active = backing_obj
    backing_obj.select_set(True)
    
    # Enter edit mode
    bpy.ops.object.mode_set(mode='EDIT')
    
    # Create bmesh from mesh
    bm = bmesh.from_edit_mesh(backing_obj.data)
    
    # Add holes using inset and extrude
    for i in range(holes_x):
        for j in range(holes_z):
            # Calculate hole position
            x = (i / holes_x - 0.5) * width * 0.9
            z = (j / holes_z - 0.5) * height * 0.9
            
            # Create small circular cut (simplified as square for now)
            # This would require more complex geometry operations for true circles
            pass  # Placeholder for hole creation logic
    
    # Update mesh
    bmesh.update_edit_mesh(backing_obj.data)
    
    # Exit edit mode
    bpy.ops.object.mode_set(mode='OBJECT')


def position_backing_behind_shelf(backing_obj, shelf_obj, offset=0.01):
    """
    Position backing plane behind the shelf (more flush).
    
    Args:
        backing_obj (bpy.types.Object): The backing object
        shelf_obj (bpy.types.Object): The shelf object
        offset (float): Small distance behind the shelf for clearance
    """
    # Position backing very close behind shelf
    backing_obj.location.x = shelf_obj.location.x
    backing_obj.location.y = shelf_obj.location.y - shelf_obj.dimensions.y/2 - offset
    backing_obj.location.z = shelf_obj.location.z


def add_backing_material(obj, color=(0.7, 0.65, 0.55, 1.0)):
    """
    Add a darkish beige material to the backing object.
    
    Args:
        obj (bpy.types.Object): The backing object
        color (tuple): RGBA color values (default: darkish beige)
    """
    # Create material
    mat = bpy.data.materials.new(name=f"{obj.name}_Material")
    mat.use_nodes = True
    
    # Get the material output node
    output_node = mat.node_tree.nodes.get('Material Output')
    if output_node:
        # Get or create principled BSDF
        bsdf_node = mat.node_tree.nodes.get('Principled BSDF')
        if bsdf_node:
            # Set base color
            bsdf_node.inputs['Base Color'].default_value = color
            # Set roughness
            bsdf_node.inputs['Roughness'].default_value = 0.8
    
    # Assign material to object
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
