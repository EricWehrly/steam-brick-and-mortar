# Lessons Learned

Captured insights from development that should inform future work.

---

## Survey Existing Implementations Before Adding a New One

**Date**: 2026-07-10
**Context**: Building manual Steam library import (bookmarklet/file). By the time it worked
end-to-end, there were three separately-shaped ways a library could get loaded (online profile,
anonymous demo, manual import), each with its own persistence signal and its own idea of who was
responsible for what — and the postMessage protocol for receiving a bookmarklet's payload had
been implemented inside `SteamUIPanel` (a UI-wiring class) instead of `SteamIntegration` (the
class that actually owns library state). Both had to be unwound in a later pass, on request.
**Scope**: Any codebase with more than one existing way to do a thing (load, persist, validate) —
not specific to this project, though the example is.

### Issue

When adding a new variant of something the codebase already does two ways, the natural path of
least resistance is to bolt the new variant on wherever you're already working, shaped however is
locally convenient — not necessarily where the *existing* variants live, and not necessarily
shaped like them. This produces working code that passes tests, but leaves N parallel mechanisms
answering the same question ("what should auto-load at startup?", "who validates this payload?")
instead of one. Nobody notices until someone tries to reason about the whole system at once.

Concretely here: the online-profile path decided what to auto-load by scanning a cache
(`getCachedUsers()`); the new imported-library path used its own separate localStorage key with
its own load/persist/clear functions; the two had no shared shape and `handleGameStart()` had to
special-case both. Separately, "who validates a manual-export payload" was answered by whichever
class happened to be receiving it at the time (`SteamUIPanel` for postMessage), not by asking
which class already owned that responsibility for the *other* import channel.

### Solution

Before writing a new load path, persistence key, or validation routine, find and read every
*existing* implementation of that same concept first — grep for the sibling terms (`getCached*`,
`persist*`, `load*`, `validate*`) before writing the new one. Two concrete questions to ask before
the first line of new code:
1. **Is there a class that already owns this concept?** (Here: `SteamIntegration` already owned
   "how does a library get loaded" — the postMessage listener belonged there from the start, not
   wherever happened to be convenient to wire up a `window.addEventListener` call.)
2. **Would extending the existing mechanism's shape work for my new case, even if it takes an
   extra step to generalize it?** A discriminated union / shared persistence key from the start
   is cheaper than three parallel mechanisms unified later.

A related, compounding version of the same failure: a class that already owns one concept
(`SteamIntegration` owning library *state*) is also the natural place every new *loading*
responsibility gets added — which is correct per (1) above, but means the class keeps growing
unless something is proactively split back out. For AI agents working in a codebase, a bloated
file is a compounding *context* cost too, not just a human readability one — every future session
that touches the file pays for a full read to orient.

Line count alone is a poor measure of "has this gotten too complex" — a 500-line class can be one
coherent domain and be fine; a 250-line class can already straddle three domains and be too big.
Treat line count only as a cheap *trigger to go inspect*, not as the test itself. The actual test:
enumerate the class's member functions, mentally group them by the domain/responsibility each one
represents, and check whether any group falls outside the scope the class *currently* intends to
own. What the class was originally created to do is moot once responsibility and scope have grown
past that — the question is what its intended scope is *now*, and that's still a concrete,
answerable thing even as scope drifts. A member function whose domain doesn't fit the class's
current intended scope is the real signal to split it out, independent of how many lines the file
has.

A second instance surfaced in the same session, in event design rather than file size: `SteamIntegration`
had a `CacheClear` event (clear everything) and `SteamApiClient` separately grew a `UserClear`
event (clear identity resolution only), added later without checking whether the existing event
should simply have taken a parameter. Same root failure as the load-path/persistence-key case
above — a second, differently-shaped mechanism for a question ("what do we want to forget?") that
one existing mechanism already answered at a narrower granularity. Collapsed to one `CacheClear`
event carrying a required `scope: 'all' | 'identity'` field, funneled through a single exported
`emitCacheClear(scope)` helper so the required field is enforced by the function signature at one
choke point rather than validated redundantly in every listener.

### Reference

See root `CLAUDE.md` → Event-Driven Architecture → "Survey before you extend."

---

## Use Synthetic Test Data When Live-Testing Persistence, Not "Just a Label" Real Values

**Date**: 2026-07-10
**Context**: Live-verifying manual library import against the shared dev server. Early tests (when
import wasn't persisted yet) used the developer's real Steam display name paired with a 2-game
fake fixture, purely for readability of the test output — harmless at the time, since nothing
persisted across a reload. Later in the *same session*, the reload-persistence bug got fixed —
and every subsequent live-test call, still using that same real-name/fake-games combination out
of habit, started actually writing to and surviving in the developer's ongoing localStorage,
making their dev environment show "[real name]'s Steam Library" with only 2 games until flagged
and manually cleared.
**Scope**: Any live verification against a persistent store (localStorage, IndexedDB, a database,
a cache) that's shared with the user's own ongoing work — not specific to this project.

### Issue

A test value that "seems like just a label" (a display name, in this case) can quietly become
load-bearing the moment the code under test starts actually persisting it. Habit carries the same
test data forward across a session even after its risk profile has changed — the *first* few calls
were genuinely inert, so there was no signal at the time to switch to synthetic data.

### Solution

- Default to obviously-synthetic test data for anything live-tested against shared/persistent
  state — a name like `"Test Account"`, not a real one, even when the real one is "just more
  readable" for a moment. It costs nothing to fabricate and there's no version of this mistake
  where using it was actually necessary.
- The trigger to switch (if real data was used early for a legitimate reason) is the moment a
  persistence bug affecting that data gets fixed mid-session — that's exactly when previously-inert
  test writes start actually taking effect.
- If real user data is ever used for a live test regardless, clean it up in the same turn, not
  "later" — and say so explicitly rather than leaving the user to discover it.

---

## Three.js DataArrayTexture: Use Partial Layer Updates

**Date**: 2024-12-09  
**Context**: HIGH texture cache was causing 50-65ms frame spikes during texture loading  
**Scope**: Any Three.js project using DataArrayTexture

### Issue
When setting `dataArrayTexture.needsUpdate = true`, Three.js uploads the **entire** texture array to the GPU. For a 64-slot array at 300×450×4 bytes each, that's ~34.5 MB per upload - causing significant frame drops.

### Solution
Use `addLayerUpdate(slotIndex)` to mark only changed layers, then set `needsUpdate = true`:

```typescript
// ❌ BAD: Uploads entire array (~34MB)
this.dataArrayTexture.needsUpdate = true

// ✅ GOOD: Uploads only changed slots (~540KB each)
for (const slot of this.dirtySlots) {
    this.dataArrayTexture.addLayerUpdate(slot)
}
this.dataArrayTexture.needsUpdate = true
this.dirtySlots.clear()
```

### Impact
- **60x reduction** in GPU upload size per flush
- Frame spikes reduced from 50-65ms to near-zero
- Essential for any dynamic texture array system

### References
- [Three.js DataArrayTexture.addLayerUpdate()](https://threejs.org/docs/#api/en/textures/DataArrayTexture.addLayerUpdate)

---

## Frame Budget Scheduling for Main Thread Work

**Date**: 2024-12-09  
**Context**: Texture array `.set()` operations causing frame dips when multiple complete simultaneously  
**Scope**: Any work that can be deferred without user-visible delay

### Issue
When multiple async operations (like texture loads from IndexedDB) complete in the same frame, their callbacks all run synchronously, overwhelming the frame budget.

### Solution
Create a frame-budget-aware scheduler that:
1. Tracks rolling average frame time
2. Checks remaining budget before executing tasks
3. Defers tasks to next frame if budget exhausted
4. Processes deferred tasks at frame start (when budget is full)

```typescript
// Schedule work that can be deferred
scheduler.tryExecuteOrSchedule(() => {
    arrayData.set(pixels, offset)
}, { estimatedMs: 0.5, maxDeferMs: 500 })
```

### Key Design Points
- Use `maxTasksPerFrame` to limit batch size (1-3 for smooth frames)
- Use time-based `maxDeferMs` instead of frame counting (more efficient)
- Schedule entire logical operations together (copy + state + callback)

---

## Profiling Async vs Sync Bottlenecks

**Date**: 2024-12-09  
**Context**: Needed to identify what was actually causing frame drops  
**Scope**: Performance debugging

### Lesson
When profiling shows near-zero main thread time but frames are still dropping, the bottleneck is likely:
1. **GPU operations** (texture uploads, draw calls)
2. **Browser internals** (promise microtask queue flooding)
3. **Async operation clustering** (many callbacks in same frame)

Async "round-trip time" (like worker messages or IndexedDB reads) doesn't block the main thread - it's waiting time. The actual work happens when the callback runs.

### Debugging Approach
1. Instrument all sync operations with `performance.now()` timing
2. If main thread time is low but frames drop, look at GPU or batching
3. Use browser DevTools Performance tab to see actual frame breakdown
