#!/usr/bin/env python3
"""
Scan this machine's installed Steam libraries for Source 1 games and list their
models — without needing a games.json entry for the game first.

Meant to run on a machine that has games this repo doesn't yet know about
(different Source titles, different Steam library layout). Produces one
deterministic JSON report that can be carried back to the primary dev machine
to seed new games.json entries and <game>-manifest.json files, "blindly" —
without that machine needing the game installed at all.

A game is considered a Source 1 candidate if any of its *_dir.vpk files
contains at least one models/*.mdl path — same test the "Adding a new game"
section of README.md has you do by hand for one game at a time; this just
automates it across every installed game.

Windows-only (matches vpk.py — vpkeditcli.exe requires Windows).

Usage (run from project root):
    python desktop/source-extract/scripts/discover_games.py
    python desktop/source-extract/scripts/discover_games.py --out my-report.json
    python desktop/source-extract/scripts/discover_games.py --steam-root "D:/Steam"
"""
import datetime
import json
import platform
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))
from vpk import vpk_file_tree, parse_vpk_tree  # noqa: E402

DEFAULT_STEAM_ROOTS = [
    'C:/Program Files (x86)/Steam',
    'C:/Steam',
    'D:/Steam',
    'D:/SteamLibrary',
    'C:/SteamLibrary',
]

LIBRARY_PATH_RE = re.compile(r'"path"\s+"([^"]+)"', re.IGNORECASE)


def find_steam_roots(extra_root=None):
    roots = []
    if extra_root:
        p = Path(extra_root)
        if p.exists():
            roots.append(p)
        else:
            print(f"warn: --steam-root {extra_root} does not exist, ignoring", file=sys.stderr)
    for candidate in DEFAULT_STEAM_ROOTS:
        p = Path(candidate)
        if p.exists() and p not in roots:
            roots.append(p)
    return roots


def find_library_folders(steam_root):
    """Every Steam library folder reachable from one Steam install, via libraryfolders.vdf."""
    libraries = [steam_root]
    vdf_path = steam_root / 'steamapps' / 'libraryfolders.vdf'
    if not vdf_path.exists():
        return libraries

    text = vdf_path.read_text(encoding='utf-8', errors='replace')
    for raw_path in LIBRARY_PATH_RE.findall(text):
        normalized = raw_path.replace('\\\\', '/').replace('\\', '/')
        p = Path(normalized)
        if p.exists() and p not in libraries:
            libraries.append(p)
    return libraries


def find_vpk_files(library_folder):
    common = library_folder / 'steamapps' / 'common'
    if not common.exists():
        return []
    return sorted(common.glob('*/**/*_dir.vpk'))


def install_dir_for(vpk_path, common_dir):
    """Walk up from a VPK to the game's top-level folder directly under steamapps/common/."""
    current = vpk_path.parent
    while current.parent != common_dir and current.parent != current:
        current = current.parent
    return current


def find_model_paths(vpk_path):
    """Sorted models/*.mdl paths in this VPK, or None if it carries no models at all."""
    tree = vpk_file_tree(str(vpk_path))
    paths = parse_vpk_tree(tree)
    mdl_paths = sorted(
        p for p in paths if p.lower().startswith('models/') and p.lower().endswith('.mdl')
    )
    return mdl_paths or None


def discover(steam_root_override=None):
    games = []
    seen_install_dirs = set()

    for steam_root in find_steam_roots(steam_root_override):
        for library in find_library_folders(steam_root):
            common_dir = library / 'steamapps' / 'common'
            for vpk_path in find_vpk_files(library):
                install_dir = install_dir_for(vpk_path, common_dir)
                if install_dir in seen_install_dirs:
                    continue

                print(f"Inspecting {vpk_path} ...", file=sys.stderr)
                mdl_paths = find_model_paths(vpk_path)
                if mdl_paths is None:
                    continue

                seen_install_dirs.add(install_dir)
                games.append({
                    'install_dir_name': install_dir.name,
                    'vpk_path': str(vpk_path).replace('\\', '/'),
                    'model_count': len(mdl_paths),
                    'models': mdl_paths,
                })

    return {
        'scanned_at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'platform': platform.system(),
        'games': games,
    }


def parse_args(argv):
    out_path = None
    steam_root_override = None
    i = 0
    while i < len(argv):
        if argv[i] == '--out' and i + 1 < len(argv):
            out_path = argv[i + 1]
            i += 2
        elif argv[i] == '--steam-root' and i + 1 < len(argv):
            steam_root_override = argv[i + 1]
            i += 2
        else:
            i += 1
    return out_path, steam_root_override


def main():
    if platform.system() != 'Windows':
        sys.exit('discover_games.py is Windows-only (vpkeditcli.exe requires Windows).')

    out_path, steam_root_override = parse_args(sys.argv[1:])
    report = discover(steam_root_override)

    out_path = Path(out_path) if out_path else SCRIPT_DIR.parent / 'logs' / 'discover-report.json'
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2), encoding='utf-8')

    total_models = sum(g['model_count'] for g in report['games'])
    print(f"\nFound {len(report['games'])} Source 1 game(s), {total_models} model file(s) total.")
    print(f"Report written to {out_path}")
    print('Carry this file to the primary dev machine to seed games.json + a new <game>-manifest.json.')


if __name__ == '__main__':
    main()
