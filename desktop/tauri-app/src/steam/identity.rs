//! Reads the local user's Steam identity from `config/loginusers.vdf` — steamid64, persona
//! name, and account name, with zero network calls. See
//! `docs/research/local-steam/desktop-offline-data-mining-findings.md` §1.

use serde::Serialize;
use std::path::Path;

use super::keyvalues;
use super::paths;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SteamIdentity {
    pub steamid64: String,
    pub account_name: String,
    pub persona_name: String,
    pub most_recent: bool,
    /// Unix timestamp, seconds - last time this entry was logged into. Used to pick the active
    /// identity when no entry is flagged `most_recent` (see `active_identity`'s doc comment).
    pub timestamp: Option<i64>,
}

pub fn parse_identities(raw: &str) -> Result<Vec<SteamIdentity>, String> {
    let kv = keyvalues::parse(raw).map_err(|e| e.to_string())?;

    let users = kv
        .get("users")
        .and_then(|v| v.as_obj())
        .ok_or_else(|| "loginusers.vdf missing top-level 'users' block".to_string())?;

    let mut identities = Vec::new();
    for (steamid64, entry) in users {
        let account_name = entry
            .get("AccountName")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let persona_name = entry
            .get("PersonaName")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let most_recent = entry
            .get("MostRecent")
            .and_then(|v| v.as_str())
            .map(|s| s == "1")
            .unwrap_or(false);
        let timestamp = entry
            .get("Timestamp")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<i64>().ok());

        identities.push(SteamIdentity {
            steamid64: steamid64.clone(),
            account_name,
            persona_name,
            most_recent,
            timestamp,
        });
    }
    Ok(identities)
}

pub fn read_identity_from_file(path: &Path) -> Result<Vec<SteamIdentity>, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
    parse_identities(&raw)
}

/// The identity the Steam client would treat as "currently logged in":
///
/// 1. The `MostRecent` entry if one is flagged - older Steam clients write this explicitly.
/// 2. Otherwise, whichever entry has the highest `Timestamp` (last-login time) - newer Steam
///    clients have been observed to stop writing `MostRecent` at all once a machine accumulates
///    several logins, leaving every entry unflagged even though `Timestamp` is still present and
///    still updated on each login.
/// 3. Otherwise (no entry has a parseable `Timestamp` either), the only entry if there's exactly
///    one, since a single-account file sometimes has neither field populated.
pub fn active_identity(identities: &[SteamIdentity]) -> Option<&SteamIdentity> {
    identities
        .iter()
        .find(|i| i.most_recent)
        .or_else(|| identities.iter().filter(|i| i.timestamp.is_some()).max_by_key(|i| i.timestamp))
        .or_else(|| if identities.len() == 1 { identities.first() } else { None })
}

#[tauri::command]
pub fn read_steam_identity() -> Result<SteamIdentity, String> {
    let steam_root = paths::find_steam_root().ok_or("Steam install not found")?;
    let login_users_path = steam_root.join("config").join("loginusers.vdf");
    let identities = read_identity_from_file(&login_users_path)?;
    active_identity(&identities)
        .cloned()
        .ok_or_else(|| "no active Steam identity found in loginusers.vdf".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_single_user() {
        let identities = parse_identities(
            r#"
            "users"
            {
                "76561197960265728"
                {
                    "AccountName"		"johndoe"
                    "PersonaName"		"John Doe"
                    "MostRecent"		"1"
                    "Timestamp"		"1700000000"
                }
            }
            "#,
        )
        .unwrap();
        assert_eq!(identities.len(), 1);
        assert_eq!(identities[0].steamid64, "76561197960265728");
        assert_eq!(identities[0].persona_name, "John Doe");
        assert!(identities[0].most_recent);
    }

    #[test]
    fn parses_multiple_users_none_most_recent() {
        let identities = parse_identities(
            r#"
            "users"
            {
                "1" { "AccountName" "a" "PersonaName" "A" "MostRecent" "0" }
                "2" { "AccountName" "b" "PersonaName" "B" "MostRecent" "0" }
            }
            "#,
        )
        .unwrap();
        assert_eq!(identities.len(), 2);
        assert!(active_identity(&identities).is_none());
    }

    #[test]
    fn active_identity_prefers_most_recent_flag() {
        let identities = vec![
            SteamIdentity {
                steamid64: "1".into(),
                account_name: "old".into(),
                persona_name: "Old".into(),
                most_recent: false,
                timestamp: Some(2_000_000_000),
            },
            SteamIdentity {
                steamid64: "2".into(),
                account_name: "new".into(),
                persona_name: "New".into(),
                most_recent: true,
                timestamp: Some(1),
            },
        ];
        assert_eq!(active_identity(&identities).unwrap().steamid64, "2");
    }

    #[test]
    fn active_identity_falls_back_to_sole_entry() {
        let identities = vec![SteamIdentity {
            steamid64: "1".into(),
            account_name: "only".into(),
            persona_name: "Only".into(),
            most_recent: false,
            timestamp: None,
        }];
        assert_eq!(active_identity(&identities).unwrap().steamid64, "1");
    }

    /// Real-world case that motivated this fallback: a machine with several accounts logged in
    /// over time where none carries `MostRecent` at all (observed on a newer Steam client) -
    /// the highest `Timestamp` (most recent login) should win instead of giving up.
    #[test]
    fn active_identity_falls_back_to_highest_timestamp_when_none_flagged_most_recent() {
        let identities = vec![
            SteamIdentity {
                steamid64: "1".into(),
                account_name: "oldest".into(),
                persona_name: "Oldest".into(),
                most_recent: false,
                timestamp: Some(1_699_134_826),
            },
            SteamIdentity {
                steamid64: "2".into(),
                account_name: "newest".into(),
                persona_name: "Newest".into(),
                most_recent: false,
                timestamp: Some(1_785_381_380),
            },
            SteamIdentity {
                steamid64: "3".into(),
                account_name: "middle".into(),
                persona_name: "Middle".into(),
                most_recent: false,
                timestamp: Some(1_759_889_993),
            },
        ];
        assert_eq!(active_identity(&identities).unwrap().steamid64, "2");
    }

    #[test]
    fn missing_users_block_is_a_readable_error() {
        let result = parse_identities(r#""somethingelse" { }"#);
        assert!(result.is_err());
    }

    #[test]
    fn missing_file_is_a_readable_error_not_a_panic() {
        let result = read_identity_from_file(Path::new(r"C:\definitely\not\a\real\path.vdf"));
        assert!(result.is_err());
    }

    /// Real-machine check — `#[ignore]`d by default (see `paths::tests` for the convention).
    /// Discovers the real Steam root and reads the real `loginusers.vdf` at test time; no
    /// account id or persona name is hardcoded into the test itself.
    #[test]
    #[ignore]
    fn reads_real_identity_on_this_machine() {
        let identity = read_steam_identity().expect("expected a readable Steam identity");
        assert!(!identity.steamid64.is_empty());
        assert!(!identity.persona_name.is_empty());
        println!("Discovered identity: {identity:?}");
    }
}
