//! Reads per-app playtime and last-played timestamps from
//! `userdata/<id>/config/localconfig.vdf` — same fields the ownership API's
//! `playtime_forever` / `rtime_last_played` return, sourced offline. See
//! `docs/research/local-steam/desktop-offline-data-mining-findings.md` §2.

use serde::Serialize;
use std::path::Path;

use super::keyvalues;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct AppPlaytime {
    pub appid: u32,
    /// Unix timestamp, seconds. `None` if the app has an entry but was never launched.
    pub last_played: Option<i64>,
    /// Minutes, matching the ownership API's `playtime_forever` unit.
    pub playtime_minutes: Option<u32>,
}

const CONFIG_STORE_PATH: [&str; 5] = ["UserLocalConfigStore", "Software", "Valve", "Steam", "apps"];

pub fn parse_playtimes(raw: &str) -> Result<Vec<AppPlaytime>, String> {
    let kv = keyvalues::parse(raw).map_err(|e| e.to_string())?;

    let apps = kv
        .path(&CONFIG_STORE_PATH)
        .and_then(|v| v.as_obj())
        .ok_or_else(|| "localconfig.vdf missing Software/Valve/Steam/apps block".to_string())?;

    let mut playtimes = Vec::new();
    for (appid_str, entry) in apps {
        let Ok(appid) = appid_str.parse::<u32>() else {
            continue; // skip non-numeric keys if any ever show up here
        };
        let last_played = entry
            .get("LastPlayed")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<i64>().ok());
        let playtime_minutes = entry
            .get("Playtime")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u32>().ok());

        if last_played.is_none() && playtime_minutes.is_none() {
            continue; // entry exists for another reason (e.g. only a "cloud" sub-block)
        }

        playtimes.push(AppPlaytime {
            appid,
            last_played,
            playtime_minutes,
        });
    }
    Ok(playtimes)
}

pub fn read_playtimes_from_file(path: &Path) -> Result<Vec<AppPlaytime>, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
    parse_playtimes(&raw)
}

#[tauri::command]
pub fn read_steam_playtimes() -> Result<Vec<AppPlaytime>, String> {
    let userdata_dir = super::paths::active_userdata_dir()?;
    let path = userdata_dir.join("config").join("localconfig.vdf");
    read_playtimes_from_file(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
        "UserLocalConfigStore"
        {
            "Software"
            {
                "Valve"
                {
                    "Steam"
                    {
                        "apps"
                        {
                            "7"
                            {
                                "cloud"
                                {
                                    "last_sync_state" "synchronized"
                                }
                            }
                            "92"
                            {
                                "LastPlayed" "1358150400"
                                "Playtime" "13"
                            }
                            "440"
                            {
                                "LastPlayed" "1415156113"
                                "Playtime" "5247"
                            }
                        }
                    }
                }
            }
        }
        "#;

    #[test]
    fn parses_playtime_and_last_played() {
        let playtimes = parse_playtimes(SAMPLE).unwrap();
        let tf2 = playtimes.iter().find(|p| p.appid == 440).unwrap();
        assert_eq!(tf2.last_played, Some(1415156113));
        assert_eq!(tf2.playtime_minutes, Some(5247));
    }

    #[test]
    fn skips_entries_with_no_playtime_signal() {
        // appid 7 only has a "cloud" sub-block, no LastPlayed/Playtime — shouldn't appear
        let playtimes = parse_playtimes(SAMPLE).unwrap();
        assert!(!playtimes.iter().any(|p| p.appid == 7));
        assert_eq!(playtimes.len(), 2);
    }

    #[test]
    fn missing_apps_block_is_a_readable_error() {
        let result = parse_playtimes(r#""UserLocalConfigStore" { "Broadcast" { } }"#);
        assert!(result.is_err());
    }

    /// Real-machine check — `#[ignore]`d by default. Discovers identity + userdata dir at
    /// test time rather than hardcoding an account id, then asserts at least one app has a
    /// playtime signal (true for any account that has launched at least one game).
    #[test]
    #[ignore]
    fn reads_real_playtimes_on_this_machine() {
        let playtimes = read_steam_playtimes().expect("expected readable playtime data");
        assert!(!playtimes.is_empty(), "expected at least one app with playtime data");
        println!("Discovered {} apps with playtime data", playtimes.len());
    }
}
