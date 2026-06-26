# Blender Pipeline — Legacy

This directory is **not used at runtime.** Do not modify scripts here expecting them to affect the running application.

All store geometry — shelves, ceiling fixtures, floors, walls — is generated procedurally at runtime in WebGL via `client/src/scene/PropRenderer.ts` and `client/src/scene/InstancedShelfRenderer.ts`. The Blender-to-engine import pipeline was an earlier approach and was replaced by procedural WebGL generation.
