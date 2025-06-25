"""
Bracket Support Generation Module

Creates triangular bracket supports for the shelf.
"""

import bpy
import bmesh
from mathutils import Vector


def create_bracket_support(name="Bracket", size=0.3, thickness=0.05):
    """
    Create a triangular bracket support.
    
    Args:
        name (str): Name for the bracket object
        size (float): Size of the triangular bracket
        thickness (float): Thickness of the bracket
        
    Returns:
        bpy.types.Object: The created bracket object
    """
    # Create mesh
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    obj = bpy.data.objects.new(name, mesh)
    
    # Add to scene
    bpy.context.collection.objects.link(obj)
    
    # Create bmesh
    bm = bmesh.new()
    
    # Create triangle vertices
    verts = [
        bm.verts.new((0, 0, 0)),           # Bottom corner
        bm.verts.new((size, 0, 0)),       # Right corner  
        bm.verts.new((0, 0, size))        # Top corner
    ]
    
    # Ensure face index validity
    bm.verts.ensure_lookup_table()
    
    # Create face
    bm.faces.new(verts)
    
    # Extrude to create thickness
    bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    bmesh.ops.translate(bm,
                       vec=(0, thickness, 0),
                       verts=[v for v in bm.verts if v.select])
    
    # Update mesh
    bm.to_mesh(mesh)
    bm.free()
    
    # Set object as active
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    
    return obj


def position_brackets_on_shelf(shelf_obj, bracket_count=2):
    """
    Create and position bracket supports under a shelf.
    
    Args:
        shelf_obj (bpy.types.Object): The main shelf object
        bracket_count (int): Number of brackets to create
        
    Returns:
        list: List of created bracket objects
    """
    brackets = []
    shelf_width = shelf_obj.dimensions.x
    
    for i in range(bracket_count):
        # Calculate position along shelf
        if bracket_count == 1:
            x_pos = 0
        else:
            x_pos = (i / (bracket_count - 1) - 0.5) * (shelf_width * 0.8)
        
        # Create bracket
        bracket = create_bracket_support(f"Bracket_{i+1}")
        
        # Position under shelf
        bracket.location.x = shelf_obj.location.x + x_pos
        bracket.location.y = shelf_obj.location.y - shelf_obj.dimensions.y * 0.6
        bracket.location.z = shelf_obj.location.z - shelf_obj.dimensions.z * 0.5
        
        brackets.append(bracket)
    
    return brackets
