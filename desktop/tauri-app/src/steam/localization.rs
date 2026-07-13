//! Reads Steam's global tag-id-to-name table from `appcache/localization.vdf` — a small
//! plain-text KeyValues file (unlike `appinfo.vdf`, no binary format here) holding every tag
//! name the client currently knows, keyed by the numeric ids `appinfo.vdf`'s `store_tags`
//! references. See `docs/research/local-steam/desktop-offline-data-mining-findings.md` §6.

use std::collections::HashMap;
use std::path::Path;

use super::keyvalues;

pub struct TagNames {
    names_by_id: HashMap<u32, String>,
}

impl TagNames {
    pub fn load(path: &Path) -> Result<Self, String> {
        let raw = std::fs::read_to_string(path)
            .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
        Self::parse(&raw)
    }

    pub fn parse(raw: &str) -> Result<Self, String> {
        let kv = keyvalues::parse(raw).map_err(|e| e.to_string())?;
        let tags = kv
            .path(&["localization", "english", "store_tags"])
            .and_then(|v| v.as_obj())
            .ok_or_else(|| "localization.vdf missing localization/english/store_tags block".to_string())?;

        let mut names_by_id = HashMap::with_capacity(tags.len());
        for (id_str, value) in tags {
            let (Ok(id), Some(name)) = (id_str.parse::<u32>(), value.as_str()) else {
                continue; // skip anything that isn't a plain "id" -> "name" pair
            };
            names_by_id.insert(id, name.to_string());
        }
        Ok(TagNames { names_by_id })
    }

    pub fn resolve(&self, id: u32) -> Option<&str> {
        self.names_by_id.get(&id).map(String::as_str)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
        "localization"
        {
            "english"
            {
                "store_tags"
                {
                    "1663"		"FPS"
                    "3942"		"Sci-fi"
                    "4182"		"Singleplayer"
                }
            }
        }
        "#;

    #[test]
    fn resolves_known_ids() {
        let tags = TagNames::parse(SAMPLE).unwrap();
        assert_eq!(tags.resolve(1663), Some("FPS"));
        assert_eq!(tags.resolve(3942), Some("Sci-fi"));
        assert_eq!(tags.resolve(4182), Some("Singleplayer"));
    }

    #[test]
    fn unknown_id_resolves_to_none() {
        let tags = TagNames::parse(SAMPLE).unwrap();
        assert_eq!(tags.resolve(999999), None);
    }

    #[test]
    fn missing_block_is_a_readable_error() {
        let result = TagNames::parse(r#""somethingelse" { }"#);
        assert!(result.is_err());
    }

    /// Real-machine check — `#[ignore]`d by default. Confirms the real `localization.vdf`
    /// correctly resolves several tag ids known from the original research pass — not
    /// account-specific, this is Valve's own global catalog, same on every install.
    #[test]
    #[ignore]
    fn resolves_real_tags_on_this_machine() {
        let steam_root = super::super::paths::find_steam_root().expect("expected a Steam install");
        let tags = TagNames::load(&steam_root.join("appcache").join("localization.vdf"))
            .expect("expected a readable localization.vdf");
        assert_eq!(tags.resolve(1663), Some("FPS"));
        assert_eq!(tags.resolve(19), Some("Action"));
        assert_eq!(tags.resolve(4182), Some("Singleplayer"));
        println!(
            "Resolved sample tag ids: 1663={:?} 19={:?} 4182={:?}",
            tags.resolve(1663),
            tags.resolve(19),
            tags.resolve(4182)
        );
    }
}
