# Steam User Collections Filesystem Plan

## Intent Update (Collections + Local Discovery)

This plan now serves two connected purposes:
1. Implement collections import as additive metadata (not authority data)
2. Establish a repeatable process to discover what local game-list/appid signals are available and in what condition

Decision summary:
- Collections are the only high-value local feature target right now
- Other local data is exploratory unless it helps answer game-list/appid availability
- Local data must be modeled as a sidecar overlay over remote game data

## 1. File Format Investigation

Based on direct inspection of the user's local Steam Cloud sync folder (`C:\Program Files (x86)\Steam\userdata\<id>\config\cloudstorage\cloud-storage-namespace-1.json`), the file is a **JSON array of key-value pairs**.

### The Structure
The root is an array. Each element is an array with two items:
1. A string key (e.g., `"user-collections.favorite"`)
2. An object containing metadata and a stringified JSON payload in the `value` field.

Example entry:
```json
[
  "user-collections.from-tag-To Play",
  {
    "key": "user-collections.from-tag-To Play",
    "timestamp": 1768020602,
    "value": "{\"id\":\"from-tag-To Play\",\"name\":\"To Play\",\"added\":[1700,238910],\"removed\":[]}",
    "version": "3879"
  }
]
```

The keys that represent collections start with `"user-collections."`. The `value` string, when parsed, yields an object:
- `id` (string): The collection ID
- `name` (string): The human-readable name of the collection
- `added` (array of numbers): The Steam AppIDs in this collection
- `removed` (array of numbers): AppIDs removed from this collection

This is highly structured and easy to parse, with no VDF/Protobuf parsing required!

## 2. Browser File System Access API (Prototype)

To load this file from a local disk into the web application, we will use `window.showOpenFilePicker()`.

### Step 1 - Prototype (The Picker & Parser)

**Goal:** Create a standalone function attached to a simple debug button to verify the UX and parsing logic before full integration.

```typescript
// Prototype implementation
async function importSteamCollections() {
  try {
    // 1. Show file picker
    // Requires secure context (HTTPS/localhost) and user gesture
    const [fileHandle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'Steam Cloud Storage JSON',
          accept: {
            'application/json': ['.json']
          }
        }
      ],
      multiple: false
    });

    // 2. Read file contents
    const file = await fileHandle.getFile();
    const text = await file.text();

    // 3. Parse and extract
    const rawData = JSON.parse(text);
    const collections = {};

    for (const entry of rawData) {
      if (Array.isArray(entry) && entry.length === 2) {
        const key = entry[0];
        const data = entry[1];

        if (key.startsWith('user-collections.') && data.value) {
          const collectionData = JSON.parse(data.value);
          // Only process if it has a valid name and added list
          if (collectionData.name && Array.isArray(collectionData.added)) {
            collections[collectionData.name] = collectionData.added;
          }
        }
      }
    }

    console.log("Successfully parsed collections:", collections);
    return collections;

  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('User cancelled file selection');
      return null;
    }
    console.error('Failed to read or parse file:', err);
    throw err;
  }
}
```

## 3. Integration Architecture

### Surfacing in the UI
Add an "Import Steam Collections" button in the `SystemUICoordinator` (or a settings panel if one exists). Because `showOpenFilePicker` requires a transient user activation (a direct click), the button's `onClick` handler must directly invoke the picker function.

### Feeding the Pipeline
Once the parsed `Record<string, number[]>` (Collection Name -> AppIDs) is returned:
1. **Store as overlay metadata:** Persist parsed collections in a local metadata store keyed by appid/collection membership. Keep this separate from remote authority data.
2. **Compose at read time:** Build an in-memory composed view when sorting/filtering/rendering, where remote data remains canonical and collections are additive.
3. **Apply to Sorter:** Add a grouping mode for collections. When active, assign games to groups based on overlay metadata.

## 4. Local Game-List/AppID Discovery Plan

Collections alone are often not a complete library. We need to determine what local data can provide appid coverage.

### Objective

Determine whether local files can produce a useful appid set, and classify that set as:
- complete
- partial but useful
- too unreliable to ship

### Candidate Sources to Probe

1. Steam cloud sync JSON (`cloud-storage-namespace-1.json`)
- expected signal: collection membership appids (partial by nature)

2. `localconfig.vdf`
- expected signal: per-app usage/play state entries under Steam app maps
- expected caveat: likely incomplete for never-played/never-touched titles

3. app manifests / library metadata files (if accessible under selected directory scope)
- expected signal: installed game appids
- expected caveat: installed subset, not full owned set

4. `sharedconfig.vdf`
- expected signal: low for game-list completeness, but still probe

### Extraction Workflow

1. Probe file presence from user-selected directory handle
2. Parse with source-specific extractors
3. Normalize into a shared local-signal schema (`source`, `appid`, `confidence`, `notes`)
4. Compute per-source and merged coverage metrics
5. Emit a user-visible quality summary (`complete|partial|low confidence`)

### Go/No-Go Criteria for Shipping Local AppID Discovery

- Ship if we can consistently produce a useful appid set and explain confidence
- Gate behind advanced setting if quality is mixed across environments
- Cut if discovery success/coverage is too inconsistent to justify UX complexity

## 5. Edge Cases to Handle

1. **File Not Found / Wrong File:** Ensure the JSON parser wraps operations in `try/catch`. Check for the specific array-of-arrays structure. If the structure is invalid, throw a user-friendly error ("This does not appear to be a valid Steam cloud-storage-namespace-1.json file").
2. **Browser Support:** The File System Access API is supported in Chromium browsers. Firefox and Safari have limited/no support. Check `if ('showOpenFilePicker' in window)` and provide a fallback `<input type="file" />` mechanism for unsupported browsers.
3. **Missing Permissions:** If using a persisted file handle for future reads, the browser may prompt for read permissions again. For simplicity, just reading it once and persisting the *parsed result* in `localStorage` avoids needing persistent file system permissions.
4. **VDF Files:** Emphasize to the user *which* file to select (`cloud-storage-namespace-1.json` in `config/cloudstorage`), as old documentation mentions `localconfig.vdf`. Do not attempt to parse VDFs.
5. **Coverage ambiguity:** collections/appid signals may be partial; present confidence and coverage explicitly instead of implying full library completeness.