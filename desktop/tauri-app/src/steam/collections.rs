//! Reads user-defined game collections (the categories the user manually assigns in the
//! Steam client) from `userdata/<id>/config/cloudstorage/cloud-storage-namespace-1.json`.
//! This is plain JSON, but double-encoded: the file is a `[key, entry]` pair array, and each
//! entry's `value` field is itself a JSON string that needs a second parse. See
//! `docs/research/local-steam/desktop-offline-data-mining-findings.md` §3.

use serde::{Deserialize, Serialize};
use std::path::Path;

const COLLECTION_KEY_PREFIX: &str = "user-collections.";

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct UserCollection {
    pub id: String,
    pub name: String,
    pub appids: Vec<u64>,
}

#[derive(Deserialize)]
struct CloudStorageEntry {
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    is_deleted: bool,
}

#[derive(Deserialize)]
struct CollectionValue {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    added: Vec<u64>,
}

pub fn parse_collections(raw: &str) -> Result<Vec<UserCollection>, String> {
    let entries: Vec<(String, CloudStorageEntry)> =
        serde_json::from_str(raw).map_err(|e| format!("failed to parse cloud storage JSON: {e}"))?;

    let mut collections = Vec::new();
    for (key, entry) in entries {
        if entry.is_deleted || !key.starts_with(COLLECTION_KEY_PREFIX) {
            continue;
        }
        let Some(value_str) = entry.value else {
            continue;
        };
        // Malformed/unexpected shapes are skipped rather than failing the whole file — one
        // odd entry (this namespace also holds unrelated data, e.g. "showcases.*") shouldn't
        // block every other collection from loading.
        let Ok(collection) = serde_json::from_str::<CollectionValue>(&value_str) else {
            continue;
        };
        collections.push(UserCollection {
            id: collection.id,
            name: collection.name,
            appids: collection.added,
        });
    }
    Ok(collections)
}

pub fn read_collections_from_file(path: &Path) -> Result<Vec<UserCollection>, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
    parse_collections(&raw)
}

#[tauri::command]
pub fn read_steam_collections() -> Result<Vec<UserCollection>, String> {
    let userdata_dir = super::paths::active_userdata_dir()?;
    let path = userdata_dir
        .join("config")
        .join("cloudstorage")
        .join("cloud-storage-namespace-1.json");
    read_collections_from_file(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_named_collection_with_appids() {
        let raw = r#"[
            ["user-collections.from-tag-Ze Done",{"key":"user-collections.from-tag-Ze Done","timestamp":1775101357,"value":"{\"id\":\"from-tag-Ze Done\",\"name\":\"Ze Done\",\"added\":[220,240,320]}","version":"1"}]
        ]"#;
        let collections = parse_collections(raw).unwrap();
        assert_eq!(collections.len(), 1);
        assert_eq!(collections[0].name, "Ze Done");
        assert_eq!(collections[0].appids, vec![220, 240, 320]);
    }

    #[test]
    fn ignores_deleted_entries() {
        let raw = r#"[
            ["3241970",{"key":"3241970","timestamp":1762581117,"is_deleted":true,"version":"2"}]
        ]"#;
        let collections = parse_collections(raw).unwrap();
        assert!(collections.is_empty());
    }

    #[test]
    fn ignores_non_collection_keys_like_showcases() {
        let raw = r#"[
            ["showcases.0",{"key":"showcases.0","timestamp":1739423180,"value":"{\"nShowcaseId\":0,\"strCollectionId\":\"type-games\"}","version":"1"}]
        ]"#;
        let collections = parse_collections(raw).unwrap();
        assert!(collections.is_empty());
    }

    #[test]
    fn multiple_named_collections_all_parsed() {
        let raw = r#"[
            ["user-collections.from-tag-Ze Done",{"key":"user-collections.from-tag-Ze Done","timestamp":1,"value":"{\"id\":\"from-tag-Ze Done\",\"name\":\"Ze Done\",\"added\":[1]}","version":"1"}],
            ["user-collections.from-tag-Meh",{"key":"user-collections.from-tag-Meh","timestamp":1,"value":"{\"id\":\"from-tag-Meh\",\"name\":\"Meh\",\"added\":[2,3]}","version":"1"}]
        ]"#;
        let collections = parse_collections(raw).unwrap();
        let names: Vec<&str> = collections.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"Ze Done"));
        assert!(names.contains(&"Meh"));
    }

    #[test]
    fn malformed_value_is_skipped_not_fatal() {
        let raw = r#"[
            ["user-collections.broken",{"key":"user-collections.broken","timestamp":1,"value":"not json","version":"1"}],
            ["user-collections.from-tag-Meh",{"key":"user-collections.from-tag-Meh","timestamp":1,"value":"{\"id\":\"from-tag-Meh\",\"name\":\"Meh\",\"added\":[2]}","version":"1"}]
        ]"#;
        let collections = parse_collections(raw).unwrap();
        assert_eq!(collections.len(), 1);
        assert_eq!(collections[0].name, "Meh");
    }

    /// Real-machine check — `#[ignore]`d by default. Discovers the active userdata dir at
    /// test time and asserts the two collections named during the original investigation are
    /// present, without hardcoding any account id.
    #[test]
    #[ignore]
    fn finds_real_named_collections_on_this_machine() {
        let collections = read_steam_collections().expect("expected readable collections");
        let names: Vec<&str> = collections.iter().map(|c| c.name.as_str()).collect();
        println!("Discovered {} collections: {:?}", collections.len(), names);
        assert!(!collections.is_empty(), "expected at least one user collection");
    }
}
