# desktop/

Home for offline/local tooling that runs outside the browser.

```
desktop/
├── source-extract/     # Source 1 game files → glTF/GLB, see its own README
└── tauri-app/           # Native desktop shell (Tauri v2 + WebView2), see its own README
```

See **`source-extract/scripts/README.md`** for the asset-extraction pipeline: prerequisites,
quick start, adding a new game, and troubleshooting.

See **`tauri-app/README.md`** for the desktop app: prerequisites, dev/build commands, and
the CORS note for production builds. Spike status and vehicle-selection rationale are in
[`docs/plans/desktop-tauri-spike-plan.md`](../docs/plans/desktop-tauri-spike-plan.md), linked
from [`docs/features/desktop-app.md`](../docs/features/desktop-app.md).
