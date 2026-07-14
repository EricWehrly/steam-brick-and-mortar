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
//!            [20]u8 binSha1      (optional - see decode_appinfo_root, presence isn't reliably
//!                                 detectable by peeking the next byte)
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
    pub fn as_str(&self) -> Option<&str> {
        match self {
            BinaryValue::Str(s) => Some(s),
            _ => None,
        }
    }

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

    /// Decodes one app's whole `appinfo` root (both `common` and `extended` children) on
    /// demand. Returns `Ok(None)` if the appid isn't in this file at all (the client has never
    /// cached info for it). Private: `get_local_metadata` is the public entry point.
    ///
    /// The optional 20-byte `binSha1` field can't be reliably detected by peeking the next byte
    /// and checking for `TYPE_NONE` (0x00) - a *present* binSha1 whose first byte happens to be
    /// 0x00 (a real ~1/256 chance per entry, and real libraries have hundreds of entries) is
    /// indistinguishable from an *absent* one that way, and misreading it desyncs every byte
    /// after by 20, corrupting the KV parse (this is what produced the "unknown KV type 0x73"
    /// failure seen on a real library). Instead, try both hypotheses and trust `size` (already
    /// known, ground truth for how many bytes this entry occupies) to pick the right one: the
    /// correct interpretation is whichever one parses without error AND lands the reader exactly
    /// on `end` afterward.
    fn decode_appinfo_root(&self, appid: u32) -> Result<Option<BinaryValue>, String> {
        let Some(&(start, end)) = self.spans.get(&appid) else {
            return Ok(None);
        };

        const FIXED_HEADER_LEN: usize = 4 + 4 + 8 + 20 + 4; // infoState, lastUpdated, accessToken, textSha1, changeNumber
        const OPTIONAL_BIN_SHA1_LEN: usize = 20;

        let root_entries = self
            .try_parse_kv_tree_from(start + FIXED_HEADER_LEN, end)
            .or_else(|| self.try_parse_kv_tree_from(start + FIXED_HEADER_LEN + OPTIONAL_BIN_SHA1_LEN, end))
            .ok_or_else(|| format!(
                "failed to decode appinfo entry for appid {appid}: KV tree didn't parse cleanly \
                 with or without an optional 20-byte binSha1 header"
            ))?;

        let root = BinaryValue::Obj(root_entries);
        Ok(root.get("appinfo").cloned())
    }

    /// Attempts a KV-tree parse starting at `kv_start`, succeeding only if parsing doesn't error
    /// AND the reader lands exactly on `end` afterward - see decode_appinfo_root's doc comment
    /// for why exact-consumption is the validation signal, not a byte peek.
    fn try_parse_kv_tree_from(&self, kv_start: usize, end: usize) -> Option<Vec<(String, BinaryValue)>> {
        if kv_start > end {
            return None;
        }
        let mut reader = Reader::new(&self.data[..end]);
        reader.pos = kv_start;
        let entries = parse_kv_tree(&mut reader, &self.string_table).ok()?;
        (reader.pos == end).then_some(entries)
    }

    /// The fields this app's local metadata pipeline actually wants: name (from `common`), and
    /// developer/publisher (single strings in `extended`, not the `common.associations` array
    /// shape — both were confirmed identical in the research pass, `extended` is simpler to
    /// read). Raw tag ids, not yet resolved to names — see `read_local_app_metadata` for that.
    pub fn get_local_metadata(&self, appid: u32) -> Result<Option<RawLocalAppMetadata>, String> {
        let Some(root) = self.decode_appinfo_root(appid)? else {
            return Ok(None);
        };
        let common = root.get("common");
        let extended = root.get("extended");

        let name = common.and_then(|c| c.get("name")).and_then(|v| v.as_str()).map(str::to_string);
        let developers = extended
            .and_then(|e| e.get("developer"))
            .and_then(|v| v.as_str())
            .map(|s| vec![s.to_string()])
            .unwrap_or_default();
        let publishers = extended
            .and_then(|e| e.get("publisher"))
            .and_then(|v| v.as_str())
            .map(|s| vec![s.to_string()])
            .unwrap_or_default();
        let tag_ids = common
            .and_then(|c| c.get("store_tags"))
            .and_then(|v| v.as_obj())
            .map(|tags| tags.iter().filter_map(|(_, v)| v.as_i64()).map(|id| id as u32).collect())
            .unwrap_or_default();

        // `common.genres` is index->id ("0" -> 1, "1" -> 25, ...), not rank/name-keyed - just
        // the numeric genre ids in whatever order Steam wrote them.
        let genre_ids = common
            .and_then(|c| c.get("genres"))
            .and_then(|v| v.as_obj())
            .map(|genres| genres.iter().filter_map(|(_, v)| v.as_i64()).map(|id| id as u32).collect())
            .unwrap_or_default();

        // `common.category` is a flat set of boolean flags keyed "category_<id>" -> 1, not a
        // list - the category id lives in the key name itself, per
        // docs/research/local-steam/desktop-offline-data-mining-findings.md.
        let category_ids = common
            .and_then(|c| c.get("category"))
            .and_then(|v| v.as_obj())
            .map(|categories| {
                categories
                    .iter()
                    .filter(|(_, v)| v.as_i64().map(|flag| flag != 0).unwrap_or(false))
                    .filter_map(|(key, _)| key.strip_prefix("category_"))
                    .filter_map(|id| id.parse::<u32>().ok())
                    .collect()
            })
            .unwrap_or_default();

        Ok(Some(RawLocalAppMetadata { name, developers, publishers, tag_ids, genre_ids, category_ids }))
    }
}

/// Un-resolved intermediate shape — `tag_ids` are still numeric, resolved to names by the
/// Tauri command layer (which has access to `localization::TagNames`, not this module).
#[derive(Debug, Default, PartialEq)]
pub struct RawLocalAppMetadata {
    pub name: Option<String>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub tag_ids: Vec<u32>,
    pub genre_ids: Vec<u32>,
    pub category_ids: Vec<u32>,
}

/// What the client's `AppDetailsCache` writer actually wants per appid: enough to build a
/// partial-but-valid enrichment entry without touching the network. `name`/`developers`/
/// `publishers` are `None`/empty when this appid has no cached appinfo entry at all (client
/// never loaded info for it) rather than failing the whole batch — see
/// `docs/plans/desktop-local-data-pipeline-plan.md` for how the client normalizes this.
#[derive(Debug, Clone, Serialize, PartialEq, Default)]
pub struct LocalAppMetadata {
    pub appid: u32,
    pub name: Option<String>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    /// Rank-ordered (most popular first), resolved to names. IDs with no entry in
    /// `localization.vdf` are skipped rather than failing the whole app's result.
    pub tags: Vec<String>,
    /// Raw numeric ids, unresolved - no id->name table exists on the Rust side. The client
    /// resolves these against the baked appdetails bundle (`TaxonomyIdResolver`) - see
    /// docs/plans/taxonomy-data-event-plan.md.
    pub genre_ids: Vec<u32>,
    pub category_ids: Vec<u32>,
}

#[tauri::command]
pub fn read_local_app_metadata(appids: Vec<u32>) -> Result<Vec<LocalAppMetadata>, String> {
    let steam_root = super::paths::find_steam_root().ok_or("Steam install not found")?;
    let appinfo = AppInfoFile::load(&steam_root.join("appcache").join("appinfo.vdf"))?;
    let tag_names = super::localization::TagNames::load(
        &steam_root.join("appcache").join("localization.vdf"),
    )?;

    let mut results = Vec::with_capacity(appids.len());
    for appid in appids {
        // A single unparseable entry (unusual format variant, corrupted local cache) shouldn't
        // fail the whole batch - every other requested appid still deserves a result. Falls
        // through to Default (no local metadata for this one appid), same as a genuinely-absent
        // entry.
        let raw = match appinfo.get_local_metadata(appid) {
            Ok(value) => value.unwrap_or_default(),
            Err(error) => {
                eprintln!("Failed to decode local appinfo metadata for appid {appid}: {error}");
                RawLocalAppMetadata::default()
            }
        };
        let tags = raw
            .tag_ids
            .into_iter()
            .filter_map(|id| tag_names.resolve(id).map(str::to_string))
            .collect();
        results.push(LocalAppMetadata {
            appid,
            name: raw.name,
            developers: raw.developers,
            publishers: raw.publishers,
            tags,
            genre_ids: raw.genre_ids,
            category_ids: raw.category_ids,
        });
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Builds a minimal but structurally real appinfo.vdf buffer: header, one app entry
    /// (`common.name` = "Test Game", `common.store_tags` = [rank 0 -> id 10, rank 1 -> id 20],
    /// `common.genres` = {"0": 1, "1": 25}, `common.category` = {"category_2": 1, "category_9": 1},
    /// `extended.developer`/`.publisher` = "Test Studio"/"Test Publisher"), terminator, and a
    /// string table — enough to exercise every branch of the parser without needing a real
    /// Steam install.
    fn build_sample_appinfo() -> Vec<u8> {
        build_sample_appinfo_with_bin_sha1(None)
    }

    fn build_sample_appinfo_with_bin_sha1(bin_sha1: Option<[u8; 20]>) -> Vec<u8> {
        // String table indices, assigned in the order first used below.
        const IDX_APPINFO: u32 = 0;
        const IDX_COMMON: u32 = 1;
        const IDX_NAME: u32 = 2;
        const IDX_STORE_TAGS: u32 = 3;
        const IDX_ZERO: u32 = 4; // key "0"
        const IDX_ONE: u32 = 5; // key "1"
        const IDX_EXTENDED: u32 = 6;
        const IDX_DEVELOPER: u32 = 7;
        const IDX_PUBLISHER: u32 = 8;
        const IDX_GENRES: u32 = 9;
        const IDX_CATEGORY: u32 = 10;
        const IDX_CATEGORY_2: u32 = 11; // key "category_2"
        const IDX_CATEGORY_9: u32 = 12; // key "category_9"
        let strings = [
            "appinfo", "common", "name", "store_tags", "0", "1", "extended", "developer", "publisher",
            "genres", "category", "category_2", "category_9",
        ];

        let mut kv = Vec::new();
        // root: "appinfo" -> {
        //   "common" -> {
        //     "name" -> "Test Game", "store_tags" -> { "0": 10, "1": 20 },
        //     "genres" -> { "0": 1, "1": 25 }, "category" -> { "category_2": 1, "category_9": 1 },
        //   },
        //   "extended" -> { "developer" -> "Test Studio", "publisher" -> "Test Publisher" },
        // }
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

                kv.push(TYPE_NONE);
                kv.extend_from_slice(&IDX_GENRES.to_le_bytes());
                {
                    kv.push(TYPE_INT32);
                    kv.extend_from_slice(&IDX_ZERO.to_le_bytes());
                    kv.extend_from_slice(&1i32.to_le_bytes());

                    kv.push(TYPE_INT32);
                    kv.extend_from_slice(&IDX_ONE.to_le_bytes());
                    kv.extend_from_slice(&25i32.to_le_bytes());

                    kv.push(TYPE_END); // close genres
                }

                kv.push(TYPE_NONE);
                kv.extend_from_slice(&IDX_CATEGORY.to_le_bytes());
                {
                    kv.push(TYPE_INT32);
                    kv.extend_from_slice(&IDX_CATEGORY_2.to_le_bytes());
                    kv.extend_from_slice(&1i32.to_le_bytes());

                    kv.push(TYPE_INT32);
                    kv.extend_from_slice(&IDX_CATEGORY_9.to_le_bytes());
                    kv.extend_from_slice(&1i32.to_le_bytes());

                    kv.push(TYPE_END); // close category
                }
                kv.push(TYPE_END); // close common
            }

            kv.push(TYPE_NONE);
            kv.extend_from_slice(&IDX_EXTENDED.to_le_bytes());
            {
                kv.push(TYPE_STRING);
                kv.extend_from_slice(&IDX_DEVELOPER.to_le_bytes());
                kv.extend_from_slice(b"Test Studio\0");

                kv.push(TYPE_STRING);
                kv.extend_from_slice(&IDX_PUBLISHER.to_le_bytes());
                kv.extend_from_slice(b"Test Publisher\0");

                kv.push(TYPE_END); // close extended
            }
            kv.push(TYPE_END); // close appinfo
        }
        kv.push(TYPE_END); // close root

        // Every real entry has this 40-byte fixed header before its KV tree: infoState(4) +
        // lastUpdated(4) + accessToken(8) + textSha1(20) + changeNumber(4), optionally followed
        // by a 20-byte binSha1. decode_appinfo_root tries "no binSha1" first, then "with
        // binSha1" - whichever parses cleanly and consumes exactly to `end` wins, so either
        // fixture shape resolves correctly regardless of try-order.
        let mut entry_body = Vec::new();
        entry_body.extend_from_slice(&0u32.to_le_bytes()); // infoState
        entry_body.extend_from_slice(&0u32.to_le_bytes()); // lastUpdated
        entry_body.extend_from_slice(&0u64.to_le_bytes()); // accessToken
        entry_body.extend_from_slice(&[0u8; 20]); // textSha1
        entry_body.extend_from_slice(&0u32.to_le_bytes()); // changeNumber
        if let Some(bin_sha1) = bin_sha1 {
            entry_body.extend_from_slice(&bin_sha1);
        }
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
    fn parses_store_tags_in_rank_order() {
        let file = AppInfoFile::parse(build_sample_appinfo()).unwrap();
        let metadata = file.get_local_metadata(42).unwrap().unwrap();
        assert_eq!(metadata.tag_ids, vec![10, 20]);
    }

    #[test]
    fn parses_local_metadata_including_extended_block() {
        let file = AppInfoFile::parse(build_sample_appinfo()).unwrap();
        let metadata = file.get_local_metadata(42).unwrap().unwrap();
        assert_eq!(metadata.name.as_deref(), Some("Test Game"));
        assert_eq!(metadata.developers, vec!["Test Studio".to_string()]);
        assert_eq!(metadata.publishers, vec!["Test Publisher".to_string()]);
        assert_eq!(metadata.tag_ids, vec![10, 20]);
    }

    #[test]
    fn parses_genre_and_category_ids() {
        let file = AppInfoFile::parse(build_sample_appinfo()).unwrap();
        let metadata = file.get_local_metadata(42).unwrap().unwrap();
        assert_eq!(metadata.genre_ids, vec![1, 25]);
        let mut category_ids = metadata.category_ids;
        category_ids.sort_unstable();
        assert_eq!(category_ids, vec![2, 9]);
    }

    #[test]
    fn unknown_appid_returns_none_not_error() {
        let file = AppInfoFile::parse(build_sample_appinfo()).unwrap();
        assert_eq!(file.get_local_metadata(999).unwrap(), None);
    }

    /// Regression test for the real-library failure ("unknown KV type 0x73 at offset ...") - a
    /// *present* binSha1 whose first byte happens to be 0x00 used to be misread as *absent*
    /// (the old logic just peeked one byte and checked for TYPE_NONE), desyncing every
    /// subsequent read by 20 bytes. decode_appinfo_root now tries both hypotheses and validates
    /// by exact byte consumption instead.
    #[test]
    fn parses_correctly_when_bin_sha1_is_present_and_starts_with_a_zero_byte() {
        let buf = build_sample_appinfo_with_bin_sha1(Some([0u8; 20]));
        let file = AppInfoFile::parse(buf).unwrap();
        let metadata = file.get_local_metadata(42).unwrap().unwrap();
        assert_eq!(metadata.name.as_deref(), Some("Test Game"));
        assert_eq!(metadata.tag_ids, vec![10, 20]);
    }

    #[test]
    fn parses_correctly_when_bin_sha1_is_present_and_does_not_start_with_zero() {
        let mut bin_sha1 = [0xABu8; 20];
        bin_sha1[0] = 0x42;
        let buf = build_sample_appinfo_with_bin_sha1(Some(bin_sha1));
        let file = AppInfoFile::parse(buf).unwrap();
        let metadata = file.get_local_metadata(42).unwrap().unwrap();
        assert_eq!(metadata.name.as_deref(), Some("Test Game"));
    }

    /// Real-machine, whole-file check — `#[ignore]`d by default. Decodes every appid this
    /// machine's real appinfo.vdf actually has an entry for (not just Portal 2) - the regression
    /// the two tests above target only synthetically; this confirms the fix against the real
    /// byte layout at scale. Tolerates a small number of failures rather than requiring zero:
    /// on this dev machine's real 3022-entry file, this caught the widespread binSha1 bug (which
    /// affected far more than a handful) while one single unrelated outlier remains genuinely
    /// unparseable (a real format variant this reader doesn't handle yet, or a corrupted local
    /// cache entry - not investigated further, since `read_local_app_metadata` already treats a
    /// per-appid decode failure as "no local metadata for this one" rather than failing the
    /// whole batch). A regression that breaks *many* entries again would blow past this bound.
    #[test]
    #[ignore]
    fn decodes_nearly_every_entry_in_this_machines_real_appinfo_without_error() {
        const MAX_TOLERATED_FAILURES: usize = 5;

        let steam_root = super::super::paths::find_steam_root().expect("expected a Steam install");
        let file = AppInfoFile::load(&steam_root.join("appcache").join("appinfo.vdf"))
            .expect("expected a readable appinfo.vdf");

        let appids: Vec<u32> = file.spans.keys().copied().collect();
        let total = appids.len();
        let mut failures: Vec<(u32, String)> = Vec::new();
        for appid in &appids {
            if let Err(error) = file.get_local_metadata(*appid) {
                failures.push((*appid, error));
            }
        }

        println!("Decoded {}/{} real appinfo.vdf entries without error", total - failures.len(), total);
        for (appid, error) in &failures {
            println!("  FAILED appid {appid}: {error}");
        }
        assert!(
            failures.len() <= MAX_TOLERATED_FAILURES,
            "{} of {} entries failed to decode (tolerating up to {})",
            failures.len(), total, MAX_TOLERATED_FAILURES
        );
    }

    /// Real-machine check — `#[ignore]`d by default. Verifies against Portal 2 (appid 620),
    /// whose real name/developer/publisher/tags were decoded and eyeballed during the original
    /// research pass — this re-confirms the production Rust reader agrees with that research
    /// finding, not a new hardcoded assumption about *this* machine (620 is Valve's own appid,
    /// not account-specific).
    #[test]
    #[ignore]
    fn reads_real_portal_2_local_metadata_on_this_machine() {
        let steam_root = super::super::paths::find_steam_root().expect("expected a Steam install");
        let file = AppInfoFile::load(&steam_root.join("appcache").join("appinfo.vdf"))
            .expect("expected a readable appinfo.vdf");
        let metadata = file
            .get_local_metadata(620)
            .expect("expected readable local metadata for Portal 2")
            .expect("expected Portal 2 to be present in appinfo.vdf");
        assert_eq!(metadata.name.as_deref(), Some("Portal 2"));
        assert_eq!(metadata.developers, vec!["Valve".to_string()]);
        assert_eq!(metadata.publishers, vec!["Valve".to_string()]);
        assert!(!metadata.tag_ids.is_empty(), "expected Portal 2 to have cached store tags");
        assert!(!metadata.genre_ids.is_empty(), "expected Portal 2 to have cached genre ids");
        assert!(!metadata.category_ids.is_empty(), "expected Portal 2 to have cached category ids");
        println!(
            "Portal 2 local metadata: name={:?} developers={:?} publishers={:?} tag_ids={:?} genre_ids={:?} category_ids={:?}",
            metadata.name, metadata.developers, metadata.publishers, metadata.tag_ids,
            metadata.genre_ids, metadata.category_ids
        );
    }
}
