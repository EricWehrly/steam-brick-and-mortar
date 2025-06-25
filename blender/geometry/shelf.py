"""
Shelf Geometry Generation Module

Creates the main rectangular shelf structure with proper dimensions and materials.
"""

import bpy
import bmesh
from mathutils import Vector


def create_main_shelf(name="MainShelf", width=2.0, height=0.1, depth=0.4):
    """
    Create the main rectangular shelf body.
    
    Args:
        name (str): Name for the shelf object
        width (float): Width of the shelf in Blender units
        height (float): Height (thickness) of the shelf
        depth (float): Depth of the shelf
        
    Returns:
        bpy.types.Object: The created shelf object
    """
    # Create mesh
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    obj = bpy.data.objects.new(name, mesh)
    
    # Add to scene
    bpy.context.collection.objects.link(obj)
    
    # Create bmesh
    bm = bmesh.new()
    
    # Create cube
    bmesh.ops.create_cube(bm, size=1.0)
    
    # Scale to desired dimensions
    bmesh.ops.scale(bm, 
                   vec=(width, depth, height),
                   verts=bm.verts)
    
    # Update mesh
    bm.to_mesh(mesh)
    bm.free()
    
    # Set object as active
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    
    return obj


def add_shelf_material(obj, color=(0.8, 0.6, 0.4, 1.0)):
    """
    Add a wood-like material to the shelf.
    
    Args:
        obj (bpy.types.Object): The shelf object
        color (tuple): RGBA color values
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
            # Set roughness for wood-like appearance
            bsdf_node.inputs['Roughness'].default_value = 0.7
    
    # Assign material to object
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
