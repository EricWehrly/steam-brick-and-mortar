#!/usr/bin/env python3
"""
Blender Shelf Generation Script

Procedurally generates a 3D blockbuster-style shelf assembly for SteamVR environments.
This script orchestrates the creation of all shelf components using modular geometry modules.
"""

import sys
import os

# Add blender directory to Python path for module imports
blender_dir = os.path.dirname(os.path.abspath(__file__))
if blender_dir not in sys.path:
    sys.path.append(blender_dir)

try:
    import bpy
    from utils.scene_utils import setup_scene, create_collection, move_objects_to_collection, export_shelf_assembly
    from geometry.shelf import create_main_shelf, add_shelf_material
    from geometry.brackets import create_bracket_support, position_brackets_on_shelf, add_bracket_material
    from geometry.backing import create_backing_plane, position_backing_behind_shelf, add_backing_material
    from geometry.crown import create_crown_topper, position_crown_above_backing, add_crown_material
except ImportError as e:
    print(f"Error importing Blender modules: {e}")
    print("This script must be run within Blender or with Blender's Python interpreter")
    sys.exit(1)


def generate_complete_shelf_assembly():
    """
    Generate a complete shelf assembly with all components.
    
    Returns:
        dict: Dictionary containing all created objects organized by component type
    """
    print("Starting shelf generation...")
    
    # Set up scene
    setup_scene()
    
    # Create collection for organization
    shelf_collection = create_collection("BlockbusterShelf")
    
    # Dictionary to store all created objects
    shelf_assembly = {
        'main_shelf': None,
        'brackets': [],
        'backing': None,
        'crown': None,
        'all_objects': []
    }
    
    # 1. Create main shelf (extended depth for better proportions)
    print("Creating main shelf...")
    main_shelf = create_main_shelf("MainShelf", width=2.0, height=0.1, depth=0.6)
    add_shelf_material(main_shelf, color=(0.5, 0.5, 0.5, 1.0))  # Gray color
    shelf_assembly['main_shelf'] = main_shelf
    shelf_assembly['all_objects'].append(main_shelf)
    
    # 2. Create bracket supports
    print("Creating bracket supports...")
    brackets = position_brackets_on_shelf(main_shelf, bracket_count=3)
    # Apply gray material to all brackets
    for bracket in brackets:
        add_bracket_material(bracket, color=(0.5, 0.5, 0.5, 1.0))
    shelf_assembly['brackets'] = brackets
    shelf_assembly['all_objects'].extend(brackets)
    
    # 3. Create backing plane
    print("Creating backing plane...")
    backing = create_backing_plane("Backing", width=2.2, height=1.5, thickness=0.02)
    position_backing_behind_shelf(backing, main_shelf, offset=0.01)  # More flush
    add_backing_material(backing, color=(0.7, 0.65, 0.55, 1.0))  # Darkish beige
    shelf_assembly['backing'] = backing
    shelf_assembly['all_objects'].append(backing)
    
    # 4. Create crown/topper (centered on backing)
    print("Creating decorative crown...")
    crown = create_crown_topper("Crown", width=2.2, height=0.15, depth=0.1)
    position_crown_above_backing(crown, backing, height_offset=0.1)  # Centered on backing
    add_crown_material(crown, color=(0.4, 0.4, 0.4, 1.0))  # Dark gray
    shelf_assembly['crown'] = crown
    shelf_assembly['all_objects'].append(crown)
    
    # 5. Organize objects in collection
    print("Organizing objects...")
    move_objects_to_collection(shelf_assembly['all_objects'], shelf_collection)
    
    print("Shelf generation complete!")
    return shelf_assembly


def export_shelf_models(shelf_assembly, output_dir="/tmp"):
    """
    Export shelf models in multiple formats.
    
    Args:
        shelf_assembly (dict): Dictionary of shelf objects
        output_dir (str): Output directory for exported files
    """
    print(f"Exporting shelf models to {output_dir}...")
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Export formats
    formats = ['FBX', 'OBJ', 'GLTF']
    
    for fmt in formats:
        filepath = os.path.join(output_dir, f"blockbuster_shelf.{fmt.lower()}")
        try:
            export_shelf_assembly(shelf_assembly['all_objects'], filepath, fmt)
            print(f"Exported {fmt}: {filepath}")
        except Exception as e:
            print(f"Failed to export {fmt}: {e}")


def main():
    """Main function - entry point for the script."""
    print("=== Blender Blockbuster Shelf Generator ===")
    
    try:
        # Generate shelf assembly
        shelf_assembly = generate_complete_shelf_assembly()
        
        # Export models (default to /app for Docker container)
        output_dir = os.environ.get('BLENDER_OUTPUT_DIR', '/app/steamvr-addon/models')
        export_shelf_models(shelf_assembly, output_dir)
        
        print("=== Shelf generation completed successfully! ===")
        
    except Exception as e:
        print(f"Error during shelf generation: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
