# Command-Line Installation Research Summary

## Research Objective
Investigate command-line installation options for tools mentioned in Story 1.1.2 (Development Environment Setup) to enable automated developer onboarding.

## Tools Researched

### 1. Blender 4.x ✅ AUTOMATABLE
**Official Sources:**
- Download: https://www.blender.org/download/
- Current Version: 4.4.3 (342MB MSI installer)
- License: GPL v3+ (Free and Open Source)

**Command-Line Installation Options:**

#### Windows Package Managers:
- **Chocolatey**: `choco install blender` 
  - Status: ✅ Available (v4.4.3, 1.1M+ downloads)
  - Source: https://chocolatey.org/packages/blender
  - Maintained by: chocolatey-community

- **Scoop**: `scoop install blender`
  - Status: ✅ Available in main bucket
  - Source: https://scoop.sh/
  - Portable installation approach

- **winget**: `winget install BlenderFoundation.Blender`
  - Status: ✅ Available (Windows 10+ built-in package manager)
  - Native Windows solution

#### Other Platforms:
- **macOS Homebrew**: `brew install --cask blender`
- **Ubuntu/Debian**: `sudo apt install blender`
- **Fedora**: `sudo dnf install blender`
- **Arch Linux**: `sudo pacman -S blender`

**Automation Verdict**: ✅ FULLY AUTOMATABLE across all major platforms

### 2. VS Code Extensions ✅ AUTOMATABLE
**Official Command-Line Interface:**
- Base command: `code --install-extension <extension-id>`
- Documentation: https://code.visualstudio.com/docs/editor/extension-gallery#_command-line-extension-management

**Relevant Extensions for Lua/VScript Development:**
- **Lua Language Support**: `code --install-extension trixnz.vscode-lua`
- **Lua Language Server**: `code --install-extension sumneko.lua`
- **JSON Support**: `code --install-extension ms-vscode.vscode-json`
- **Python Support**: `code --install-extension ms-python.python`
- **Docker Support**: `code --install-extension ms-vscode-remote.remote-containers`

**Additional Capabilities:**
- Batch installation: Multiple `--install-extension` calls
- Force installation: `--force` flag
- Extension marketplace search: Web interface or programmatic access
- Offline installation: `code --install-extension path/to/extension.vsix`

**Automation Verdict**: ✅ FULLY AUTOMATABLE with excellent CLI support

### 3. SteamVR Workshop Tools ❌ NOT AUTOMATABLE
**Official Sources:**
- Steam Store: https://store.steampowered.com/app/250820/SteamVR/
- Developer Docs: https://developer.valvesoftware.com/wiki/SteamVR/Workshop_Tools
- Steam Community: https://steamcommunity.com/app/250820/workshop/

**Installation Requirements:**
- ✅ Steam Client (can be automated on some platforms)
- ❌ Manual user interaction required
- ❌ No direct command-line installer
- ❌ No package manager support

**Manual Installation Process:**
1. Install Steam client (automatable via package managers)
2. Sign in to Steam account (requires user credentials)
3. Navigate to Library > Tools
4. Find "SteamVR Workshop Tools"
5. Click Install button
6. Complete VR setup process

**Steam Client Automation Options:**
- **Windows**: `choco install steam` / `scoop install steam` / `winget install Valve.Steam`
- **macOS**: `brew install --cask steam`
- **Linux**: Package manager or Flatpak/Snap

**Automation Verdict**: ❌ REQUIRES MANUAL INSTALLATION (Steam Workshop Tools specifically)

## Windows Package Manager Analysis

### Chocolatey
- **Pros**: Mature, extensive package repository, enterprise support
- **Cons**: Requires PowerShell execution policy changes
- **Blender**: ✅ Available, well-maintained, 1.1M+ downloads
- **VS Code**: ✅ Available
- **Steam**: ✅ Available (client only, not Workshop Tools)

### Scoop
- **Pros**: User-friendly, portable installations, no admin rights required
- **Cons**: Smaller package ecosystem than Chocolatey
- **Blender**: ✅ Available in main bucket
- **VS Code**: ✅ Available
- **Steam**: ✅ Available in extras bucket

### winget (Windows Package Manager)
- **Pros**: Built into Windows 10+, Microsoft official, no third-party dependencies
- **Cons**: Newer ecosystem, fewer packages than Chocolatey
- **Blender**: ✅ Available (`BlenderFoundation.Blender`)
- **VS Code**: ✅ Available (`Microsoft.VisualStudioCode`)
- **Steam**: ✅ Available (`Valve.Steam`)

## Implementation Recommendations

### ✅ Automated Components
1. **Create installation scripts** for Windows PowerShell, macOS/Linux Bash
2. **Package manager detection** (winget > chocolatey > scoop priority)
3. **VS Code extension installation** via `code --install-extension`
4. **Docker container setup** for consistent cross-platform development
5. **Environment validation** script to verify installations

### ⚠️ Semi-Automated Components
1. **Steam client installation** (automatable)
2. **Initial Steam account setup** (manual - user credentials required)
3. **VR hardware configuration** (manual - hardware-specific)

### ❌ Manual Components
1. **SteamVR Workshop Tools installation** (requires Steam GUI interaction)
2. **Steam API key generation** (requires Steam Community account)
3. **VR headset setup and calibration** (hardware-specific process)

## Script Implementation Status

### ✅ Completed
- `scripts/setup-development-tools.ps1` - Windows PowerShell automation
- `scripts/setup-development-tools.sh` - Linux/macOS Bash automation
- Docker Compose `setup` service for guidance
- Updated README.md with automated setup instructions
- Enhanced environment validation script

### 📝 Next Steps
1. Test scripts on clean Windows/macOS/Linux environments
2. Add package manager installation (Chocolatey/Scoop) to scripts
3. Create VS Code workspace configuration with recommended extensions
4. Document SteamVR Workshop Tools manual installation process
5. Add Steam API key configuration guidance

## Conclusion
**Automation Coverage**: ~80% of development environment setup can be automated
**Blocking Manual Steps**: SteamVR Workshop Tools installation via Steam client
**Recommended Approach**: Automated setup scripts + clear manual instructions for remaining steps

The research confirms that most development tools can be installed via command-line, with Windows package managers (winget, Chocolatey, Scoop) providing excellent coverage for Blender and VS Code. SteamVR Workshop Tools remains the primary manual installation requirement due to Steam's GUI-based tool installation process.
