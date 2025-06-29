# SteamVR VScript API Documentation

*Source: https://developer.valvesoftware.com/wiki/SteamVR/Environments/Scripting/API*

## Key Capabilities Analysis

Based on the API documentation, here are the critical capabilities and limitations for our project:

## ✅ **What VScript CAN do** (Native Capabilities):

### Entity Creation & Management
- **SpawnEntityFromTableSynchronous()** - Create entities dynamically
- **CreateByClassname()** - Create entities by class (e.g., "prop_physics")
- **UTIL_Remove()** - Clean up entities
- **Entities.FindAll*()** - Search and enumerate entities

### Physics Props
- **CPhysicsProp** class - Full physics simulation
- **EnableMotion()** / **DisableMotion()** - Control physics
- **SetModel()** - Change model dynamically
- **AddEffects()** / **RemoveEffects()** - Visual effects

### File I/O
- **FileToString()** - Read files from disk ✅
- **StringToFile()** - Write files to disk ✅
- **LoadKeyValues()** - Parse config files

### 3D Audio
- **EmitSoundOn()** - Play sounds on entities
- **StartSoundEvent()** - 3D positioned audio
- **SetOpvarFloat*()** - Audio parameters

### VR Interaction
- **CPropVRHand** - VR controller access
- **GetHandHoldingEntity()** - Detect grabbed objects
- **IsVRControllerButtonPressed()** - Button input
- **FireHapticPulse()** - Haptic feedback

### Materials & Rendering
- **SetRenderColor()** - Dynamic coloring
- **SetMaterialGroup()** - Material swapping
- **SetModel()** - Model swapping

## ❌ **What VScript CANNOT do** (External Tool Needed):

### Network Operations
- **No HTTP requests** - Cannot fetch Steam Web API
- **No web sockets** - Cannot communicate with external services
- **No curl/wget equivalent**

### Advanced File Operations
- **No directory traversal** - FileToString ignores '.', '/', '\\'
- **No file system watching** - Cannot monitor file changes
- **No file downloading** - Cannot fetch game icons from CDN

### System Integration
- **No Steam protocol launching** - Cannot execute `steam://run/<appid>`
- **No process spawning** - Cannot launch external programs
- **No system commands** - No shell access

## 🔗 **Integration Strategy**:

The **External Tool** (Node.js/Python) will handle:
1. Steam Web API calls (`GetOwnedGames`)
2. Game icon downloads from Steam CDN
3. JSON manifest generation
4. File system watching for launch signals
5. Steam protocol URL execution

**VScript** will handle:
1. Reading JSON manifests via `FileToString()`
2. Creating `prop_physics` entities for each game
3. Applying game icons as materials/textures
4. Setting up VR interaction hooks
5. Writing launch signal files via `StringToFile()`
6. Managing 3D audio and haptic feedback

## Key API Functions for Our Project:

```lua
-- Entity Creation
local game_prop = Entities:CreateByClassname("prop_physics")
SpawnEntityFromTableSynchronous("prop_physics", {
    model = "models/game_box.mdl",
    origin = Vector(x, y, z)
})

-- File I/O
local json_data = FileToString("steamvr-addon/data/games.json")
StringToFile("launch_signal.txt", tostring(game_appid))

-- VR Interaction
function OnPickedUp(self, hand)
    -- Write launch signal when game is grabbed
    StringToFile("launch/" .. self.game_appid .. ".signal", "launch")
end

-- 3D Audio
EmitSoundOn("ui.beep", game_entity)
StartSoundEvent("ambient.store", shelf_entity)

-- Physics & Materials
game_prop:SetModel("models/props/game_case.mdl")
game_prop:SetMaterialGroup("game_" .. appid)
game_prop:SetRenderColor(255, 255, 255)
```

## File I/O Limitations:
- **Directory traversal disabled**: Paths with '.', '/', '\\' are ignored
- **Relative paths**: Work from game root directory
- **Text files only**: Binary files may not work reliably
- **No file existence checks**: FileToString returns empty on missing files

## VR Controller Input:
- **Button constants**: IN_USE_HAND0, IN_GRIP_HAND0, IN_PAD_TOUCH_HAND0
- **Digital actions**: DEFAULT_USE, DEFAULT_LCLICK, PROP_TOOL_USE
- **Haptic feedback**: FireHapticPulse(0-2), FireHapticPulsePrecise(microseconds)

This API analysis confirms our architecture is sound - VScript handles the VR-specific functionality while external tools handle internet/system operations.

---

## 📚 **Complete API Reference**

### Global Functions

#### Entity Management
```lua
-- Entity Creation
handle SpawnEntityFromTableSynchronous(string className, table spawnTable)
handle CreateSceneEntity(string sceneName)
handle CreateTrigger(Vector vecMin, Vector vecMax, Vector vecOrigin)

-- Entity Search & Enumeration  
handle Entities:CreateByClassname(string className)
table Entities:FindAllByClassname(string className)
table Entities:FindAllByName(string name)
handle Entities:FindByName(handle startFrom, string name)
handle Entities:FindByClassnameNearest(string className, Vector origin, float radius)

-- Entity Manipulation
void UTIL_Remove(handle entity)
void UTIL_RemoveImmediate(handle entity) -- WARNING: Can crash
bool IsValidEntity(handle entity)
```

#### File I/O Operations
```lua
-- Reading/Writing Files
string FileToString(string filePath)
bool StringToFile(string content, string filePath)
table LoadKeyValues(string filePath)
table LoadKeyValuesFromString(string kvString)

-- Precaching Resources
void PrecacheModel(string modelName, handle context)
void PrecacheModelFolder(string folderName, handle context)
void PrecacheParticle(string particleName, handle context)
void PrecacheSoundFile(string soundFileName, handle context)
```

#### Sound System
```lua
-- Entity-based Audio
void EmitSoundOn(string soundName, handle entity)
void StopSoundOn(string soundName, handle entity)
void EmitSoundOnClient(string soundName, handle player)

-- 3D Positioned Audio
void StartSoundEvent(string eventName, handle entity)
void StartSoundEventFromPosition(string eventName, Vector position)
void StopSoundEvent(string eventName, handle entity)

-- Global Audio
void EmitGlobalSound(string soundName)
void StopGlobalSound(string soundName)

-- Audio Parameters
void SetOpvarFloatAll(string stackName, string operatorName, string opvarName, float value)
void SetOpvarFloatPlayer(string stackName, string operatorName, string opvarName, float value, handle player)
```

#### Debug & Utility
```lua
-- Console Output
void Msg(string message)
void Warning(string message)
void PrintLinkedConsoleMessage(string message, string command)

-- Debug Drawing
void DebugDrawLine(Vector start, Vector end, int r, int g, int b, bool ztest, float duration)
void DebugDrawBox(Vector origin, Vector min, Vector max, int r, int g, int b, int a, float duration)
void DebugDrawSphere(Vector center, Vector color, float alpha, float radius, bool ztest, float duration)
void DebugDrawText(Vector origin, string text, bool viewCheck, float duration)
```

### Key Classes

#### CBaseEntity (Base class for all entities)
```lua
-- Transform Operations
Vector GetAbsOrigin()
Vector GetOrigin()
QAngle GetAngles()
void SetAbsOrigin(Vector origin)
void SetOrigin(Vector origin)
void SetAngles(float pitch, float yaw, float roll)

-- Model & Rendering
string GetModelName()
void SetModel(string modelName)  -- Requires precaching
void SetRenderColor(int red, int green, int blue)
void SetRenderAlpha(int alpha)

-- Physics
Vector GetVelocity()
void SetVelocity(Vector velocity)
Vector GetPhysVelocity()
void SetPhysVelocity(Vector velocity)
Vector GetPhysAngularVelocity()
void SetPhysAngularVelocity(Vector angularVel)

-- Entity Management
string GetEntityName()
void SetEntityName(string name)
string GetClassname()
int GetHealth()
void SetHealth(int health)
bool IsAlive()

-- Hierarchy
handle GetParent()
void SetParent(handle parent, string attachment)
handle GetChildren()

-- Context Data
void SetContext(string name, string value, float duration)
void SetContextNum(string name, float value, float duration)
table GetContext(string name)

-- Sound
void EmitSound(string soundName)
void StopSound(string soundName)
float GetSoundDuration(string soundName, string actorModel)
void PrecacheScriptSound(string soundName)

-- Damage
int TakeDamage(CTakeDamageInfo damageInfo)

-- Think Functions
void SetThink(function thinkFunc, string thinkName, float delay)
void StopThink(string thinkName)

-- I/O Events
void ConnectOutput(string outputName, string functionName)
void DisconnectOutput(string outputName, string functionName)
void FireOutput(string outputName, handle activator, handle caller, table args, float delay)

-- Scripting
handle GetPrivateScriptScope()
handle GetOrCreatePrivateScriptScope()
void ValidatePrivateScriptScope()
```

#### CBaseModelEntity (Entities with models)
```lua
-- Materials & Rendering
void SetMaterialGroup(string materialGroup)
void SetMaterialGroupHash(uint32 hash)
void SetRenderMode(int mode)
void SetBodygroup(int group, int value)
void SetBodygroupByName(string group, int value)
void SetSingleMeshGroup(string meshGroup)
void SetLightGroup(string lightGroup)
void SetSize(Vector mins, Vector maxs)
```

#### CPhysicsProp (Physics objects)
```lua
-- Motion Control
void EnableMotion()
void DisableMotion()
void SetDynamicVsDynamicContinuous(bool enabled)
```

#### CDestinationsPropItemPhysics (Interactive props)
```lua
-- User Interaction
void EnableUse(bool allowUse)
bool IsUseEnabled()
void Freeze(bool freeze)
bool IsFrozen()

-- Ownership
CSteamTours_Player GetCreator()
void SetCreator(CSteamTours_Player creator)

-- Workshop Integration
string GetItemDefID()
uint64 GetPublishedFileID()

-- Hooks (add these as entity script functions)
void OnPickedUp(handle self, CPropVRHand hand)
void OnDropped(handle self, CPropVRHand hand)
```

#### CEntities (Global entity manager)
```lua
-- Global accessor: Entities

-- Entity Creation
handle CreateByClassname(string className)

-- Finding Entities
table FindAllByClassname(string className)
table FindAllByName(string name)
table FindAllByModel(string modelName)
table FindAllByTarget(string targetName)
table FindAllInSphere(Vector origin, float radius)

-- Iteration
handle First()
handle Next(handle current)

-- Spatial Queries
table FindAllByClassnameWithin(string className, Vector origin, float radius)
table FindAllByNameWithin(string name, Vector origin, float radius)
handle FindByClassnameNearest(string className, Vector origin, float radius)

-- Player Access
handle GetLocalPlayer()
```

#### Vector Class
```lua
-- Constructor
Vector(float x, float y, float z)

-- Operators
Vector __add(Vector a, Vector b)     -- Addition
Vector __sub(Vector a, Vector b)     -- Subtraction  
Vector __mul(Vector a, Vector b)     -- Multiplication
Vector __div(Vector a, Vector b)     -- Division
float __len()                        -- Length (#vector)
bool __eq(Vector a, Vector b)        -- Equality
string __tostring()                  -- String conversion

-- Methods
float Length()
float Length2D()
Vector Normalized()
Vector Cross(Vector other)
float Dot(Vector other)
Vector Lerp(Vector target, float t)

-- Members
float x, y, z
```

#### QAngle Class
```lua
-- Constructor
QAngle(float pitch, float yaw, float roll)

-- Methods
Vector Forward()
Vector Left()  
Vector Up()

-- Members
float x  -- Pitch
float y  -- Yaw
float z  -- Roll
```

### Enumerations

#### Damage Types
```lua
DMG_GENERIC = 0
DMG_CRUSH = 1
DMG_BULLET = 2
DMG_SLASH = 4
DMG_BURN = 8
DMG_VEHICLE = 16
DMG_FALL = 32
DMG_BLAST = 64
-- ... more damage types
```

#### VR Controller Types
```lua
VR_CONTROLLER_TYPE_UNKNOWN = 0
VR_CONTROLLER_TYPE_X360 = 1
VR_CONTROLLER_TYPE_VIVE = 2
VR_CONTROLLER_TYPE_TOUCH = 3
VR_CONTROLLER_TYPE_RIFT_S = 4
VR_CONTROLLER_TYPE_KNUCKLES = 6
VR_CONTROLLER_TYPE_WINDOWSMR = 7
-- ... more controller types
```

#### Input Digital Actions
```lua
DEFAULT_TOGGLE_MENU = 0
DEFAULT_LCLICK = 1
DEFAULT_RCLICK = 2
DEFAULT_USE = 3
DEFAULT_USE_GRIP = 4
DEFAULT_SHOW_INVENTORY = 5
MOVE_TELEPORT = 8
PROP_TOOL_USE = 12
PROP_TOOL_DROP = 13
-- ... more input actions
```

#### Particle Attachment Types
```lua
PATTACH_ABSORIGIN = 0           -- Spawn on entity origin
PATTACH_ABSORIGIN_FOLLOW = 1    -- Follow entity origin
PATTACH_POINT = 4               -- Spawn on attachment point
PATTACH_POINT_FOLLOW = 5        -- Follow attachment point
PATTACH_WORLDORIGIN = 8         -- Spawn on map origin
-- ... more attachment types
```

### Entity Spawn Table Format

For `SpawnEntityFromTableSynchronous()`:
```lua
local spawnTable = {
    -- Required
    classname = "prop_physics",
    
    -- Transform
    origin = "100 200 300",  -- String format: "x y z"
    angles = "0 90 0",       -- String format: "pitch yaw roll"
    
    -- Model & Materials
    model = "models/props/game_box.vmdl",
    skin = "0",
    materialgroup = "default",
    
    -- Physics
    solid = "6",             -- SOLID_VPHYSICS
    health = "100",
    
    -- Identification
    targetname = "game_prop_1",
    classname = "prop_physics",
    
    -- Custom KeyValues
    spawnflags = "0"
}
```

### Common Entity Classes
```lua
-- Physics objects
"prop_physics"               -- Standard physics prop
"prop_dynamic"              -- Non-physics animated prop
"prop_static"               -- Static world geometry

-- Interaction
"prop_destinations_item_physics"  -- Grabbable physics prop
"prop_destinations_tool"          -- VR tool attachment

-- Triggers
"trigger_multiple"          -- Multi-use trigger
"trigger_once"             -- Single-use trigger  

-- Logic
"logic_relay"              -- Event relay
"logic_timer"              -- Timer entity

-- Environment
"env_entity_maker"         -- Entity spawner
"env_projected_texture"    -- Dynamic lighting
"info_world_layer"         -- Layer control

-- Audio
"ambient_generic"          -- 3D ambient sound
```

### Best Practices

#### Performance
```lua
-- Precache in Spawn() or Precache() hooks
function Precache(context)
    PrecacheModel("models/props/game_box.vmdl", context)
    PrecacheSoundFile("sounds/ui/beep.vsnd", context)
end

-- Use efficient entity searches
local startEntity = nil
while true do
    startEntity = Entities:FindByClassname(startEntity, "prop_physics")
    if not startEntity then break end
    -- Process entity
end
```

#### Error Handling
```lua
-- Always validate entities
if IsValidEntity(entity) then
    entity:SetOrigin(Vector(0, 0, 0))
end

-- Check file operations
local jsonData = FileToString("data/games.json")
if jsonData == "" then
    Warning("Failed to load games.json")
    return
end
```

#### VR Interaction
```lua
-- Entity script for interactive game props
function OnPickedUp(self, hand)
    -- Play pickup sound
    self:EmitSound("ui.pickup")
    
    -- Haptic feedback
    hand:FireHapticPulse(1)
    
    -- Write launch signal
    local appid = self:GetContext("appid")
    StringToFile("launch/" .. appid .. ".signal", "launch")
end

function OnDropped(self, hand)
    self:EmitSound("ui.drop")
end
```

## 🚀 **Practical Implementation Examples**

### Map Script Structure (addon_game_mode.lua)

```lua
--[[]
SteamVR Blockbuster Shelf - Main Map Script
File: scripts/vscripts/addon_game_mode.lua
]]

-- Global game manager
BlockbusterShelf = {}

-- Map script callbacks
function Activate()
    print("Blockbuster Shelf: Initializing...")
    
    -- Initialize our shelf manager
    BlockbusterShelf:Initialize()
end

function OnInit()
    print("Blockbuster Shelf: Script system loaded")
end

function OnPostInit()
    print("Blockbuster Shelf: Script system initialized")
end

function OnPrecache(context)
    print("Blockbuster Shelf: Precaching assets...")
    
    -- Precache game box models
    PrecacheModel("models/props/game_box.vmdl", context)
    PrecacheModel("models/props/game_case.vmdl", context)
    
    -- Precache audio
    PrecacheSoundFile("sounds/ui/beep.vsnd", context)
    PrecacheSoundFile("sounds/ui/pickup.vsnd", context)
    PrecacheSoundFile("sounds/ui/drop.vsnd", context)
    PrecacheSoundFile("sounds/ambient/store.vsnd", context)
end

function OnPlayerSpawned()
    print("Blockbuster Shelf: Player spawned")
    
    -- Start the shelf population after player is ready
    BlockbusterShelf:PopulateShelf()
end

function OnHMDAvatarAndHandsSpawned()
    print("Blockbuster Shelf: VR equipment ready")
    
    -- VR controllers are now accessible
    BlockbusterShelf:SetupVRInteraction()
end
```

### Shelf Manager Implementation

```lua
--[[]
Blockbuster Shelf Manager
Handles JSON loading, entity spawning, and VR interaction
]]

function BlockbusterShelf:Initialize()
    self.games = {}
    self.gameEntities = {}
    self.shelfEntity = nil
    
    -- Create console commands for debugging
    Convars:RegisterCommand("shelf_reload", function()
        self:PopulateShelf()
    end, "Reload the game shelf", 0)
    
    Convars:RegisterCommand("shelf_clear", function()
        self:ClearShelf()
    end, "Clear all game props", 0)
    
    print("Blockbuster Shelf: Manager initialized")
end

function BlockbusterShelf:PopulateShelf()
    print("Blockbuster Shelf: Loading game library...")
    
    -- Read the JSON manifest created by external tool
    local jsonData = FileToString("data/games.json")
    if jsonData == "" then
        Warning("Blockbuster Shelf: Failed to load games.json")
        return
    end
    
    -- Parse JSON (simplified - real implementation would need JSON parser)
    local success, gameList = pcall(function()
        return self:ParseGameJSON(jsonData)
    end)
    
    if not success then
        Warning("Blockbuster Shelf: Failed to parse games.json")
        return
    end
    
    self.games = gameList
    print("Blockbuster Shelf: Loaded " .. #self.games .. " games")
    
    -- Find the shelf entity
    self.shelfEntity = Entities:FindByName(nil, "blockbuster_shelf")
    if not self.shelfEntity then
        Warning("Blockbuster Shelf: Shelf entity not found!")
        return
    end
    
    -- Spawn game props
    self:SpawnGameProps()
    
    -- Start ambient audio
    StartSoundEvent("ambient.store", self.shelfEntity)
end

function BlockbusterShelf:SpawnGameProps()
    local shelfOrigin = self.shelfEntity:GetAbsOrigin()
    local shelfAngles = self.shelfEntity:GetAngles()
    
    -- Clear existing props
    self:ClearShelf()
    
    -- Calculate grid layout
    local gamesPerRow = 5
    local gameSpacing = 25  -- Units between games
    local rowSpacing = 30   -- Units between rows
    
    for i, game in ipairs(self.games) do
        local row = math.floor((i - 1) / gamesPerRow)
        local col = (i - 1) % gamesPerRow
        
        -- Calculate position relative to shelf
        local localX = (col - (gamesPerRow - 1) / 2) * gameSpacing
        local localY = 10  -- Slightly forward from shelf
        local localZ = row * rowSpacing + 20  -- Above shelf surface
        
        -- Transform to world coordinates
        local gamePos = shelfOrigin + 
            shelfAngles:Forward() * localY +
            shelfAngles:Right() * localX +
            shelfAngles:Up() * localZ
        
        -- Create spawn table
        local spawnTable = {
            classname = "prop_destinations_item_physics",
            model = "models/props/game_box.vmdl",
            origin = tostring(gamePos.x) .. " " .. tostring(gamePos.y) .. " " .. tostring(gamePos.z),
            angles = tostring(shelfAngles.x) .. " " .. tostring(shelfAngles.y) .. " " .. tostring(shelfAngles.z),
            targetname = "game_prop_" .. game.appid,
            solid = "6",  -- SOLID_VPHYSICS
            health = "100"
        }
        
        -- Spawn the entity
        local gameEntity = SpawnEntityFromTableSynchronous("prop_destinations_item_physics", spawnTable)
        
        if gameEntity then
            -- Store game data in entity context
            gameEntity:SetContext("appid", tostring(game.appid), 0)
            gameEntity:SetContext("name", game.name, 0)
            gameEntity:SetContext("playtime", tostring(game.playtime_forever), 0)
            
            -- Apply game-specific material if available
            if game.icon_material then
                gameEntity:SetMaterialGroup(game.icon_material)
            end
            
            -- Add to tracking
            self.gameEntities[game.appid] = gameEntity
            
            -- Set up entity script
            self:SetupGameEntityScript(gameEntity, game)
            
            print("Spawned: " .. game.name .. " (AppID: " .. game.appid .. ")")
        else
            Warning("Failed to spawn entity for " .. game.name)
        end
    end
    
    print("Blockbuster Shelf: Spawned " .. #self.gameEntities .. " game props")
end

function BlockbusterShelf:SetupGameEntityScript(entity, game)
    -- Get the entity's private script scope
    local entityScope = entity:GetOrCreatePrivateScriptScope()
    
    -- Add game data to entity scope
    entityScope.game_data = game
    entityScope.shelf_manager = self
    
    -- Define pickup behavior
    entityScope.OnPickedUp = function(self, hand)
        local gameData = self.game_data
        print("Picked up: " .. gameData.name)
        
        -- Play pickup sound
        self:EmitSound("ui.pickup")
        
        -- Haptic feedback
        hand:FireHapticPulse(1)
        
        -- Visual feedback (glow effect)
        self:AddEffects(64)  -- EF_BRIGHTLIGHT
        
        -- Update playtime display
        entityScope.shelf_manager:ShowGameInfo(gameData)
    end
    
    -- Define drop behavior
    entityScope.OnDropped = function(self, hand)
        local gameData = self.game_data
        print("Dropped: " .. gameData.name)
        
        -- Play drop sound
        self:EmitSound("ui.drop")
        
        -- Check if dropped in launch zone
        if entityScope.shelf_manager:IsInLaunchZone(self:GetAbsOrigin()) then
            entityScope.shelf_manager:LaunchGame(gameData)
        end
        
        -- Remove glow effect
        self:RemoveEffects(64)
    end
end

function BlockbusterShelf:IsInLaunchZone(position)
    -- Find launch zone trigger
    local launchZone = Entities:FindByName(nil, "launch_zone")
    if not launchZone then
        return false
    end
    
    -- Simple distance check (could be more sophisticated)
    local zoneOrigin = launchZone:GetAbsOrigin()
    local distance = VectorDistance(position, zoneOrigin)
    
    return distance < 50  -- Within 50 units
end

function BlockbusterShelf:LaunchGame(game)
    print("Launching: " .. game.name .. " (AppID: " .. game.appid .. ")")
    
    -- Write launch signal file for external tool to monitor
    local signalData = "launch\n" .. game.appid .. "\n" .. game.name
    StringToFile("launch_signals/" .. game.appid .. ".signal", signalData)
    
    -- Play launch sound
    EmitGlobalSound("ui.launch")
    
    -- Visual effect at launch zone
    local launchZone = Entities:FindByName(nil, "launch_zone")
    if launchZone then
        -- Create particle effect
        local particleId = ParticleManager:CreateParticle(
            "particles/launch_effect.vpcf", 
            PATTACH_ABSORIGIN, 
            launchZone
        )
        
        -- Set particle control points
        ParticleManager:SetParticleControl(particleId, 0, launchZone:GetAbsOrigin())
        ParticleManager:SetParticleControl(particleId, 1, Vector(255, 255, 255))
    end
    
    -- Show launch confirmation message
    UTIL_MessageTextAll("Launching " .. game.name .. "...", 255, 255, 255, 255)
end

function BlockbusterShelf:ShowGameInfo(game)
    -- Find info display entity
    local infoDisplay = Entities:FindByName(nil, "game_info_display")
    if not infoDisplay then
        return
    end
    
    -- Format game information
    local playtimeHours = math.floor(game.playtime_forever / 60)
    local infoText = game.name .. "\n" .. 
                    "Playtime: " .. playtimeHours .. " hours\n" ..
                    "AppID: " .. game.appid
    
    -- Update display
    infoDisplay:SetMessage(infoText)
end

function BlockbusterShelf:ClearShelf()
    -- Remove all existing game entities
    for appid, entity in pairs(self.gameEntities) do
        if IsValidEntity(entity) then
            UTIL_Remove(entity)
        end
    end
    
    self.gameEntities = {}
    print("Blockbuster Shelf: Cleared all game props")
end

function BlockbusterShelf:ParseGameJSON(jsonString)
    -- Simplified JSON parser for our specific format
    -- In real implementation, would use proper JSON library
    local games = {}
    
    -- This is a placeholder - actual JSON parsing would be more robust
    local gamePattern = '"appid":(%d+).-"name":"([^"]+)".-"playtime_forever":(%d+)'
    
    for appid, name, playtime in string.gmatch(jsonString, gamePattern) do
        table.insert(games, {
            appid = tonumber(appid),
            name = name,
            playtime_forever = tonumber(playtime),
            icon_material = "game_" .. appid  -- Material name pattern
        })
    end
    
    return games
end

function BlockbusterShelf:SetupVRInteraction()
    -- Get the local player
    local player = Entities:GetLocalPlayer()
    if not player then
        return
    end
    
    -- Get HMD avatar
    local hmdAvatar = player:GetHMDAvatar()
    if not hmdAvatar then
        return
    end
    
    -- Get VR hands
    local leftHand = hmdAvatar:GetVRHand(0)
    local rightHand = hmdAvatar:GetVRHand(1)
    
    if leftHand then
        print("Left hand ready for interaction")
    end
    
    if rightHand then
        print("Right hand ready for interaction")
    end
    
    -- Set up per-frame update for hand tracking
    ScriptSystem_AddPerFrameUpdateFunction(function()
        self:UpdateHandTracking()
    end)
end

function BlockbusterShelf:UpdateHandTracking()
    -- This function is called every frame
    -- Can be used for advanced hand tracking or gesture recognition
    
    -- Example: Check for specific gestures or proximity to shelf
    local player = Entities:GetLocalPlayer()
    if not player then return end
    
    local hmdAvatar = player:GetHMDAvatar()
    if not hmdAvatar then return end
    
    -- Check hand positions relative to shelf
    local leftHand = hmdAvatar:GetVRHand(0)
    local rightHand = hmdAvatar:GetVRHand(1)
    
    if leftHand and self.shelfEntity then
        local handPos = leftHand:GetAbsOrigin()
        local shelfPos = self.shelfEntity:GetAbsOrigin()
        local distance = VectorDistance(handPos, shelfPos)
        
        -- Provide haptic feedback when near shelf
        if distance < 100 and distance > 95 then
            leftHand:FireHapticPulsePrecise(100)  -- Subtle pulse
        end
    end
end
```

### Directory Structure for Scripts

```
steamvr-addon/
├── scripts/
│   └── vscripts/
│       ├── addon_game_mode.lua          # Main map script
│       ├── map_scripts/
│       │   └── blockbuster_map.lua      # Map-specific script
│       └── entities/
│           └── game_prop.lua            # Entity-specific script
├── data/
│   ├── games.json                       # Generated by external tool
│   └── config.json                      # Shelf configuration
└── launch_signals/                      # Launch signal files
    ├── 440.signal                       # Team Fortress 2
    └── 730.signal                       # Counter-Strike 2
```

### Console Commands for Development

```lua
-- Add these to your Initialize function for debugging
Convars:RegisterCommand("shelf_test_spawn", function()
    -- Spawn a test game prop
    local testSpawn = {
        classname = "prop_destinations_item_physics",
        model = "models/props/game_box.vmdl",
        origin = "0 0 100",
        angles = "0 0 0",
        targetname = "test_game"
    }
    SpawnEntityFromTableSynchronous("prop_destinations_item_physics", testSpawn)
end, "Spawn test game prop", 0)

Convars:RegisterCommand("shelf_list_games", function()
    for appid, entity in pairs(self.gameEntities) do
        local name = entity:GetContext("name")
        Msg("Game: " .. name .. " (AppID: " .. appid .. ")")
    end
end, "List all spawned games", 0)

Convars:RegisterCommand("shelf_debug_hand", function()
    local player = Entities:GetLocalPlayer()
    if player then
        local hmdAvatar = player:GetHMDAvatar()
        if hmdAvatar then
            local leftHand = hmdAvatar:GetVRHand(0)
            if leftHand then
                local pos = leftHand:GetAbsOrigin()
                Msg("Left hand position: " .. tostring(pos))
            end
        end
    end
end, "Debug hand position", 0)
```

### Error Handling Best Practices

```lua
function BlockbusterShelf:SafeFileOperation(operation, filename)
    local success, result = pcall(operation, filename)
    
    if not success then
        Warning("File operation failed for " .. filename .. ": " .. tostring(result))
        return nil
    end
    
    return result
end

function BlockbusterShelf:SafeEntityOperation(entity, operation)
    if not IsValidEntity(entity) then
        Warning("Attempting operation on invalid entity")
        return false
    end
    
    local success, result = pcall(operation, entity)
    
    if not success then
        Warning("Entity operation failed: " .. tostring(result))
        return false
    end
    
    return result
end
```

This implementation provides a complete foundation for our SteamVR blockbuster shelf with proper VR interaction, sound effects, and integration hooks for the external Steam API tool.

---

## ⚠️ **Critical Integration Requirements**

### **File-Based IPC is Mission-Critical**

The **entire project depends** on reliable communication between VScript and the external tool via the filesystem. This must be tested **first** before building any higher-level features.

#### **Key Integration Points:**

1. **VScript → External Tool**: Launch signals
   ```lua
   -- This MUST work reliably
   StringToFile("launch_signals/" .. appid .. ".signal", "launch")
   ```

2. **External Tool → VScript**: Game library data
   ```lua
   -- This MUST work reliably  
   local jsonData = FileToString("data/games.json")
   ```

3. **External Tool → Steam**: Game execution
   ```javascript
   // This MUST work reliably
   exec(`steam://run/${appid}`)
   ```

#### **Testing Priority Matrix:**

```
🔴 CRITICAL (Test First):
├── StringToFile() works from VScript
├── Node.js can detect new signal files  
├── Steam protocol URLs launch games
└── File cleanup prevents duplicate launches

🟡 IMPORTANT (Test Second):
├── JSON parsing in VScript works
├── Large file handling (many games)
├── Concurrent signal handling
└── Error recovery and logging

🟢 NICE-TO-HAVE (Test Later):
├── Performance optimization
├── UI polish and effects
├── Advanced VR interaction
└── Audio and haptic feedback
```

### **Environment Transition Strategy**

#### **The "Desktop Risk" Problem:**
- **VScript CANNOT directly launch games** and maintain the environment
- **Unavoidable outcome**: User may briefly see desktop during transition
- **Acceptable fallback**: Clean shutdown → desktop → game launch
- **Research needed**: SteamVR Dashboard integration for seamless transitions

#### **Implementation Approaches:**
