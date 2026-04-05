# Steam User-Defined Categories — Feasibility Plan
**Milestone**: 6.5.1.1  
**Status**: 🔮 Background investigation  
**Approach**: Low-effort parallel thread. Nurse while forward development continues.

---

## What we're investigating

Steam lets users create custom collections/categories in their library. This data is not available via the public Steam Web API, but **may** exist in local Steam install files.

If it's accessible, it's significantly more valuable than genre-based shelves — it reflects how the user *actually* thinks about their library.

---

## Known local file locations

Steam stores user data in VDF (Valve Data Format, like JSON but Valve-flavored):

```
%STEAM_INSTALL%\userdata\<steamid3>\7\remote\sharedconfig.vdf
```

This file contains user-defined library collections (categories). Structure roughly:

```
"UserLocalConfigStore"
{
    "Software"
    {
        "Valve"
        {
            "Steam"
            {
                "Apps"
                {
                    "<appid>"
                    {
                        "tags"  { "0" "Action" "1" "My Favorites" }
                    }
                }
            }
        }
    }
}
```

Also check: `localconfig.vdf`, `libraryfolders.vdf`

---

## Web access question

### Option A — File System Access API (modern browsers)
`window.showOpenFilePicker()` / `window.showDirectoryPicker()` — requires explicit user gesture.  
Works on localhost and HTTPS origins. User picks the file or folder.

**Verdict**: Viable. User has to find and pick the file manually. Friction is real but acceptable as a "nice to have" power-user feature.

### Option B — File upload input (simple fallback)
`<input type="file" accept=".vdf">` — dead simple, works everywhere.  
User navigates to the file, selects it, we parse it in the browser.

**Verdict**: Simplest path. Works today. Not pretty but functional.

### Option C — Electron / local server (future)
If the app ever ships as Electron or with a local Node server, we can read the file directly without user interaction.

**Verdict**: Future concern. Not needed now.

---

## Investigation tasks

### Task 1: VDF parser
Find or write a minimal VDF parser in TypeScript.
- Check npm: `vdf-parser`, `@node-steam/vdf`, or similar
- Or write a 50-line recursive descent parser (VDF is simple)
- Validate against a real `sharedconfig.vdf` sample

### Task 2: Prototype file picker
Build a small prototype (can be a Vitest test or throwaway HTML page):
- File picker button → read selected file → parse VDF → extract tags/collections
- Verify we can get category names and app ID mappings

### Task 3: Schema validation
Document the actual structure found in the file:
- Are collections stored as tags on each game, or as a separate top-level list?
- Are they under `tags`, `collections`, or something else?
- Do Steam "shelf" categories map to user collections, or are they different?

### Task 4: Integration plan
If feasible:
- Add "Import Steam Collections" option to Steam UI panel (appears when `window.showOpenFilePicker` is available)
- Parse file, extract collection → appID mappings
- Feed into `CategoryManager` as source `'user_custom'` with highest priority
- Cache the mapping in localStorage with a "reimport" option

---

## What "done" looks like for Phase 1

Not fully implemented — just:
- [ ] VDF parser works (unit tested)
- [ ] Proof of concept: can extract collections from a real file
- [ ] Decision documented: proceed with full integration, or defer to Phase 2/Electron

## Notes

- Steam's `sharedconfig.vdf` is synced to Steam Cloud, so it's always up to date
- Default Steam install path on Windows: `C:\Program Files (x86)\Steam\userdata\<id>\7\remote\`
- The user probably won't know where this file is, so the UX needs a clear description
- "Nice to have" — don't block 6.5 on this. Run in parallel.
