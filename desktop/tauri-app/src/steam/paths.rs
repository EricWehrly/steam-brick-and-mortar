//! Locates the local Steam install and the active user's data directory.
//!
//! `find_steam_root` tries several strategies in order of reliability, stopping at the first
//! candidate that actually looks like a Steam install (has a `config` subdirectory):
//!
//! 1. **Windows registry** (`HKCU\Software\Valve\Steam\SteamPath`, then
//!    `HKLM\SOFTWARE\WOW6432Node\Valve\Steam\InstallPath`) — authoritative when present; the
//!    official installer and the running client both keep this current.
//! 2. **Known default paths per OS** — cheap, no registry access needed, correct for the
//!    common case. Only the Windows entries are exercised by a real machine today; macOS/Linux
//!    entries are included for when this app targets those platforms, per
//!    `docs/features/local-file-investigation.md`'s cross-platform path notes.
//! 3. **Drive-letter scan** (Windows) — the default paths assume `C:`; if that's wrong (Steam
//!    installed to a game drive) and the registry lookup also failed or was blocked, try the
//!    same relative paths against every other present drive letter.
//! 4. **Start Menu shortcut** (Windows) — last resort for a registry that's missing or stale.
//!    Steam's installer creates a Start Menu shortcut whose *working directory* is the Steam
//!    root; parses both the all-users and per-user shortcut locations.
//!
//! None of this replaces a user-provided path. A manual "browse/paste your Steam folder"
//! fallback is tracked as pre-ship (Act 3) follow-up in
//! `docs/plans/desktop-local-data-pipeline-plan.md` for when every strategy here comes up empty.

use std::path::{Path, PathBuf};

pub fn find_steam_root() -> Option<PathBuf> {
    from_registry()
        .or_else(from_default_paths)
        .or_else(from_drive_scan)
        .or_else(from_start_menu_shortcut)
}

fn looks_like_steam_root(candidate: &Path) -> bool {
    candidate.join("config").is_dir()
}

/// Candidate install-relative suffixes checked by both the default-path and drive-scan
/// strategies, so the two stay in sync without duplicating the list.
const WINDOWS_RELATIVE_CANDIDATES: [&str; 2] = [
    r"Program Files (x86)\Steam",
    r"Program Files\Steam",
];

fn from_default_paths() -> Option<PathBuf> {
    let candidates: Vec<PathBuf> = default_path_candidates();
    candidates.into_iter().find(|p| looks_like_steam_root(p))
}

#[cfg(target_os = "windows")]
fn default_path_candidates() -> Vec<PathBuf> {
    WINDOWS_RELATIVE_CANDIDATES
        .iter()
        .map(|rel| PathBuf::from(format!(r"C:\{rel}")))
        .collect()
}

#[cfg(target_os = "macos")]
fn default_path_candidates() -> Vec<PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();
    vec![PathBuf::from(format!(
        "{home}/Library/Application Support/Steam"
    ))]
}

#[cfg(target_os = "linux")]
fn default_path_candidates() -> Vec<PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();
    vec![
        PathBuf::from(format!("{home}/.local/share/Steam")),
        PathBuf::from(format!("{home}/.steam/steam")),
    ]
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn default_path_candidates() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn from_registry() -> Option<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(steam_key) = hkcu.open_subkey(r"Software\Valve\Steam") {
        if let Ok(path) = steam_key.get_value::<String, _>("SteamPath") {
            // Valve stores this with forward slashes even on Windows.
            let candidate = PathBuf::from(path.replace('/', "\\"));
            if looks_like_steam_root(&candidate) {
                return Some(candidate);
            }
        }
    }

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(steam_key) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Valve\Steam") {
        if let Ok(path) = steam_key.get_value::<String, _>("InstallPath") {
            let candidate = PathBuf::from(path.replace('/', "\\"));
            if looks_like_steam_root(&candidate) {
                return Some(candidate);
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn from_registry() -> Option<PathBuf> {
    None
}

#[cfg(target_os = "windows")]
fn from_drive_scan() -> Option<PathBuf> {
    for letter in b'A'..=b'Z' {
        let drive_root = format!("{}:\\", letter as char);
        if !Path::new(&drive_root).is_dir() {
            continue;
        }
        for rel in WINDOWS_RELATIVE_CANDIDATES {
            let candidate = PathBuf::from(format!("{drive_root}{rel}"));
            if looks_like_steam_root(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn from_drive_scan() -> Option<PathBuf> {
    None
}

#[cfg(target_os = "windows")]
fn from_start_menu_shortcut() -> Option<PathBuf> {
    use std::convert::TryFrom;

    let program_data = std::env::var("ProgramData").ok()?;
    let app_data = std::env::var("APPDATA").ok();

    let mut shortcut_paths = vec![PathBuf::from(format!(
        r"{program_data}\Microsoft\Windows\Start Menu\Programs\Steam\Steam.lnk"
    ))];
    if let Some(app_data) = app_data {
        shortcut_paths.push(PathBuf::from(format!(
            r"{app_data}\Microsoft\Windows\Start Menu\Programs\Steam\Steam.lnk"
        )));
    }

    for shortcut_path in shortcut_paths {
        if !shortcut_path.is_file() {
            continue;
        }
        let Ok(lnk) = parselnk::Lnk::try_from(shortcut_path.as_path()) else {
            continue;
        };
        let candidate = lnk
            .working_dir()
            .or_else(|| lnk.link_info.local_base_path.as_ref().and_then(|p| {
                Path::new(p).parent().map(Path::to_path_buf)
            }));
        if let Some(candidate) = candidate {
            if looks_like_steam_root(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn from_start_menu_shortcut() -> Option<PathBuf> {
    None
}

/// The 64-bit-to-32-bit offset baked into every individual (non-anonymous, non-group) SteamID64 -
/// `userdata/<accountid>` directories are named with the 32-bit account id, not the full
/// steamid64 `loginusers.vdf` keys its entries by, so callers must subtract this before looking
/// the directory up.
const STEAMID64_INDIVIDUAL_ACCOUNT_BASE: u64 = 76_561_197_960_265_728;

/// Converts a `loginusers.vdf`-style steamid64 string to the short account id Steam names
/// `userdata` directories with (e.g. `"76561197984589530"` -> `"24323802"`).
fn steamid64_to_account_id(steamid64: &str) -> Option<String> {
    let id: u64 = steamid64.parse().ok()?;
    id.checked_sub(STEAMID64_INDIVIDUAL_ACCOUNT_BASE)
        .map(|account_id| account_id.to_string())
}

/// The active user's `userdata/<accountid>` directory, chosen via `loginusers.vdf`'s
/// `MostRecent` flag (or, failing that, the highest `Timestamp` - see
/// `identity::active_identity`'s doc comment) - the same signal Steam's own client effectively
/// uses to pick who's "logged in". Falls back to the only userdata folder present if there's
/// exactly one, since a single-account machine's `loginusers.vdf` sometimes has neither field
/// populated.
///
/// `most_recent_account_id`, if given, must be the short 32-bit account id (see
/// `steamid64_to_account_id`), not the full steamid64 - that's how the directories are named.
pub fn find_active_userdata_dir(steam_root: &Path, most_recent_account_id: Option<&str>) -> Option<PathBuf> {
    let userdata = steam_root.join("userdata");
    if !userdata.is_dir() {
        return None;
    }

    if let Some(account_id) = most_recent_account_id {
        let candidate = userdata.join(account_id);
        if candidate.is_dir() {
            return Some(candidate);
        }
    }

    let mut entries: Vec<PathBuf> = std::fs::read_dir(&userdata)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();

    if entries.len() == 1 {
        entries.pop()
    } else {
        None
    }
}

/// Discovers the Steam root and the active user's `userdata` directory in one call — the
/// common prerequisite for anything reading per-user local data (playtime, collections).
pub fn active_userdata_dir() -> Result<PathBuf, String> {
    let steam_root = find_steam_root().ok_or("Steam install not found")?;
    let identities = super::identity::read_identity_from_file(
        &steam_root.join("config").join("loginusers.vdf"),
    )?;
    let active = super::identity::active_identity(&identities)
        .ok_or("no active Steam identity found in loginusers.vdf")?;
    let account_id = steamid64_to_account_id(&active.steamid64).ok_or_else(|| {
        format!("could not derive a userdata account id from steamid64 {}", active.steamid64)
    })?;
    find_active_userdata_dir(&steam_root, Some(&account_id))
        .ok_or_else(|| format!("no userdata directory found for steamid {}", active.steamid64))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Not a hardcoded-path assertion — just proves the two conventional locations are the
    /// only ones checked. Runs everywhere, no filesystem access.
    #[test]
    fn checks_both_conventional_program_files_locations() {
        assert_eq!(WINDOWS_RELATIVE_CANDIDATES.len(), 2);
    }

    /// Regression check for a bug caught on a multi-account machine: `userdata` directories are
    /// named with the short 32-bit account id, not the full steamid64 `loginusers.vdf` uses.
    /// Values are real (account, userdata-folder) pairs observed on that machine.
    #[test]
    fn steamid64_to_account_id_matches_real_userdata_folder_names() {
        assert_eq!(steamid64_to_account_id("76561197984589530").as_deref(), Some("24323802"));
        assert_eq!(steamid64_to_account_id("76561198054514251").as_deref(), Some("94248523"));
        assert_eq!(steamid64_to_account_id("76561197980086744").as_deref(), Some("19821016"));
    }

    #[test]
    fn steamid64_to_account_id_rejects_unparseable_or_too_small_input() {
        assert_eq!(steamid64_to_account_id("not-a-number"), None);
        assert_eq!(steamid64_to_account_id("1"), None);
    }

    /// Real-machine check: only meaningful with Steam actually installed, so it's `#[ignore]`d
    /// by default. Run explicitly with `cargo test -- --ignored` on a dev machine that has
    /// Steam installed. Deliberately does not hardcode any account id or userdata path — it
    /// only asserts that *some* Steam root is discoverable, keeping this test committable
    /// without baking in anyone's real Steam account.
    #[test]
    #[ignore]
    fn finds_a_real_steam_root_on_this_machine() {
        let root = find_steam_root().expect("expected a Steam install on this dev machine");
        assert!(root.join("config").join("loginusers.vdf").is_file());
    }

    /// Real-machine check — confirms the registry strategy specifically (not just "some
    /// strategy found it") agrees with whatever `find_steam_root` ultimately returns.
    #[test]
    #[cfg(target_os = "windows")]
    #[ignore]
    fn registry_lookup_matches_overall_discovery_on_this_machine() {
        let from_registry = from_registry().expect("expected a SteamPath registry value");
        let overall = find_steam_root().expect("expected a discoverable Steam root");
        assert_eq!(from_registry, overall);
    }

    /// Real-machine check — confirms the Start Menu `.lnk` strategy specifically resolves to
    /// the same Steam root as the overall chain. This is the strategy this dev machine's
    /// registry lookup normally shadows (registry wins first in `find_steam_root`), so this
    /// test calls `from_start_menu_shortcut()` directly to exercise that code path rather than
    /// relying on it winning the race in `find_steam_root()`.
    ///
    /// Compares via `canonicalize` rather than raw string/`PathBuf` equality: Windows paths are
    /// case-insensitive on disk, and the `.lnk`'s stored path came back lowercased
    /// (`c:\program files (x86)\steam`) while the registry's is properly cased — same
    /// directory, different casing. `canonicalize` resolves both through the filesystem and
    /// normalizes that away, which is the honest way to assert "these point to the same place"
    /// rather than papering over it with a case-insensitive string compare.
    #[test]
    #[cfg(target_os = "windows")]
    #[ignore]
    fn start_menu_shortcut_matches_overall_discovery_on_this_machine() {
        let from_shortcut =
            from_start_menu_shortcut().expect("expected a parseable Steam Start Menu shortcut");
        let overall = find_steam_root().expect("expected a discoverable Steam root");
        assert_eq!(
            from_shortcut.canonicalize().expect("shortcut-derived path should exist"),
            overall.canonicalize().expect("overall discovered path should exist"),
        );
    }
}
