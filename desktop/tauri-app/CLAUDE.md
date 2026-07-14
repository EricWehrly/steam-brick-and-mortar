# Desktop (Tauri)

Rust backend for the desktop app — see root `CLAUDE.md` for project-wide rules.

## Building & Testing

Run from `desktop/tauri-app/`:

```
cargo build --lib                                     # compile check
cargo test --lib                                       # unit tests only — fast, no real Steam install needed
cargo test --lib -- --include-ignored --nocapture      # also runs real-machine tests against this dev machine's actual Steam install
```

Prefer the plain `cargo test --lib` for routine iteration — output is already terse (one line per
test plus a `test result: ok. N passed` summary), no need for `--nocapture` unless you're
eyeballing a real-machine test's `println!` output.

Real-machine tests (in `src/steam/*.rs`) are `#[ignore]`'d by default — they read this machine's
actual Steam install (identity, playtime, collections, `appinfo.vdf`) rather than a fixture, and
discover paths/identity at runtime instead of hardcoding an account, so they're safe to run on any
dev machine that has Steam installed and safe to commit.

Adding a dependency: `cargo add <crate>` (or `cargo add <crate> --target "cfg(windows)"` for
Windows-only deps, e.g. `winreg`/`parselnk` in `src/steam/paths.rs`).
