# tauri-app/

Tauri v2 desktop shell. Uses the system **WebView2** runtime (pre-installed on Windows 10/11) — no bundled browser.

## Prerequisites

- [Rust](https://rustup.rs/) — `rustup` installs `cargo`
- [Tauri CLI v2](https://v2.tauri.app/reference/cli/): `cargo install tauri-cli --version "^2"`
- WebView2 runtime — ships with Windows 10/11; no install needed
- Node + Yarn — needed to build the client (already required by this project)

## Dev (hot-reload via Vite)

```
# Terminal 1 — client dev server (already in CORS allowed_origins)
cd client
yarn dev

# Terminal 2 — Tauri window pointed at localhost:5173
cd desktop/tauri-app
cargo tauri dev
```

## Production build

```
cd client && yarn build
cd desktop/tauri-app && cargo tauri build
```

Installer output: `desktop/tauri-app/target/release/bundle/`

Note: the `target/` directory is Rust compilation artifacts (~1 GB for a debug build).
It is gitignored. The actual distributable installer is a few MB.

## CORS (production only)

In dev mode the webview loads from `http://localhost:5173`, which is already in
`allowed_origins`. For a production bundle the webview origin is `http://tauri.localhost`
— add it to `allowed_origins` in `external-tool/infrastructure/variables.tf` and
`terraform apply` before shipping.
