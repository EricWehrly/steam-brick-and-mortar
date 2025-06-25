"""
Utilities Module

Common utility functions for Blender shelf generation.
"""

import bpy
import bmesh


def clear_scene():
    """Clear all objects from the current scene."""
    # Select all objects
    bpy.ops.object.select_all(action='SELECT')
    
    # Delete all selected objects
    bpy.ops.object.delete(use_global=False)


def setup_scene():
    """Set up the scene for shelf generation."""
    # Clear existing objects
    clear_scene()
    
    # Set units to metric
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    
    # Set up camera and lighting (basic setup)
    # Add camera
    bpy.ops.object.camera_add(location=(3, -3, 2))
    camera = bpy.context.active_object
    camera.rotation_euler = (1.1, 0, 0.785)  # Point at origin
    
    # Add light
    bpy.ops.object.light_add(type='SUN', location=(2, 2, 5))
    light = bpy.context.active_object
    light.data.energy = 5.0


def export_shelf_assembly(objects, filepath, file_format='FBX'):
    """
    Export shelf assembly to file.
    
    Args:
        objects (list): List of objects to export
        filepath (str): Export file path
        file_format (str): Export format ('FBX', 'OBJ', 'GLTF')
    """
    # Select objects for export
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    
    # Export based on format
    if file_format.upper() == 'FBX':
        bpy.ops.export_scene.fbx(
            filepath=filepath,
            use_selection=True,
            global_scale=1.0
        )
    elif file_format.upper() == 'OBJ':
        bpy.ops.export_scene.obj(
            filepath=filepath,
            use_selection=True,
            global_scale=1.0
        )
    elif file_format.upper() == 'GLTF':
        bpy.ops.export_scene.gltf(
            filepath=filepath,
            use_selection=True
        )
    else:
        raise ValueError(f"Unsupported export format: {file_format}")


def create_collection(name="ShelfAssembly"):
    """
    Create a collection for organizing shelf objects.
    
    Args:
        name (str): Name of the collection
        
    Returns:
        bpy.types.Collection: The created collection
    """
    # Create new collection
    collection = bpy.data.collections.new(name)
    
    # Link to scene
    bpy.context.scene.collection.children.link(collection)
    
    return collection


def move_objects_to_collection(objects, collection):
    """
    Move objects to a specific collection.
    
    Args:
        objects (list): List of objects to move
        collection (bpy.types.Collection): Target collection
    """
    for obj in objects:
        # Remove from current collections
        for coll in obj.users_collection:
            coll.objects.unlink(obj)
        
        # Add to target collection
        collection.objects.link(obj)
