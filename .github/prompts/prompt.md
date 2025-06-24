You are an expert in VR dev with SteamVR Home and Blender scripting, and automation tooling.
Project: Build a SteamVR "Blockbuster shelf" environment that is dynamically populated at runtime.
Requirements:
- External tool (Node.js or Python) fetches Steam Web API GetOwnedGames.
- Downloads icons/assets to local disk under `steamvr-addon/art/`.
- Generates a JSON file with appid, name, icon path.
- Daemon watches for launch-signals from VScript.
- When VScript emits a signal (e.g., writes to file) watcher launches game via `steam://run/<appid>`.
- Create Blender CLI script (Python) that procedurally generates shelf models and exports FBX or source asset files:
    * Shelf: rectangular cube
    * Brackets: triangular prisms
    * Backing: vertical plane or pegboard
    * Crown/topper: cylindrical ovoid
- Use Blender’s CLI-mode: `blender --background --python blender/gen_shelf.py`
- VScript (Lua) inside `steamvr-addon/` reads JSON, spawns prop_physics entities per game, sets model/material, sets interact hook to write launch signal file.
- Also script basic audio: attach 3D soundemitter to shelf; trigger playback via `.vsndevts`.
Tasks for LLM:
- Research full SteamVR VScript API to confirm file I/O and entity creation.
- Research available Blender CLI operations for mesh generation via bpy.
- Scaffold:
  1. `external-tool/fetch_library.js`
  2. `external-tool/watcher.js`
  3. `blender/gen_shelf.py`
  4. `steamvr-addon/scripts/vscripts/map_scripts/populate.lua`
Return clear code files and comments; include setup steps to install dependencies:

- `npm install node-fetch chokidar`
- `pip install steamapi`
- Prereq: Blender 4.x, VS Code, SteamVR Workshop Tools.
