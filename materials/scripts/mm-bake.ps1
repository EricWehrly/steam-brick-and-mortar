<#
.SYNOPSIS
    Bake a Material Maker (.ptex) material to PBR texture maps via the CLI.

.DESCRIPTION
    Wraps Material Maker's `--export-material` command line so we don't hand-write the
    invocation each time. Handles the things that trip up a raw call:
      * Material Maker is a GUI-subsystem exe -- a plain `& exe` does NOT wait for it, so we
        launch via Start-Process and WaitForExit to capture the real exit code.
      * Optional per-tier resolution: -Size stamps the output resolution into a temp copy of
        the .ptex (the CLI's own --size flag is a no-op in MM 1.6). Size is set on the graph's
        `material` node as a power-of-two exponent (2048 => 11, 1024 => 10, 512 => 9).
      * Optional -RenderingDriver to work around GPU/driver crashes (e.g. 'opengl3' if the
        default Vulkan path access-violates during headless export).
      * Optional -GodotBin to run MM *from source* with a chosen Godot build (e.g. 4.7)
        instead of the bundled release runtime -- same flags, different host.
    Verifies its dependencies and prints a clear diagnostic summary (exit code meaning,
    elapsed time, output files, stdout/stderr tails).

    ASCII-only on purpose: Windows PowerShell 5.1 mis-decodes non-ASCII in a UTF-8 (no BOM)
    script and fails to parse. Do not add em-dashes / box-drawing chars to this file.

.PARAMETER InputFile
    Path to the source .ptex material.

.PARAMETER OutDir
    Output directory for the baked maps. Created if missing; existing files are cleared.

.PARAMETER Target
    Material Maker export target/profile. Default 'GLTF/Plane' (emits albedo / ORM / normal
    PNGs in glTF convention -- what three.js MeshStandardMaterial expects).

.PARAMETER Size
    Output resolution in pixels (power of two, e.g. 512/1024/2048). 0 = leave the .ptex as-is.
    Non-power-of-two values snap to the nearest exponent with a warning.

.PARAMETER RenderingDriver
    Godot rendering driver: 'default' (whatever the build picks -- Vulkan on Windows),
    'vulkan', 'opengl3' (Compatibility), or 'd3d12'. Use 'opengl3' to dodge Vulkan headless
    crashes.

.PARAMETER MMExe
    Path to material_maker.exe (bundled release runtime). ONLY used with -UseReleaseBinary --
    this exe's CLI export hard-crashes (access violation) on export; it is kept solely as a
    regression-test target, never as the default bake path.

.PARAMETER GodotBin
    Godot executable used to run MM *from source*: `<godot> --path <MMSource> <args>`. This is
    the default (and only supported) bake path -- defaults to the Godot 4.6-stable console
    build. Override to try a different engine build without touching PATH.

.PARAMETER MMSource
    Path to the Material Maker source clone. Defaults to our fork. IMPORTANT: baking requires
    the clone to be on (or descended from) branch `fix/cli-export-buffer-race` -- that branch
    fixes three real races in CLI export (device-creation, render-queue drain, and a deferred
    texture-readback race) that otherwise make export nondeterministic/incomplete. This script
    warns (not fails) if the fix markers aren't found in the clone, since a warning is enough to
    catch an accidental branch switch without breaking a deliberate regression test.

.PARAMETER UseReleaseBinary
    Opt into the bundled release .exe instead of from-source (via -MMExe). Known broken (hard
    crash on export) -- exists only so we can re-confirm that failure mode on demand without
    hand-writing the invocation.

.PARAMETER TimeoutSec
    Kill the export if it exceeds this many seconds. Default 180.

.EXAMPLE
    ./mm-bake.ps1 -InputFile ..\src\brick.ptex -OutDir ..\baked\brick -Size 2048

.EXAMPLE
    ./mm-bake.ps1 -InputFile ..\src\brick.ptex -OutDir ..\baked\brick -RenderingDriver opengl3

.EXAMPLE
    ./mm-bake.ps1 -InputFile ..\src\brick.ptex -OutDir ..\baked\brick -GodotBin "F:\Program Files\Godot\Godot_v4.7-stable_win64.exe"

.EXAMPLE
    # Re-confirm the release binary is still broken (regression check, not normal use):
    ./mm-bake.ps1 -InputFile ..\src\brick.ptex -OutDir ..\baked\brick -UseReleaseBinary
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$InputFile,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [string]$Target = 'GLTF/Plane',
    [int]$Size = 0,
    [ValidateSet('default', 'vulkan', 'opengl3', 'd3d12')][string]$RenderingDriver = 'default',
    [string]$MMExe = 'F:\FilePrograms\Dropbox\Projects\material-maker\release\material_maker_1_6_windows\material_maker.exe',
    [switch]$UseReleaseBinary,
    [string]$GodotBin = 'F:\Program Files\Godot\Godot_v4.6-stable_win64.exe\Godot_v4.6-stable_win64_console.exe',
    [string]$MMSource = 'F:\FilePrograms\Dropbox\Projects\material-maker',
    [int]$TimeoutSec = 180
)

$ErrorActionPreference = 'Stop'

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 2 }

# Dependency + input verification
$useSource = (-not $UseReleaseBinary)
if ($useSource) {
    if (-not (Test-Path $GodotBin)) { Fail "Godot binary not found: $GodotBin" }
    if (-not (Test-Path $MMSource)) { Fail "Material Maker source not found: $MMSource" }
    if (-not (Test-Path (Join-Path $MMSource 'project.godot'))) { Fail "No project.godot in MMSource: $MMSource" }
    $exePath = $GodotBin
    $workDir = $MMSource
    Write-Host "Mode: from-source via Godot -> $GodotBin" -ForegroundColor Cyan
    $fixMarkerFile = Join-Path $MMSource 'parse_args.gd'
    if ((Test-Path $fixMarkerFile) -and -not (Select-String -Path $fixMarkerFile -Pattern 'MM-FORK' -Quiet)) {
        Write-Warning "MMSource does not contain the 'MM-FORK' patch markers in parse_args.gd -- if this clone isn't on branch fix/cli-export-buffer-race (or a descendant), CLI export may be nondeterministic/incomplete again. See materials/mm-cli-export-patch-context.md."
    }
}
else {
    if (-not (Test-Path $MMExe)) { Fail "material_maker.exe not found: $MMExe" }
    $exePath = $MMExe
    $workDir = Split-Path $MMExe -Parent
    Write-Host "Mode: bundled release runtime (KNOWN BROKEN -- regression check only) -> $MMExe" -ForegroundColor Yellow
}
if (-not (Test-Path $InputFile)) { Fail "Input .ptex not found: $InputFile" }
$InputFile = (Resolve-Path $InputFile).Path

# Optional: stamp output resolution into a temp .ptex copy
$exportInput = $InputFile
$tempPtex = $null
if ($Size -gt 0) {
    $exponent = [int][math]::Round([math]::Log($Size, 2))
    $snapped = [int][math]::Pow(2, $exponent)
    if ($snapped -ne $Size) { Write-Warning "Size $Size is not a power of two; snapping to $snapped (exponent $exponent)." }
    try {
        $json = Get-Content $InputFile -Raw | ConvertFrom-Json
    }
    catch { Fail "Could not parse .ptex as JSON: $($_.Exception.Message)" }
    $matNodes = @($json.nodes | Where-Object { $_.type -eq 'material' })
    if ($matNodes.Count -eq 0) { Fail "No node of type 'material' found in $InputFile -- cannot set resolution." }
    foreach ($n in $matNodes) { $n.parameters.size = $exponent }
    $tempPtex = Join-Path ([System.IO.Path]::GetTempPath()) ("mmbake_" + [System.IO.Path]::GetFileNameWithoutExtension($InputFile) + "_$snapped.ptex")
    ($json | ConvertTo-Json -Depth 100) | Set-Content -Path $tempPtex -Encoding UTF8
    $exportInput = $tempPtex
    Write-Host "Resolution: ${snapped}px (material node size exponent = $exponent)" -ForegroundColor Cyan
}

# Prepare output dir
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Get-ChildItem $OutDir -File -ErrorAction SilentlyContinue | Remove-Item -Force
$OutDir = (Resolve-Path $OutDir).Path

# Build argument list
$argList = New-Object System.Collections.Generic.List[string]
if ($useSource) { $argList.Add('--path'); $argList.Add($MMSource) }
if ($RenderingDriver -ne 'default') { $argList.Add('--rendering-driver'); $argList.Add($RenderingDriver) }
$argList.Add('--export-material'); $argList.Add('--target'); $argList.Add($Target)
$argList.Add('-o'); $argList.Add($OutDir); $argList.Add($exportInput)

$scratch = [System.IO.Path]::GetTempPath()
$soFile = Join-Path $scratch 'mm-bake-stdout.txt'
$seFile = Join-Path $scratch 'mm-bake-stderr.txt'

Write-Host ("Command: `"{0}`" {1}" -f $exePath, ($argList -join ' ')) -ForegroundColor DarkGray
Write-Host "Baking..." -ForegroundColor Green

# Run (Start-Process so we actually wait on the GUI-subsystem exe)
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$proc = Start-Process -FilePath $exePath -WorkingDirectory $workDir -ArgumentList $argList.ToArray() -PassThru -RedirectStandardOutput $soFile -RedirectStandardError $seFile
# Touch .Handle immediately: without this, a -PassThru process from Start-Process often
# reports a null ExitCode after it exits (documented Windows PowerShell quirk).
$null = $proc.Handle
$exited = $proc.WaitForExit($TimeoutSec * 1000)
if (-not $exited) {
    try { $proc.Kill() } catch {}
    $sw.Stop()
    Write-Host "TIMEOUT after ${TimeoutSec}s -- process killed." -ForegroundColor Red
    if ($tempPtex -and (Test-Path $tempPtex)) { Remove-Item $tempPtex -Force }
    exit 3
}
$proc.WaitForExit()   # no-arg overload: flush redirected streams before reading ExitCode
$sw.Stop()
try { $code = [int]$proc.ExitCode } catch { $code = $null }

# Report
$codeMeaning = @{
    0           = 'success'
    -1073741819 = 'ACCESS VIOLATION (0xC0000005) -- GPU/driver crash; try -RenderingDriver opengl3'
    -1073741795 = 'illegal instruction (0xC000001D)'
    -1073740791 = 'stack buffer overrun (0xC0000409)'
}
if ($null -eq $code) { $meaning = 'UNKNOWN (exit code unavailable)' }
elseif ($codeMeaning.ContainsKey($code)) { $meaning = $codeMeaning[$code] }
else { $meaning = 'nonzero -- see stdout/stderr below' }
if ($code -eq 0) { $col = 'Green' } else { $col = 'Red' }
Write-Host ("Exit code: {0}  ({1})" -f $code, $meaning) -ForegroundColor $col
Write-Host ("Elapsed: {0}s" -f [math]::Round($sw.Elapsed.TotalSeconds, 1))

$produced = @(Get-ChildItem $OutDir -File -ErrorAction SilentlyContinue)
Write-Host "--- Output files ($($produced.Count)) ---" -ForegroundColor Cyan
$produced | Select-Object Name, @{n = 'KB'; e = { [math]::Round($_.Length / 1KB, 1) } } | Format-Table -AutoSize | Out-String | Write-Host

if (Test-Path $soFile) {
    $so = Get-Content $soFile
    if ($so) { Write-Host "--- stdout (tail) ---" -ForegroundColor Cyan; $so | Select-Object -Last 25 | ForEach-Object { Write-Host $_ } }
}
if (Test-Path $seFile) {
    $se = Get-Content $seFile
    if ($se) { Write-Host "--- stderr (tail) ---" -ForegroundColor Yellow; $se | Select-Object -Last 15 | ForEach-Object { Write-Host $_ } }
}

if ($tempPtex -and (Test-Path $tempPtex)) { Remove-Item $tempPtex -Force }
exit $code
