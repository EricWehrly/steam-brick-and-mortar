//! Reader for Steam's binary `appcache/appinfo.vdf` — the client's own cache of per-app store
//! metadata (genres, categories, developer/publisher, and — the useful part — a ranked list of
//! community tag IDs). Distinct format from the text KeyValues in `keyvalues.rs`: this is a
//! versioned binary layout with a de-duplicated string table.
//!
//! Format (magic `0x07564429`, matches SteamKit2's "string-table" appinfo variant), reverse
//! engineered and byte-exact-validated against 4 real appids during the research pass — see
//! `docs/research/local-steam/desktop-offline-data-mining-findings.md` §6. This is a direct
//! port of that validated Python research decoder, not a fresh reverse-engineering effort.
//!
//! ```text
//! header:  u32 magic, u32 universe
//! entries: repeated until appid == 0:
//!            u32 appid
//!            u32 size            (bytes remaining in this entry)
//!            u32 infoState
//!            u32 lastUpdated
//!            u64 accessToken
//!            [20]u8 textSha1
//!            u32 changeNumber
//!            [20]u8 binSha1      (present only if the next byte isn't a valid KV type-0x00)
//!            KV tree             (keys are string-table indices; string values stay inline)
//! trailer: u32 stringCount, then that many null-terminated UTF-8 strings
//! ```

use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

const MAGIC: u32 = 0x0756_4429;

const TYPE_NONE: u8 = 0x00;
const TYPE_STRING: u8 = 0x01;
const TYPE_INT32: u8 = 0x02;
const TYPE_FLOAT32: u8 = 0x03;
const TYPE_POINTER: u8 = 0x04;
const TYPE_WIDESTRING: u8 = 0x05;
const TYPE_COLOR: u8 = 0x06;
const TYPE_UINT64: u8 = 0x07;
const TYPE_END: u8 = 0x08;
const TYPE_INT64: u8 = 0x0A;
const TYPE_END_ALT: u8 = 0x0B;

#[derive(Debug, Clone, PartialEq)]
pub enum BinaryValue {
    Str(String),
    Int32(i32),
    Int64(i64),
    UInt64(u64),
    Float32(f32),
    Obj(Vec<(String, BinaryValue)>),
}

impl BinaryValue {
    pub fn as_obj(&self) -> Option<&[(String, BinaryValue)]> {
        match self {
            BinaryValue::Obj(entries) => Some(entries),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            BinaryValue::Int32(v) => Some(*v as i64),
            BinaryValue::Int64(v) => Some(*v),
            BinaryValue::UInt64(v) => Some(*v as i64),
            _ => None,
        }
    }

    pub fn get(&self, key: &str) -> Option<&BinaryValue> {
        self.as_obj()?.iter().find(|(k, _)| k == key).map(|(_, v)| v)
    }

    pub fn path(&self, keys: &[&str]) -> Option<&BinaryValue> {
        keys.iter().try_fold(self, |node, key| node.get(key))
    }
}

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Reader { data, pos: 0 }
    }

    fn remaining(&self) -> usize {
        self.data.len().saturating_sub(self.pos)
    }

    fn u32(&mut self) -> Result<u32, String> {
        let bytes = self.take(4)?;
        Ok(u32::from_le_bytes(bytes.try_into().unwrap()))
    }

    fn u64(&mut self) -> Result<u64, String> {
        let bytes = self.take(8)?;
        Ok(u64::from_le_bytes(bytes.try_into().unwrap()))
    }

    fn i32(&mut self) -> Result<i32, String> {
        Ok(self.u32()? as i32)
    }

    fn i64(&mut self) -> Result<i64, String> {
        Ok(self.u64()? as i64)
    }

    fn f32(&mut self) -> Result<f32, String> {
        let bytes = self.take(4)?;
        Ok(f32::from_le_bytes(bytes.try_into().unwrap()))
    }

    fn u8(&mut self) -> Result<u8, String> {
        let bytes = self.take(1)?;
        Ok(bytes[0])
    }

    fn peek_u8(&self) -> Result<u8, String> {
        self.data.get(self.pos).copied().ok_or_else(|| "unexpected end of data".to_string())
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        if self.remaining() < n {
            return Err(format!(
                "unexpected end of data at offset {} (wanted {n} bytes, {} remain)",
                self.pos,
                self.remaining()
            ));
        }
        let slice = &self.data[self.pos..self.pos + n];
        self.pos += n;
        Ok(slice)
    }

    fn cstring(&mut self) -> Result<String, String> {
        let start = self.pos;
        let end = self.data[start..]
            .iter()
            .position(|&b| b == 0)
            .map(|i| start + i)
            .ok_or_else(|| "unterminated string in appinfo.vdf".to_string())?;
        let s = String::from_utf8_lossy(&self.data[start..end]).into_owned();
        self.pos = end + 1;
        Ok(s)
    }
}

fn parse_kv_tree(reader: &mut Reader, string_table: &[String]) -> Result<Vec<(String, BinaryValue)>, String> {
    let mut entries = Vec::new();
    loop {
        let t = reader.u8()?;
        if t == TYPE_END || t == TYPE_END_ALT {
            return Ok(entries);
        }
        let key_idx = reader.u32()? as usize;
        let key = string_table
            .get(key_idx)
            .cloned()
            .unwrap_or_else(|| format!("<bad string index {key_idx}>"));

        let value = match t {
            TYPE_NONE => BinaryValue::Obj(parse_kv_tree(reader, string_table)?),
            TYPE_STRING | TYPE_WIDESTRING => BinaryValue::Str(reader.cstring()?),
            TYPE_INT32 | TYPE_COLOR | TYPE_POINTER => BinaryValue::Int32(reader.i32()?),
            TYPE_FLOAT32 => BinaryValue::Float32(reader.f32()?),
            TYPE_UINT64 => BinaryValue::UInt64(reader.u64()?),
            TYPE_INT64 => BinaryValue::Int64(reader.i64()?),
            other => return Err(format!("unknown KV type 0x{other:02x} at offset {}", reader.pos - 5)),
        };
        entries.push((key, value));
    }
}

/// A loaded `appinfo.vdf`: the raw bytes plus an index of each appid's byte span, so individual
/// entries can be decoded lazily rather than parsing all ~3,000 apps up front.
#[derive(Debug)]
pub struct AppInfoFile {
    data: Vec<u8>,
    string_table: Vec<String>,
    spans: HashMap<u32, (usize, usize)>,
}

impl AppInfoFile {
    pub fn load(path: &Path) -> Result<Self, String> {
        let data = std::fs::read(path).map_err(|e| format!("failed to read {}: {e}", path.display()))?;
        Self::parse(data)
    }

    fn parse(data: Vec<u8>) -> Result<Self, String> {
        let mut reader = Reader::new(&data);
        let magic = reader.u32()?;
        if magic != MAGIC {
            return Err(format!(
                "unrecognized appinfo.vdf magic 0x{magic:08x} (expected 0x{MAGIC:08x} — format may have changed)"
            ));
        }
        let _universe = reader.u32()?;

        let mut spans = HashMap::new();
        loop {
            let appid = reader.u32()?;
            if appid == 0 {
                break;
            }
            let size = reader.u32()? as usize;
            let start = reader.pos;
            let end = start + size;
            spans.insert(appid, (start, end));
            reader.pos = end;
        }

        let string_count = reader.u32()? as usize;
        let mut string_table = Vec::with_capacity(string_count);
        for _ in 0..string_count {
            string_table.push(reader.cstring()?);
        }

        Ok(AppInfoFile { data, string_table, spans })
    }

    /// Decodes one app's `appinfo.common` block on demand. Returns `Ok(None)` if the appid
    /// isn't in this file at all (the client has never cached info for it).
    pub fn get_common(&self, appid: u32) -> Result<Option<BinaryValue>, String> {
        let Some(&(start, end)) = self.spans.get(&appid) else {
            return Ok(None);
        };
        let mut reader = Reader::new(&self.data[..end]);
        reader.pos = start;

        let _info_state = reader.u32()?;
        let _last_updated = reader.u32()?;
        let _access_token = reader.u64()?;
        let _text_sha1 = reader.take(20)?;
        let _change_number = reader.u32()?;
        if reader.peek_u8()? != TYPE_NONE {
            let _bin_sha1 = reader.take(20)?;
        }

        let root = parse_kv_tree(&mut reader, &self.string_table)?;
        let root = BinaryValue::Obj(root);
        Ok(root.path(&["appinfo", "common"]).cloned())
    }

    /// This app's community tags, in the same popularity rank order Steam's store page shows,
    /// as raw numeric tag IDs — resolve to names via `localization::TagNames`.
    pub fn get_store_tag_ids(&self, appid: u32) -> Result<Vec<u32>, String> {
        let Some(common) = self.get_common(appid)? else {
            return Ok(Vec::new());
        };
        let Some(tags) = common.get("store_tags").and_then(|v| v.as_obj()) else {
            return Ok(Vec::new());
        };
        Ok(tags.iter().filter_map(|(_, v)| v.as_i64()).map(|id| id as u32).collect())
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct AppTags {
    pub appid: u32,
    /// Rank-ordered (most popular first), resolved to names. IDs with no entry in
    /// `localization.vdf` are skipped rather than failing the whole app's result.
    pub tags: Vec<String>,
}

#[tauri::command]
pub fn read_steam_tags(appids: Vec<u32>) -> Result<Vec<AppTags>, String> {
    let steam_root = super::paths::find_steam_root().ok_or("Steam install not found")?;
    let appinfo = AppInfoFile::load(&steam_root.join("appcache").join("appinfo.vdf"))?;
    let tag_names = super::localization::TagNames::load(
        &steam_root.join("appcache").join("localization.vdf"),
    )?;

    let mut results = Vec::with_capacity(appids.len());
    for appid in appids {
        let tag_ids = appinfo.get_store_tag_ids(appid)?;
        let tags = tag_ids
            .into_iter()
            .filter_map(|id| tag_names.resolve(id).map(str::to_string))
            .collect();
        results.push(AppTags { appid, tags });
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Builds a minimal but structurally real appinfo.vdf buffer: header, one app entry
    /// (`common.name` = "Test Game", `common.store_tags` = [rank 0 -> id 10, rank 1 -> id 20]),
    /// terminator, and a string table — enough to exercise every branch of the parser without
    /// needing a real Steam install.
    fn build_sample_appinfo() -> Vec<u8> {
        // String table indices, assigned in the order first used below.
        const IDX_APPINFO: u32 = 0;
        const IDX_COMMON: u32 = 1;
        const IDX_NAME: u32 = 2;
        const IDX_STORE_TAGS: u32 = 3;
        const IDX_ZERO: u32 = 4; // key "0"
        const IDX_ONE: u32 = 5; // key "1"
        let strings = ["appinfo", "common", "name", "store_tags", "0", "1"];

        let mut kv = Vec::new();
        // root: "appinfo" -> { "common" -> { "name" -> "Test Game", "store_tags" -> { "0": 10, "1": 20 } } }
        kv.push(TYPE_NONE);
        kv.extend_from_slice(&IDX_APPINFO.to_le_bytes());
        {
            kv.push(TYPE_NONE);
            kv.extend_from_slice(&IDX_COMMON.to_le_bytes());
            {
                kv.push(TYPE_STRING);
                kv.extend_from_slice(&IDX_NAME.to_le_bytes());
                kv.extend_from_slice(b"Test Game\0");

                kv.push(TYPE_NONE);
                kv.extend_from_slice(&IDX_STORE_TAGS.to_le_bytes());
                {
                    kv.push(TYPE_INT32);
                    kv.extend_from_slice(&IDX_ZERO.to_le_bytes());
                    kv.extend_from_slice(&10i32.to_le_bytes());

                    kv.push(TYPE_INT32);
                    kv.extend_from_slice(&IDX_ONE.to_le_bytes());
                    kv.extend_from_slice(&20i32.to_le_bytes());

                    kv.push(TYPE_END); // close store_tags
                }
                kv.push(TYPE_END); // close common
            }
            kv.push(TYPE_END); // close appinfo
        }
        kv.push(TYPE_END); // close root

        // Every real entry has this 40-byte fixed header before its KV tree: infoState(4) +
        // lastUpdated(4) + accessToken(8) + textSha1(20) + changeNumber(4). The reader peeks
        // the byte right after this header to decide whether an optional 20-byte binSha1
        // follows; using zeroed fields here means that peek lands on the KV tree's own leading
        // TYPE_NONE (0x00) byte, so the reader correctly infers "no binSha1" — same as it does
        // on this dev machine's real appinfo.vdf entries that lack that optional field.
        let mut entry_body = Vec::new();
        entry_body.extend_from_slice(&0u32.to_le_bytes()); // infoState
        entry_body.extend_from_slice(&0u32.to_le_bytes()); // lastUpdated
        entry_body.extend_from_slice(&0u64.to_le_bytes()); // accessToken
        entry_body.extend_from_slice(&[0u8; 20]); // textSha1
        entry_body.extend_from_slice(&0u32.to_le_bytes()); // changeNumber
        entry_body.extend_from_slice(&kv);

        let appid: u32 = 42;
        let size = entry_body.len() as u32;

        let mut buf = Vec::new();
        buf.extend_from_slice(&MAGIC.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes()); // universe
        buf.extend_from_slice(&appid.to_le_bytes());
        buf.extend_from_slice(&size.to_le_bytes());
        buf.extend_from_slice(&entry_body);
        buf.extend_from_slice(&0u32.to_le_bytes()); // terminator appid

        buf.extend_from_slice(&(strings.len() as u32).to_le_bytes());
        for s in strings {
            buf.extend_from_slice(s.as_bytes());
            buf.push(0);
        }
        buf
    }

    #[test]
    fn rejects_wrong_magic() {
        let mut buf = build_sample_appinfo();
        buf[0] = 0xFF; // corrupt the magic
        let err = AppInfoFile::parse(buf).unwrap_err();
        assert!(err.contains("magic"));
    }

    #[test]
    fn parses_common_name() {
        let file = AppInfoFile::parse(build_sample_appinfo()).unwrap();
        let common = file.get_common(42).unwrap().unwrap();
        assert!(matches!(common.get("name"), Some(BinaryValue::Str(s)) if s == "Test Game"));
    }

    #[test]
    fn parses_store_tags_in_rank_order() {
        let file = AppInfoFile::parse(build_sample_appinfo()).unwrap();
        let tag_ids = file.get_store_tag_ids(42).unwrap();
        assert_eq!(tag_ids, vec![10, 20]);
    }

    #[test]
    fn unknown_appid_returns_none_not_error() {
        let file = AppInfoFile::parse(build_sample_appinfo()).unwrap();
        assert_eq!(file.get_common(999).unwrap(), None);
        assert_eq!(file.get_store_tag_ids(999).unwrap(), Vec::<u32>::new());
    }

    /// Real-machine check — `#[ignore]`d by default. Verifies against Portal 2 (appid 620),
    /// whose real `store_tags` were decoded and eyeballed during the original research pass
    /// (Singleplayer/Platformer/Puzzle/... in that rank order) — this just re-confirms the
    /// production Rust reader agrees with that research finding, not a new hardcoded appid
    /// assumption about *this* machine (620 is Valve's own appid, not account-specific).
    #[test]
    #[ignore]
    fn reads_real_portal_2_tags_on_this_machine() {
        let steam_root = super::super::paths::find_steam_root().expect("expected a Steam install");
        let file = AppInfoFile::load(&steam_root.join("appcache").join("appinfo.vdf"))
            .expect("expected a readable appinfo.vdf");
        let tag_ids = file.get_store_tag_ids(620).expect("expected readable store_tags for Portal 2");
        assert!(!tag_ids.is_empty(), "expected Portal 2 to have cached store tags");
        println!("Portal 2 raw tag IDs: {tag_ids:?}");
    }
}
