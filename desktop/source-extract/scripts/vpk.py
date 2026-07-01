#!/usr/bin/env python3
"""
VPK utility: list, search, and bulk-extract files from Source 1 VPK archives.

Subcommands:
    list   <game> [--force]              Build or show the cached flat file list
    search <game> <pattern> [options]    Search the flat list
    extract <game> [options]             Batch-extract per manifest JSON

Options for search:
    --ext <.mdl>    Filter by file extension
    --force, -f     Rebuild cache even if it exists

Options for extract:
    --manifest <file>   Override default manifest path
    --dry-run           Print what would be extracted without running it

Game configs: desktop/scripts/source-extract/games.json
Cache: desktop/extracted/.vpk-list-<game>.txt  (gitignored)

Usage examples (run from project root):
    python desktop/scripts/source-extract/vpk.py list portal2
    python desktop/scripts/source-extract/vpk.py search portal2 turret --ext .mdl
    python desktop/scripts/source-extract/vpk.py extract portal2
    python desktop/scripts/source-extract/vpk.py extract portal2 --dry-run
"""
import re
import sys
import os
import json
import subprocess
import platform
from pathlib import Path

SCRIPT_DIR    = Path(__file__).parent
DESKTOP_DIR   = SCRIPT_DIR.parent.parent
TOOLS_DIR     = DESKTOP_DIR / 'tools'
EXTRACTED_DIR = DESKTOP_DIR / 'extracted'
GAMES_FILE    = SCRIPT_DIR / 'games.json'
CLI_EXE       = TOOLS_DIR / 'vpkedit' / 'vpkeditcli.exe'
CLI_ZIP       = TOOLS_DIR / 'vpkedit.zip'

ANSI_RE    = re.compile(r'\x1b\[[0-9;]*m')
FILE_RE    = re.compile(r'^(.+?)\s+-\s+[\d.]+\s+(?:b|kb|mb|gb)\s*$', re.IGNORECASE)
BOX_CHARS  = frozenset('│├└─')

MODEL_EXTS_REQUIRED = ['.mdl', '.vvd', '.vtx', '.dx90.vtx']
MODEL_EXTS_OPTIONAL = ['.phy']  # physics shape; not present on all models (e.g. player chars, GLaDOS)


# ── tree parsing ──────────────────────────────────────────────────────────────

def _name_col(line):
    for i, ch in enumerate(line):
        if ch not in BOX_CHARS and ch != ' ':
            return i
    return -1


def parse_vpk_tree(tree_text):
    """
    Convert vpkedit --file-tree output to a sorted flat list of paths.

    The tree uses box-drawing chars (│ ├ └ ─) to show hierarchy. Each level
    adds one three-char segment to the prefix. A file has a trailing
    ' - SIZE UNIT' and directories don't — that's the only distinction needed.

    Depth = (column_of_name - 6) // 3
    Files: parent_dir_depth = depth - 1
    Dirs:  path_stack[depth] = name
    """
    path_stack = {}
    paths = []

    for raw in tree_text.splitlines():
        line = ANSI_RE.sub('', raw)
        if not line.strip():
            continue

        col = _name_col(line)
        if col < 6:
            continue

        name = line[col:].strip()
        if not name:
            continue

        depth = (col - 6) // 3
        m = FILE_RE.match(name)

        if m:
            filename = m.group(1)
            parent = depth - 1
            parts = [path_stack[d] for d in range(parent + 1) if d in path_stack]
            parts.append(filename)
            paths.append('/'.join(parts))
        else:
            path_stack[depth] = name
            for k in list(path_stack):
                if k > depth:
                    del path_stack[k]

    return sorted(paths)


# ── VPK CLI wrapper ───────────────────────────────────────────────────────────

def require_cli():
    # Auto-extracts from the committed zip on first use — no manual setup step.
    # A future desktop app will invoke this pipeline headlessly (run.sh, fire-and-forget);
    # sys.exit() here gives a clean stderr message + nonzero exit for it to detect,
    # rather than requiring an interactive prompt or a pre-flight setup script.
    if CLI_EXE.exists():
        return str(CLI_EXE)
    if not CLI_ZIP.exists():
        sys.exit(f"vpkeditcli not found.\n  Expected: {CLI_EXE}\n  Zip: {CLI_ZIP}")
    import zipfile
    print(f"Extracting vpkedit from {CLI_ZIP}...", file=sys.stderr)
    with zipfile.ZipFile(CLI_ZIP) as z:
        z.extractall(CLI_EXE.parent)
    if not CLI_EXE.exists():
        sys.exit(f"Extraction completed but {CLI_EXE.name} not found inside zip.")
    return str(CLI_EXE)


def vpk_file_tree(vpk_path):
    if platform.system() != 'Windows':
        sys.exit("vpkeditcli.exe is Windows-only. VPK operations require Windows.")
    cli = require_cli()
    result = subprocess.run(
        [cli, '--file-tree', vpk_path],
        capture_output=True, text=True, encoding='utf-8', errors='replace'
    )
    return (result.stdout or '') + (result.stderr or '')


def vpk_extract_file(vpk_path, src, dst):
    cli = require_cli()
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [cli, '--extract', src, '-o', str(dst), vpk_path],
        capture_output=True, text=True
    )
    if result.returncode != 0 and result.stderr:
        print(f"    warn: {result.stderr.strip()}", file=sys.stderr)
    return result.returncode == 0


# ── game config ───────────────────────────────────────────────────────────────

def load_games():
    if not GAMES_FILE.exists():
        sys.exit(f"Games config not found: {GAMES_FILE}")
    with open(GAMES_FILE) as f:
        return json.load(f)


def get_vpk_path(game):
    games = load_games()
    if game not in games:
        sys.exit(f"Unknown game '{game}'. Known: {', '.join(games)}")

    info = games[game]
    system = platform.system()
    key = {'Windows': 'vpk_windows', 'Darwin': 'vpk_macos'}.get(system, 'vpk_linux')
    candidates = info.get(key, [])
    if isinstance(candidates, str):
        candidates = [candidates]

    for path in candidates:
        expanded = os.path.expanduser(path)
        if os.path.exists(expanded):
            return expanded

    sys.exit(
        f"VPK not found for '{game}' on {system}.\nChecked:\n"
        + '\n'.join(f"  {p}" for p in candidates)
    )


# ── flat list cache ───────────────────────────────────────────────────────────

def flat_list_path(game):
    return EXTRACTED_DIR / f'.vpk-list-{game}.txt'


def build_flat_list(game, force=False):
    EXTRACTED_DIR.mkdir(parents=True, exist_ok=True)
    cache = flat_list_path(game)

    if cache.exists() and not force:
        print(f"Cached: {cache}", file=sys.stderr)
        return cache

    vpk_path = get_vpk_path(game)
    print(f"Listing VPK (may take ~30s): {vpk_path}", file=sys.stderr)
    tree = vpk_file_tree(vpk_path)

    print("Parsing tree...", file=sys.stderr)
    paths = parse_vpk_tree(tree)
    cache.write_text('\n'.join(paths), encoding='utf-8')
    print(f"Cached {len(paths):,} paths → {cache}", file=sys.stderr)
    return cache


# ── subcommands ───────────────────────────────────────────────────────────────

def cmd_list(args):
    game = next((a for a in args if not a.startswith('-')), 'portal2')
    force = '--force' in args or '-f' in args
    path = build_flat_list(game, force=force)
    print(path)


def cmd_search(args):
    positional = [a for a in args if not a.startswith('-')]
    if len(positional) < 2:
        sys.exit("Usage: vpk.py search <game> <pattern> [--ext .mdl] [--force]")

    game, pattern = positional[0], positional[1]
    ext_filter = None
    force = '--force' in args or '-f' in args

    i = 0
    while i < len(args):
        if args[i] == '--ext' and i + 1 < len(args):
            ext_filter = args[i + 1].lower()
            i += 2
        else:
            i += 1

    cache = build_flat_list(game, force=force)
    lines = cache.read_text(encoding='utf-8').splitlines()

    pat = re.compile(pattern, re.IGNORECASE)
    results = [l for l in lines if pat.search(l)]
    if ext_filter:
        results = [l for l in results if l.lower().endswith(ext_filter)]

    for r in results:
        print(r)
    print(f"\n{len(results)} result(s)", file=sys.stderr)


def is_extracted(asset):
    if not asset.get('mdl'):
        return False
    mdl_base = re.sub(r'\.mdl$', '', asset['mdl'])
    return all((EXTRACTED_DIR / f"{mdl_base}{ext}").exists() for ext in MODEL_EXTS_REQUIRED)


def cmd_extract(args):
    positional = [a for a in args if not a.startswith('-')]
    game = positional[0] if positional else 'portal2'
    dry_run = '--dry-run' in args
    force_extract = '--force-extract' in args
    manifest_path = None
    models_filter = None

    i = 0
    while i < len(args):
        if args[i] == '--manifest' and i + 1 < len(args):
            manifest_path = args[i + 1]
            i += 2
        elif args[i] == '--models' and i + 1 < len(args):
            models_filter = set(args[i + 1].split(','))
            i += 2
        else:
            i += 1

    if not manifest_path:
        manifest_path = str(SCRIPT_DIR / f'{game}-manifest.json')

    with open(manifest_path) as f:
        manifest = json.load(f)

    vpk_path = get_vpk_path(game)
    EXTRACTED_DIR.mkdir(parents=True, exist_ok=True)

    ok_count = skip_count = fail_count = 0

    for asset in manifest['assets']:
        name = asset['name']

        if models_filter:
            if name not in models_filter:
                continue
        else:
            status = asset.get('status', 'pending')
            if status in ('converted', 'excluded', 'path_unknown'):
                print(f"skip [{status}]: {name}")
                skip_count += 1
                continue

        if not asset.get('mdl'):
            print(f"skip [no mdl]: {name}")
            skip_count += 1
            continue

        if not force_extract and is_extracted(asset):
            print(f"skip [exists]: {name}")
            skip_count += 1
            continue

        print(f"\n=== {name} ===")
        mdl_base = re.sub(r'\.mdl$', '', asset['mdl'])
        asset_ok = True

        for ext in MODEL_EXTS_REQUIRED:
            src = f"{mdl_base}{ext}"
            dst = EXTRACTED_DIR / src
            print(f"  {src}")
            if not dry_run:
                if not vpk_extract_file(vpk_path, src, dst):
                    asset_ok = False

        for ext in MODEL_EXTS_OPTIONAL:
            src = f"{mdl_base}{ext}"
            dst = EXTRACTED_DIR / src
            print(f"  {src}  (optional)")
            if not dry_run:
                vpk_extract_file(vpk_path, src, dst)

        for mat_dir in asset.get('materials_dirs', []):
            mat_dst = EXTRACTED_DIR / mat_dir
            print(f"  {mat_dir}  (dir)")
            if not dry_run:
                mat_dst.mkdir(parents=True, exist_ok=True)
                result = subprocess.run(
                    [require_cli(), '--extract', mat_dir, '-o', str(mat_dst), vpk_path],
                    capture_output=True, text=True
                )
                if result.returncode != 0 and result.stderr:
                    print(f"    warn: {result.stderr.strip()}", file=sys.stderr)

        if asset_ok:
            ok_count += 1
        else:
            fail_count += 1

    print(f"\n{'[dry run] ' if dry_run else ''}Done — ok: {ok_count}  skip: {skip_count}  fail: {fail_count}")


def cmd_locate(args):
    game = next((a for a in args if not a.startswith('-')), 'portal2')
    print(get_vpk_path(game))


def cmd_manifest(args):
    game = next((a for a in args if not a.startswith('-')), 'portal2')
    manifest_path = SCRIPT_DIR / f'{game}-manifest.json'
    with open(manifest_path) as f:
        manifest = json.load(f)
    print(f"{'NAME':<20}  {'STATUS':<12}  MDL PATH")
    print('-' * 70)
    for asset in manifest['assets']:
        status = asset.get('status', 'pending')
        mdl = asset.get('mdl', '—')
        print(f"{asset['name']:<20}  {status:<12}  {mdl}")


COMMANDS = {
    'list': cmd_list,
    'search': cmd_search,
    'extract': cmd_extract,
    'locate': cmd_locate,
    'manifest': cmd_manifest,
}

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(f"Subcommands: {' | '.join(COMMANDS)}")
    COMMANDS[sys.argv[1]](sys.argv[2:])
