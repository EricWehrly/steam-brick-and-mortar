//! Reads Steam's own rendered library-art cache from `appcache/librarycache/<appid>/` - see
//! docs/plans/startup-artwork-resolution-plan.md, Root Cause D. Mirrors both on-disk conventions
//! confirmed against a real install:
//!
//! - **legacy (flat)**: `<appid>/library_600x900.jpg`, `<appid>/header.jpg` - no hash, no
//!   subfolder.
//! - **hash-migrated**: `<appid>/<hash40>/library_600x900.jpg`,
//!   `<appid>/<hash40>/library_header.jpg` - one hash-named subfolder per asset "slot", filenames
//!   differ from the flat convention (`library_header.jpg`, not `header.jpg`). The hash is
//!   byte-identical to the hash segment Steam's own CDN URLs use for the same asset (confirmed
//!   against live `store.steampowered.com/api/appdetails` responses and direct CDN requests - see
//!   the plan doc), so callers can build a real CDN URL from it without any network round trip.
//!
//! Only `library` (`library_600x900.jpg`) and `header` slots are wired up - `library_capsule.jpg`
//! (hash-migrated only) is a different asset than the Store API's `capsule_image`/`capsule_imagev5`
//! fields, unverified as anything else, and out of scope; `library_hero`/`logo`/the small root-level
//! icon aren't rendered by anything yet.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Identical filename in both conventions - only `header` differs by convention (see below).
const LIBRARY_FILENAME: &str = "library_600x900.jpg";
const HEADER_FLAT_FILENAME: &str = "header.jpg";
const HEADER_HASHED_FILENAME: &str = "library_header.jpg";

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LocalArtSlot {
    /// Relative to `appcache/librarycache/<appid>/` - pass to `read_local_library_art_bytes`.
    pub relative_path: String,
    /// The hash-migrated convention's subfolder name - lets the caller construct a real CDN URL
    /// without a second disk touch. Absent for the legacy flat convention (nothing to derive one
    /// from).
    pub hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LocalLibraryArtEntry {
    pub appid: u32,
    pub library: Option<LocalArtSlot>,
    pub header: Option<LocalArtSlot>,
}

fn librarycache_dir(steam_root: &Path) -> PathBuf {
    steam_root.join("appcache").join("librarycache")
}

/// Batched discovery - one directory listing pass per candidate appid, no file reads. Only
/// appids with at least one slot found are included in the result; absence is a free, instant
/// "Steam's client never cached this one" signal, not worth a payload entry.
#[tauri::command]
pub fn find_local_library_art(appids: Vec<u32>) -> Result<Vec<LocalLibraryArtEntry>, String> {
    let steam_root = super::paths::find_steam_root().ok_or("Steam install not found")?;
    let base = librarycache_dir(&steam_root);
    Ok(appids
        .into_iter()
        .filter_map(|appid| find_entry(&base, appid))
        .collect())
}

fn find_entry(base: &Path, appid: u32) -> Option<LocalLibraryArtEntry> {
    let appid_dir = base.join(appid.to_string());
    if !appid_dir.is_dir() {
        return None;
    }

    let library = find_slot(&appid_dir, LIBRARY_FILENAME, LIBRARY_FILENAME);
    let header = find_slot(&appid_dir, HEADER_FLAT_FILENAME, HEADER_HASHED_FILENAME);

    if library.is_none() && header.is_none() {
        return None;
    }

    Some(LocalLibraryArtEntry { appid, library, header })
}

/// Checks the legacy flat filename first, then scans hash-named subfolders for the hash-migrated
/// filename - see module doc for the two conventions.
fn find_slot(appid_dir: &Path, flat_filename: &str, hashed_filename: &str) -> Option<LocalArtSlot> {
    let flat_path = appid_dir.join(flat_filename);
    if flat_path.is_file() {
        return Some(LocalArtSlot { relative_path: flat_filename.to_string(), hash: None });
    }

    let entries = fs::read_dir(appid_dir).ok()?;
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(hash) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !is_hash_dirname(hash) {
            continue;
        }
        if path.join(hashed_filename).is_file() {
            return Some(LocalArtSlot {
                relative_path: format!("{hash}/{hashed_filename}"),
                hash: Some(hash.to_string()),
            });
        }
    }
    None
}

/// Steam's asset-revision hashes observed on real installs are 40 lowercase hex characters
/// (SHA1-shaped) - distinguishes an asset-slot subfolder from anything else that might exist
/// under an appid's librarycache folder.
fn is_hash_dirname(name: &str) -> bool {
    name.len() == 40 && name.chars().all(|c| c.is_ascii_hexdigit())
}

/// `relative_path` must be one returned by `find_local_library_art` (forward-slash-separated,
/// relative to `appcache/librarycache/<appid>/`) - rejects any path containing `..` so this
/// command can't be used to escape that folder, same guard `read_local_screenshot_bytes` uses for
/// the same reason.
#[tauri::command]
pub fn read_local_library_art_bytes(appid: u32, relative_path: String) -> Result<Vec<u8>, String> {
    if relative_path.contains("..") {
        return Err(format!("rejected suspicious library art path: {relative_path}"));
    }
    let steam_root = super::paths::find_steam_root().ok_or("Steam install not found")?;
    let path = librarycache_dir(&steam_root).join(appid.to_string()).join(&relative_path);
    fs::read(&path).map_err(|e| format!("failed to read {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_fixture_file(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"fake jpeg bytes").unwrap();
    }

    #[test]
    fn finds_legacy_flat_library_and_header() {
        let dir = TempDir::new().unwrap();
        write_fixture_file(&dir.path().join("440").join(LIBRARY_FILENAME));
        write_fixture_file(&dir.path().join("440").join(HEADER_FLAT_FILENAME));

        let entry = find_entry(dir.path(), 440).unwrap();
        assert_eq!(entry.library, Some(LocalArtSlot {
            relative_path: LIBRARY_FILENAME.to_string(),
            hash: None,
        }));
        assert_eq!(entry.header, Some(LocalArtSlot {
            relative_path: HEADER_FLAT_FILENAME.to_string(),
            hash: None,
        }));
    }

    #[test]
    fn finds_hash_migrated_library_and_header() {
        let dir = TempDir::new().unwrap();
        let library_hash = "b6cabe1940c55119820eee4ed2d0b604bd5b3af4";
        let header_hash = "a157aa8de4bd9070194ddffb27c31636355dca05";
        write_fixture_file(&dir.path().join("2062430").join(library_hash).join(LIBRARY_FILENAME));
        write_fixture_file(&dir.path().join("2062430").join(header_hash).join(HEADER_HASHED_FILENAME));

        let entry = find_entry(dir.path(), 2062430).unwrap();
        assert_eq!(entry.library, Some(LocalArtSlot {
            relative_path: format!("{library_hash}/{LIBRARY_FILENAME}"),
            hash: Some(library_hash.to_string()),
        }));
        assert_eq!(entry.header, Some(LocalArtSlot {
            relative_path: format!("{header_hash}/{HEADER_HASHED_FILENAME}"),
            hash: Some(header_hash.to_string()),
        }));
    }

    #[test]
    fn prefers_flat_over_hash_dir_when_both_somehow_present() {
        let dir = TempDir::new().unwrap();
        let hash = "b6cabe1940c55119820eee4ed2d0b604bd5b3af4";
        write_fixture_file(&dir.path().join("10").join(LIBRARY_FILENAME));
        write_fixture_file(&dir.path().join("10").join(hash).join(LIBRARY_FILENAME));

        let entry = find_entry(dir.path(), 10).unwrap();
        assert_eq!(entry.library.unwrap().hash, None);
    }

    #[test]
    fn returns_none_for_appid_with_no_cached_art_at_all() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("999")).unwrap();
        assert_eq!(find_entry(dir.path(), 999), None);
    }

    #[test]
    fn returns_none_for_appid_dir_that_does_not_exist() {
        let dir = TempDir::new().unwrap();
        assert_eq!(find_entry(dir.path(), 12345), None);
    }

    #[test]
    fn only_header_present_leaves_library_none() {
        let dir = TempDir::new().unwrap();
        write_fixture_file(&dir.path().join("10600").join(HEADER_FLAT_FILENAME));

        let entry = find_entry(dir.path(), 10600).unwrap();
        assert!(entry.library.is_none());
        assert!(entry.header.is_some());
    }

    #[test]
    fn ignores_non_hash_shaped_subfolders() {
        let dir = TempDir::new().unwrap();
        // A stray non-hash directory (e.g. some other Steam-internal folder shape) should never
        // be mistaken for an asset-slot subfolder.
        write_fixture_file(&dir.path().join("55").join("not-a-hash").join(LIBRARY_FILENAME));
        assert_eq!(find_entry(dir.path(), 55), None);
    }

    #[test]
    fn rejects_traversal_in_relative_path() {
        let err = read_local_library_art_bytes(440, "../../../etc/passwd".to_string()).unwrap_err();
        assert!(err.contains("rejected"));
    }

    /// Real-machine check - `#[ignore]`d by default. Discovers the Steam root at test time
    /// rather than hardcoding a path, and only asserts on games that are actually present in a
    /// local `find_local_library_art` result rather than any specific appid.
    #[test]
    #[ignore]
    fn reads_real_library_art_on_this_machine() {
        let steam_root = super::super::paths::find_steam_root().expect("expected a Steam install on this dev machine");
        let base = librarycache_dir(&steam_root);
        let entries: Vec<u32> = fs::read_dir(&base)
            .expect("expected a readable librarycache dir")
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().to_str()?.parse::<u32>().ok())
            .collect();
        assert!(!entries.is_empty(), "expected at least one cached appid on this machine");

        let found = find_local_library_art(entries.clone()).expect("expected a successful scan");
        assert!(!found.is_empty(), "expected at least one appid with a library or header slot");

        let with_library: usize = found.iter().filter(|e| e.library.is_some()).count();
        let with_header: usize = found.iter().filter(|e| e.header.is_some()).count();
        println!(
            "Scanned {} appids: {} had a library slot, {} had a header slot",
            entries.len(), with_library, with_header
        );

        let first_with_library = found.iter().find(|e| e.library.is_some()).expect("expected at least one library slot");
        let slot = first_with_library.library.as_ref().unwrap();
        let bytes = read_local_library_art_bytes(first_with_library.appid, slot.relative_path.clone())
            .expect("expected to read the first discovered library art's bytes");
        assert!(!bytes.is_empty());
        // JPEG magic bytes - every library_600x900.jpg observed on this machine was a .jpg.
        assert_eq!(&bytes[0..2], &[0xFF, 0xD8], "expected a JPEG file");
        println!("Read {} bytes for appid {}", bytes.len(), first_with_library.appid);
    }
}
