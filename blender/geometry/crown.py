"""
Crown/Topper Generation Module

Creates decorative crown or topper elements for the shelf.
"""

import bpy
import bmesh
from mathutils import Vector
import math


def create_crown_topper(name="Crown", width=2.2, height=0.15, depth=0.1):
    """
    Create a decorative crown/topper for the shelf.
    
    Args:
        name (str): Name for the crown object
        width (float): Width of the crown
        height (float): Height of the crown
        depth (float): Depth of the crown
        
    Returns:
        bpy.types.Object: The created crown object
    """
    # Create mesh
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    obj = bpy.data.objects.new(name, mesh)
    
    # Add to scene
    bpy.context.collection.objects.link(obj)
    
    # Create bmesh
    bm = bmesh.new()
    
    # Create cylindrical ovoid base
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=1.0)
    
    # Scale to crown dimensions (flatten to ovoid)
    bmesh.ops.scale(bm,
                   vec=(width, depth, height),
                   verts=bm.verts)
    
    # Update mesh
    bm.to_mesh(mesh)
    bm.free()
    
    return obj


def create_decorative_molding(name="Molding", width=2.1, segments=8):
    """
    Create decorative molding for the crown.
    
    Args:
        name (str): Name for the molding object
        width (float): Width of the molding
        segments (int): Number of decorative segments
        
    Returns:
        bpy.types.Object: The created molding object
    """
    # Create mesh
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    obj = bpy.data.objects.new(name, mesh)
    
    # Add to scene
    bpy.context.collection.objects.link(obj)
    
    # Create bmesh
    bm = bmesh.new()
    
    # Create base cube for molding
    bmesh.ops.create_cube(bm, size=1.0)
    
    # Scale to molding dimensions
    bmesh.ops.scale(bm,
                   vec=(width, 0.05, 0.03),
                   verts=bm.verts)
    
    # Add decorative cuts/details using subdivide and inset
    bmesh.ops.subdivide_edges(bm,
                             edges=bm.edges[:],
                             cuts=segments,
                             use_grid_fill=True)
    
    # Update mesh
    bm.to_mesh(mesh)
    bm.free()
    
    return obj


def position_crown_above_backing(crown_obj, backing_obj, height_offset=0.1):
    """
    Position crown centered on top of the backing.
    
    Args:
        crown_obj (bpy.types.Object): The crown object
        backing_obj (bpy.types.Object): The backing object
        height_offset (float): Height above the backing
    """
    # Position crown centered on top of backing
    crown_obj.location.x = backing_obj.location.x
    crown_obj.location.y = backing_obj.location.y
    crown_obj.location.z = backing_obj.location.z + backing_obj.dimensions.z/2 + height_offset


def add_crown_material(obj, color=(0.4, 0.4, 0.4, 1.0)):
    """
    Add a gray material to the crown object.
    
    Args:
        obj (bpy.types.Object): The crown object
        color (tuple): RGBA color values (default: dark gray)
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
            # Set base color (darker wood tone)
            bsdf_node.inputs['Base Color'].default_value = color
            # Set roughness
            bsdf_node.inputs['Roughness'].default_value = 0.6
            # Add some metallic for decorative effect
            bsdf_node.inputs['Metallic'].default_value = 0.1
    
    # Assign material to object
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
