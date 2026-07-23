//! Reads the per-account local screenshot index from `userdata/<id>/760/screenshots.vdf` and
//! the actual image bytes it points at, relative to `userdata/<id>/760/remote/` (not `760/`
//! itself - `screenshots.vdf` lives one level above the `remote/` tree its own `filename` values
//! are relative to; a real-machine test caught this the first time it was written the other
//! way). Text KeyValues, same format/parser as `playtime.rs`/`collections.rs` - no new parsing
//! infrastructure needed. See `docs/features/wall-art-framed-posters.md` for the feature this
//! backs and the real on-disk shape this was verified against.

use serde::{Deserialize, Serialize};
use std::path::Path;

use super::keyvalues;

const SCREENSHOTS_SUBDIR: &str = "760";
/// `filename` values inside screenshots.vdf are relative to this, not to SCREENSHOTS_SUBDIR
/// directly - confirmed against a real install: `760/remote/<appid>/screenshots/*.jpg`, with
/// `760/screenshots.vdf` (one level up from `remote/`) storing paths as `<appid>/screenshots/*.jpg`.
const REMOTE_SUBDIR: &str = "remote";

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LocalScreenshot {
    pub appid: u32,
    /// Relative to `userdata/<id>/760/remote/` (e.g. `"1235140/screenshots/20240627104622_1.jpg"`)
    /// - pass to `read_local_screenshot_bytes` to load it.
    pub filename: String,
    pub width: i64,
    pub height: i64,
    /// Unix timestamp, seconds.
    pub creation: i64,
    pub caption: Option<String>,
}

/// VDF text values are always quoted strings, even for numbers - same convention as
/// `playtime.rs::RawAppFields`, parsed to numbers after deserializing.
#[derive(Deserialize, Default)]
struct RawScreenshotFields {
    #[serde(default)]
    filename: Option<String>,
    #[serde(default)]
    width: Option<String>,
    #[serde(default)]
    height: Option<String>,
    #[serde(default)]
    creation: Option<String>,
    #[serde(default)]
    caption: Option<String>,
}

pub fn parse_screenshots(raw: &str) -> Result<Vec<LocalScreenshot>, String> {
    let kv = keyvalues::parse(raw).map_err(|e| e.to_string())?;
    let root = kv
        .get("screenshots")
        .and_then(|v| v.as_obj())
        .ok_or_else(|| "screenshots.vdf missing top-level \"screenshots\" block".to_string())?;

    let mut screenshots = Vec::new();
    for (appid_str, entry) in root {
        // Skips non-numeric keys - real files have a "shortcutnames" sibling block at this
        // same level (non-Steam shortcut games' screenshots), not a real appid.
        let Ok(appid) = appid_str.parse::<u32>() else {
            continue;
        };
        let Some(indexed) = entry.as_obj() else {
            continue;
        };
        for (_, shot) in indexed {
            let fields: RawScreenshotFields =
                serde_json::from_value(shot.to_json_value()).unwrap_or_default();
            let Some(filename) = fields.filename else {
                continue; // malformed entry - skip rather than fail the whole file
            };
            screenshots.push(LocalScreenshot {
                appid,
                filename,
                width: fields.width.and_then(|s| s.parse().ok()).unwrap_or(0),
                height: fields.height.and_then(|s| s.parse().ok()).unwrap_or(0),
                creation: fields.creation.and_then(|s| s.parse().ok()).unwrap_or(0),
                caption: fields.caption,
            });
        }
    }
    Ok(screenshots)
}

pub fn read_screenshots_from_file(path: &Path) -> Result<Vec<LocalScreenshot>, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
    parse_screenshots(&raw)
}

#[tauri::command]
pub fn read_local_screenshots() -> Result<Vec<LocalScreenshot>, String> {
    let userdata_dir = super::paths::active_userdata_dir()?;
    let path = userdata_dir.join(SCREENSHOTS_SUBDIR).join("screenshots.vdf");
    read_screenshots_from_file(&path)
}

/// `filename` must be one returned by `read_local_screenshots` (relative to `760/remote/`,
/// forward-slash-separated) - rejects any path containing `..` so this command can't be used to
/// read arbitrary files outside the screenshots tree, since the argument crosses the JS/Rust
/// boundary.
#[tauri::command]
pub fn read_local_screenshot_bytes(filename: String) -> Result<Vec<u8>, String> {
    if filename.contains("..") {
        return Err(format!("rejected suspicious screenshot filename: {filename}"));
    }
    let userdata_dir = super::paths::active_userdata_dir()?;
    let path = userdata_dir.join(SCREENSHOTS_SUBDIR).join(REMOTE_SUBDIR).join(&filename);
    std::fs::read(&path).map_err(|e| format!("failed to read {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Shaped after the real screenshots.vdf structure confirmed in
    /// docs/features/wall-art-framed-posters.md - two apps, one with two screenshots, plus the
    /// "shortcutnames" sibling block real files always have.
    const SAMPLE: &str = r#"
        "screenshots"
        {
            "440"
            {
                "0"
                {
                    "type"          "1"
                    "filename"      "440/screenshots/20260314233156_1.jpg"
                    "thumbnail"     "440/screenshots/thumbnails/20260314233156_1.jpg"
                    "width"         "2560"
                    "height"        "1600"
                    "gameid"        "440"
                    "creation"      "1773556316"
                    "caption"       "A real match, finally"
                    "Permissions"   "8"
                    "publishedfileid" "3685298695"
                }
            }
            "620"
            {
                "0"
                {
                    "type"      "1"
                    "filename"  "620/screenshots/20251103142944_1.jpg"
                    "width"     "2560"
                    "height"    "1600"
                    "gameid"    "620"
                    "creation"  "1762208984"
                    "Permissions" "2"
                }
                "1"
                {
                    "type"      "1"
                    "filename"  "620/screenshots/20251103142935_1.jpg"
                    "width"     "2560"
                    "height"    "1600"
                    "gameid"    "620"
                    "creation"  "1762208975"
                    "Permissions" "2"
                }
            }
            "shortcutnames"
            {
            }
        }
        "#;

    #[test]
    fn parses_screenshots_grouped_by_appid() {
        let screenshots = parse_screenshots(SAMPLE).unwrap();
        assert_eq!(screenshots.iter().filter(|s| s.appid == 440).count(), 1);
        assert_eq!(screenshots.iter().filter(|s| s.appid == 620).count(), 2);
    }

    #[test]
    fn parses_dimensions_creation_and_optional_caption() {
        let screenshots = parse_screenshots(SAMPLE).unwrap();
        let tf2 = screenshots.iter().find(|s| s.appid == 440).unwrap();
        assert_eq!(tf2.width, 2560);
        assert_eq!(tf2.height, 1600);
        assert_eq!(tf2.creation, 1773556316);
        assert_eq!(tf2.caption.as_deref(), Some("A real match, finally"));
        assert_eq!(tf2.filename, "440/screenshots/20260314233156_1.jpg");

        let portal2 = screenshots.iter().find(|s| s.appid == 620).unwrap();
        assert_eq!(portal2.caption, None);
    }

    #[test]
    fn ignores_the_shortcutnames_sibling_block() {
        let screenshots = parse_screenshots(SAMPLE).unwrap();
        assert_eq!(screenshots.len(), 3);
    }

    #[test]
    fn missing_screenshots_block_is_a_readable_error() {
        let result = parse_screenshots(r#""notscreenshots" { }"#);
        assert!(result.is_err());
    }

    #[test]
    fn rejects_filenames_containing_parent_directory_traversal() {
        let err = read_local_screenshot_bytes("../../../etc/passwd".to_string()).unwrap_err();
        assert!(err.contains("rejected"));
    }

    /// Real-machine check - `#[ignore]`d by default. Discovers identity + userdata dir at test
    /// time rather than hardcoding an account id or any specific game/appid.
    #[test]
    #[ignore]
    fn reads_real_screenshots_on_this_machine() {
        let screenshots = read_local_screenshots().expect("expected readable screenshots.vdf");
        assert!(!screenshots.is_empty(), "expected at least one local screenshot");
        println!("Discovered {} local screenshots", screenshots.len());

        let first = &screenshots[0];
        let bytes = read_local_screenshot_bytes(first.filename.clone())
            .expect("expected to read the first discovered screenshot's bytes");
        assert!(!bytes.is_empty());
        // JPEG magic bytes - every screenshot observed on this machine was a .jpg.
        assert_eq!(&bytes[0..2], &[0xFF, 0xD8], "expected a JPEG file");
        println!("Read {} bytes for {}", bytes.len(), first.filename);
    }
}
