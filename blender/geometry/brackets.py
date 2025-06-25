"""
Bracket Support Generation Module

Creates triangular bracket supports for the shelf.
"""

import bpy
import bmesh
from mathutils import Vector


def create_bracket_support(name="Bracket", length=0.6, height=0.3, thickness=0.1):
    """
    Create a triangular bracket support.
    
    Args:
        name (str): Name for the bracket object
        length (float): Length of the bracket (X dimension)
        height (float): Height of the bracket (Z dimension)
        thickness (float): Thickness of the bracket (Y dimension)
        
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
    
    # Create triangle vertices (flipped upside down for support)
    verts = [
        bm.verts.new((0, 0, 0)),           # Top corner (at backing)
        bm.verts.new((length, 0, 0)),     # Top right corner  
        bm.verts.new((0, 0, -height))     # Bottom corner (hanging down)
    ]
    
    # Ensure face index validity
    bm.verts.ensure_lookup_table()
    
    # Create face
    face = bm.faces.new(verts)
    
    # Extrude to create thickness
    extruded = bmesh.ops.extrude_face_region(bm, geom=[face])
    # Get the extruded vertices
    extruded_verts = [v for v in extruded['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm,
                       vec=(0, thickness, 0),
                       verts=extruded_verts)
    
    # Update mesh
    bm.to_mesh(mesh)
    bm.free()
    
    # Set object as active
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    
    return obj


def position_brackets_on_shelf(shelf_obj, bracket_count=2):
    """
    Create and position bracket supports under a shelf to fill the triangular
    support space between the backing and shelf bottom.
    
    Args:
        shelf_obj (bpy.types.Object): The main shelf object
        bracket_count (int): Number of brackets to create
        
    Returns:
        list: List of created bracket objects
    """
    brackets = []
    shelf_width = shelf_obj.dimensions.x
    shelf_depth = shelf_obj.dimensions.y
    shelf_height = shelf_obj.dimensions.z
    
    for i in range(bracket_count):
        # Calculate position along shelf width
        if bracket_count == 1:
            x_pos = 0
        else:
            x_pos = (i / (bracket_count - 1) - 0.5) * (shelf_width * 0.8)
        
        # Create bracket sized to fill support triangle
        bracket_height = min(shelf_depth * 0.8, shelf_height * 3)  # Scale appropriately
        bracket_length = bracket_height * 2  # Twice as long as tall
        bracket = create_bracket_support(f"Bracket_{i+1}", length=bracket_length, height=bracket_height)
        
        # Position to touch backing and support shelf bottom
        # X: Along shelf width
        bracket.location.x = shelf_obj.location.x + x_pos
        
        # Y: Against the backing (shelf back edge minus small offset for bracket thickness)
        bracket.location.y = shelf_obj.location.y - (shelf_depth * 0.5) + 0.03
        
        # Z: Position so the top of the upside-down triangle touches the shelf bottom
        bracket.location.z = shelf_obj.location.z - (shelf_height * 0.5)
        
        # Rotate bracket to slope down from backing to shelf support
        # Rotate around X-axis to make it slope down toward front
        bracket.rotation_euler.z = 1.5555  # About 17 degrees downward slope
        
        brackets.append(bracket)
    
    return brackets


def add_bracket_material(bracket_obj, color=(0.5, 0.5, 0.5, 1.0)):
    """
    Add material to a bracket object.
    
    Args:
        bracket_obj (bpy.types.Object): The bracket object
        color (tuple): RGBA color values
    """
    # Create material
    mat = bpy.data.materials.new(name=f"{bracket_obj.name}_Material")
    mat.use_nodes = True
    
    # Get the principled BSDF node
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs[0].default_value = color  # Base Color
    bsdf.inputs[7].default_value = 0.3    # Roughness
    bsdf.inputs[12].default_value = 0.1   # Specular
    
    # Assign material to object
    bracket_obj.data.materials.append(mat)
