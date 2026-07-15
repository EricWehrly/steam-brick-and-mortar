# Plan: Audit the Rust Data Pipeline for Unused/Extractable Data

**Status**: Drafted 2026-07-15. Handed to a subagent to flesh out — see "Deliverable" below for
where its output lands.
**Related**: [Desktop Local Data Pipeline Plan](desktop-local-data-pipeline-plan.md),
`docs/research/local-steam/desktop-offline-data-mining-findings.md`

## Why this doc exists

The desktop Rust layer (`desktop/tauri-app/src/steam/*.rs`) parses several local Steam formats —
`loginusers.vdf` (identity), `sharedconfig.vdf` (collections), `appinfo.vdf` (game metadata),
playtime, localization tables — built up incrementally across exploratory research sessions (see
`docs/research/local-steam/`). That kind of exploratory build-out tends to parse more than gets
wired up: fields captured because they were sitting right there in the format, then never surfaced
to the client because the session moved on to the next thing. Before starting a TypeScript-focused
review pass, we want a standing inventory of what's already sitting in the Rust layer (or hinted at
in the underlying VDF format) that we haven't done anything with yet.

One concrete example that prompted this: **Steam's `sharedconfig.vdf` "collections" data appears
to include a "showcases" concept** that hasn't been looked at. Whether that's parsed, partially
parsed, or just visible in the raw format and never touched is exactly the kind of thing this audit
should surface — this doc intentionally doesn't pre-read the source to answer that; that's the
subagent's job.

## Scope

- `desktop/tauri-app/src/steam/*.rs` — `appinfo.rs`, `collections.rs`, `identity.rs`,
  `keyvalues.rs`, `localization.rs`, `paths.rs`, `playtime.rs` — plus `lib.rs`/`main.rs` for how
  `#[tauri::command]`s get wired to the frontend.
- Cross-reference `client/src/**/*.ts` for which of those commands/fields are actually consumed
  today, to separate "unused and available right now" from "already wired up, nothing to find."
- Cross-reference `docs/research/local-steam/*` for prior findings that were recorded during
  research but never actioned — those are half the value here; no need to rediscover them from
  scratch.

## What to look for, per file

1. **Parsed-but-unexposed data** — a struct field or return value that exists in Rust but is never
   read by any `#[tauri::command]`, or is exposed via a command but never read by client TS.
2. **Named concepts in the underlying Steam format** that map to real Steam client features we
   don't use yet — collection "showcases" is the seed example; likely siblings include
   hidden/favorite flags, recently-played timestamps, install state, tag/category data not
   surfaced, sort-order metadata, etc. Look at the actual VDF key names being parsed (or skipped),
   not just the Rust struct field names — the format may carry keys the Rust code doesn't even
   capture yet.
3. **Comments or doc-comments hinting at deferred work** — "not used yet," "future," "TODO,"
   partial implementations, or a struct that clearly models more of the format than it currently
   returns.
4. **Prior research docs that already named something and stopped** — `docs/research/local-steam/`
   has several findings/coverage docs; anything flagged there as "found, not pursued" belongs in
   this catalog too, cross-linked rather than re-investigated.

## Deliverable

One new doc, written as a **numbered catalog of possibilities** — not a commitment, not code, no
implementation attempted. For each candidate:

- **What it is** — plain description, 1-2 sentences.
- **Where it lives** — file:line, or the VDF key path if it's format-level and not yet parsed at
  all.
- **Current state** — already parsed and just unexposed / partially parsed / visible in the raw
  format but not touched at all.
- **A concrete usage idea** — not just "this exists," but a specific angle on how we'd explore or
  ship it (e.g. "a collection's showcase order could drive a curated shelf distinct from general
  library order"). If there's no plausible use, say so rather than padding the catalog.
- **Rough size** — quick client-side wiring of already-parsed data vs. real new Rust parsing work.
- **Where it'd plug in** — link an existing `docs/features/*.md` if one obviously fits, or note
  "needs a new feature doc" if it doesn't.

Output location: `docs/research/rust-data-pipeline-extraction-candidates.md` (new file).

## Explicit non-goals

- Do not implement anything.
- Do not fix bugs found along the way — note them separately (a short callout, or a
  `docs/tech-debt.md` entry if it's real debt) rather than mixing scope into the catalog.
- Do not re-derive Steam's VDF format from scratch — lean on
  `docs/research/local-steam/desktop-offline-data-mining-findings.md` and its siblings first, and
  cross-link rather than duplicate.

---

## Subagent prompt (as handed off)

> Look through `desktop/tauri-app/src/steam/*.rs` (`appinfo.rs`, `collections.rs`, `identity.rs`,
> `keyvalues.rs`, `localization.rs`, `paths.rs`, `playtime.rs`, plus `lib.rs`/`main.rs` for command
> wiring) file by file. For each one, note: data that's parsed in Rust but never exposed to the
> client (`client/src/**/*.ts`) via a `#[tauri::command]`, or exposed but never read client-side;
> named concepts in the underlying Steam VDF format that map to real Steam features we don't use
> yet (a `sharedconfig.vdf` "showcases" concept inside collections is one confirmed lead — check
> whether it's parsed, partially parsed, or untouched, and look for siblings of the same kind:
> hidden/favorite flags, recently-played data, install state, sort metadata, tags/categories not
> surfaced); comments hinting at deferred/future work; and anything already named-but-not-pursued in
> `docs/research/local-steam/*`. For everything you find, don't just log that it exists — propose a
> concrete way we might use or explore it in the product, and say how big a lift it'd be (wiring
> already-parsed data through vs. new Rust parsing). Write the whole thing up as a numbered catalog
> in a new `docs/research/rust-data-pipeline-extraction-candidates.md`. This is a research/reporting
> task only — do not modify any source file, do not implement anything, do not fix anything you
> notice along the way (note it in the doc instead). Read-only exploration, then write one doc.

---
*— A1 / P1*
