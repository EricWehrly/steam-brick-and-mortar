//! Minimal parser for Valve's text KeyValues format ("VDF") — the format behind
//! `loginusers.vdf`, `localconfig.vdf`, `libraryfolders.vdf`, `appmanifest_*.acf`, and
//! `localization.vdf`. Distinct from binary appinfo.vdf, which needs its own reader.
//!
//! Grammar handled: quoted `"key" "value"` pairs, quoted `"key" { ... }` nested blocks,
//! `//` line comments, and backslash escapes inside quoted strings. Conditional suffixes
//! like `[$WIN32]` (used in a handful of Valve files, not the ones this app reads) are not
//! supported and will produce a parse error if encountered.

use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum KeyValue {
    Str(String),
    Obj(Vec<(String, KeyValue)>),
}

impl KeyValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            KeyValue::Str(s) => Some(s),
            KeyValue::Obj(_) => None,
        }
    }

    pub fn as_obj(&self) -> Option<&[(String, KeyValue)]> {
        match self {
            KeyValue::Obj(entries) => Some(entries),
            KeyValue::Str(_) => None,
        }
    }

    /// First child with a matching key (case-insensitive, matching Steam's own tooling).
    pub fn get(&self, key: &str) -> Option<&KeyValue> {
        self.as_obj()?
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(key))
            .map(|(_, v)| v)
    }

    /// Convenience for chained lookups: `root.path(&["users", steamid, "PersonaName"])`.
    pub fn path(&self, keys: &[&str]) -> Option<&KeyValue> {
        keys.iter().try_fold(self, |node, key| node.get(key))
    }
}

#[derive(Debug)]
pub struct ParseError(pub String);

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "KeyValues parse error: {}", self.0)
    }
}

impl std::error::Error for ParseError {}

pub fn parse(input: &str) -> Result<KeyValue, ParseError> {
    let mut tokens = Tokenizer::new(input);
    let root = parse_object(&mut tokens)?;
    Ok(KeyValue::Obj(root))
}

fn parse_object(tokens: &mut Tokenizer) -> Result<Vec<(String, KeyValue)>, ParseError> {
    let mut entries = Vec::new();
    loop {
        let key = match tokens.next_token()? {
            None => return Ok(entries),
            Some(Token::CloseBrace) => return Ok(entries),
            Some(Token::Str(s)) => s,
            Some(Token::OpenBrace) => {
                return Err(ParseError("unexpected '{' where a key was expected".into()))
            }
        };

        match tokens.next_token()? {
            Some(Token::Str(value)) => entries.push((key, KeyValue::Str(value))),
            Some(Token::OpenBrace) => {
                let child = parse_object(tokens)?;
                entries.push((key, KeyValue::Obj(child)));
            }
            Some(Token::CloseBrace) | None => {
                return Err(ParseError(format!("missing value for key '{key}'")))
            }
        }
    }
}

enum Token {
    Str(String),
    OpenBrace,
    CloseBrace,
}

struct Tokenizer<'a> {
    chars: std::iter::Peekable<std::str::Chars<'a>>,
}

impl<'a> Tokenizer<'a> {
    fn new(input: &'a str) -> Self {
        Tokenizer {
            chars: input.chars().peekable(),
        }
    }

    fn skip_whitespace_and_comments(&mut self) {
        loop {
            match self.chars.peek() {
                Some(c) if c.is_whitespace() => {
                    self.chars.next();
                }
                Some('/') => {
                    let mut lookahead = self.chars.clone();
                    lookahead.next();
                    if lookahead.peek() == Some(&'/') {
                        for c in self.chars.by_ref() {
                            if c == '\n' {
                                break;
                            }
                        }
                    } else {
                        return;
                    }
                }
                _ => return,
            }
        }
    }

    fn next_token(&mut self) -> Result<Option<Token>, ParseError> {
        self.skip_whitespace_and_comments();
        match self.chars.peek() {
            None => Ok(None),
            Some('{') => {
                self.chars.next();
                Ok(Some(Token::OpenBrace))
            }
            Some('}') => {
                self.chars.next();
                Ok(Some(Token::CloseBrace))
            }
            Some('"') => Ok(Some(Token::Str(self.read_quoted_string()?))),
            Some(c) => Err(ParseError(format!("unexpected character '{c}'"))),
        }
    }

    fn read_quoted_string(&mut self) -> Result<String, ParseError> {
        self.chars.next(); // consume opening quote
        let mut out = String::new();
        loop {
            match self.chars.next() {
                None => return Err(ParseError("unterminated quoted string".into())),
                Some('"') => return Ok(out),
                Some('\\') => match self.chars.next() {
                    Some('n') => out.push('\n'),
                    Some('t') => out.push('\t'),
                    Some(other) => out.push(other),
                    None => return Err(ParseError("unterminated escape sequence".into())),
                },
                Some(c) => out.push(c),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_flat_pairs() {
        let kv = parse(r#""AccountName"  "johndoe" "PersonaName" "John Doe""#).unwrap();
        assert_eq!(kv.get("AccountName").and_then(|v| v.as_str()), Some("johndoe"));
        assert_eq!(kv.get("PersonaName").and_then(|v| v.as_str()), Some("John Doe"));
    }

    #[test]
    fn parses_nested_objects_and_path() {
        let kv = parse(
            r#"
            "users"
            {
                "76561197960265728"
                {
                    "AccountName" "johndoe"
                    "MostRecent" "1"
                }
            }
            "#,
        )
        .unwrap();
        let name = kv.path(&["users", "76561197960265728", "AccountName"]);
        assert_eq!(name.and_then(|v| v.as_str()), Some("johndoe"));
    }

    #[test]
    fn key_lookup_is_case_insensitive() {
        let kv = parse(r#""Playtime" "13""#).unwrap();
        assert_eq!(kv.get("playtime").and_then(|v| v.as_str()), Some("13"));
    }

    #[test]
    fn skips_line_comments() {
        let kv = parse(
            r#"
            // this is a comment
            "key" "value" // trailing comment
            "#,
        )
        .unwrap();
        assert_eq!(kv.get("key").and_then(|v| v.as_str()), Some("value"));
    }

    #[test]
    fn handles_escaped_quotes_and_backslashes() {
        let kv = parse(r#""path" "C:\\Games\\Some \"Game\"""#).unwrap();
        assert_eq!(
            kv.get("path").and_then(|v| v.as_str()),
            Some(r#"C:\Games\Some "Game""#)
        );
    }

    #[test]
    fn missing_value_is_a_parse_error() {
        let err = parse(r#""key""#).unwrap_err();
        assert!(err.0.contains("missing value"));
    }

    #[test]
    fn real_loginusers_shape_parses() {
        let sample = r#"
            "users"
            {
                "76561197960265728"
                {
                    "AccountName"		"johndoe"
                    "PersonaName"		"John Doe"
                    "RememberPassword"		"1"
                    "MostRecent"		"1"
                    "Timestamp"		"1700000000"
                }
            }
        "#;
        let kv = parse(sample).unwrap();
        let users = kv.get("users").and_then(|v| v.as_obj()).unwrap();
        assert_eq!(users.len(), 1);
        let (steamid, user) = &users[0];
        assert_eq!(steamid, "76561197960265728");
        assert_eq!(user.get("PersonaName").and_then(|v| v.as_str()), Some("John Doe"));
        assert_eq!(user.get("MostRecent").and_then(|v| v.as_str()), Some("1"));
    }
}
