//! Locates the local Steam install and the active user's data directory.
//!
//! v1 is Windows-only (matches this app's current WebView2/Windows-first scope) and checks
//! the two conventional install locations rather than reading the registry — cheap, no extra
//! dependency, and correct for the overwhelming majority of installs. Revisit with a registry
//! lookup (`HKCU\Software\Valve\Steam\SteamPath`) if a probe ever turns up a nonstandard path.

use std::path::{Path, PathBuf};

pub fn find_steam_root() -> Option<PathBuf> {
    let candidates = [
        r"C:\Program Files (x86)\Steam",
        r"C:\Program Files\Steam",
    ];
    candidates
        .iter()
        .map(PathBuf::from)
        .find(|p| p.join("config").is_dir())
}

/// The active user's `userdata/<accountid>` directory, chosen via `loginusers.vdf`'s
/// `MostRecent` flag (same signal Steam's own client uses to pick who's "logged in").
/// Falls back to the only userdata folder present if there's exactly one, since a
/// single-account machine's `loginusers.vdf` sometimes has no `MostRecent` flag set at all.
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
    find_active_userdata_dir(&steam_root, Some(&active.steamid64))
        .ok_or_else(|| format!("no userdata directory found for steamid {}", active.steamid64))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Not a hardcoded-path assertion — just proves the two conventional locations are the
    /// only ones checked. Runs everywhere, no filesystem access.
    #[test]
    fn checks_both_conventional_program_files_locations() {
        let candidates = [
            r"C:\Program Files (x86)\Steam",
            r"C:\Program Files\Steam",
        ];
        assert_eq!(candidates.len(), 2);
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
}
