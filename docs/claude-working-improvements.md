# Claude Working Improvements

Suggestions for making agent sessions in this repo faster and less prompt-heavy. This is a
proposal doc — nothing here is applied yet. Once items are applied (or rejected), fold the
outcomes into `CLAUDE.md` / `.claude/settings.json` and archive this doc.

## 1. Project permission settings (the big win)

**✅ Applied 2026-07-03** — `.claude/settings.json` created by the owner with the allowlist
below.

Original rationale: there was no `.claude/` directory in this repo — no project-level
allowlist existed, so routine commands (`yarn test`, `yarn tsc`, git reads) prompted every
session, and reading the Material Maker clone (a sibling directory) prompted per-file.

Applied `.claude/settings.json` (project-shared, committed):

```json
{
  "permissions": {
    "allow": [
      "Bash(yarn test:*)",
      "Bash(yarn tsc:*)",
      "Bash(yarn vitest:*)",
      "Bash(yarn lint:*)",
      "Bash(yarn build:*)",
      "PowerShell(yarn test:*)",
      "PowerShell(yarn tsc:*)",
      "PowerShell(yarn vitest:*)",
      "PowerShell(yarn lint:*)",
      "PowerShell(yarn build:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git show:*)",
      "Bash(git branch:*)",
      "Read(//F:/FilePrograms/Dropbox/Projects/material-maker/**)"
    ],
    "additionalDirectories": [
      "F:\\FilePrograms\\Dropbox\\Projects\\material-maker"
    ]
  }
}
```

Notes:
- `yarn test` / `yarn tsc` were explicitly designed to be cheap for agents (custom low-token
  test reporter, `FAILURES: N` first line) — they should never prompt.
- The `Read` rule + `additionalDirectories` entry cover the Material Maker clone for the
  procedural-textures work; drop them when that initiative ends. Generalizing to all of
  `F:/FilePrograms/Dropbox/Projects/**` would cover future sibling-repo reference work too —
  owner's call on how broad to go.
- Rule syntax evolves; the `/fewer-permission-prompts` skill scans actual session transcripts
  and generates a prioritized allowlist — worth running once instead of hand-guessing, then
  reviewing its output against this list.
- Deliberately absent: `git add`/`commit`/`push`, `terraform`, anything destructive — those
  should keep prompting.

## 2. Instruction-file corrections

- **Stale reference** (correction: this lives in `.github/copilot-instructions.md` line ~39,
  not CLAUDE.md as originally claimed here): "Use `scripts/scratch.sh` for complex
  multi-command operations" — `scripts/scratch.sh` does not exist (only `setup.sh`,
  `common.sh`, `test-*.sh`, `deploy-to-github-pages.sh`). Fix or remove when next touching
  that file; on this Windows setup the session scratchpad directory serves that role anyway.
  **Not applied** — left for the owner since copilot-instructions serves a different tool.
- **Working-directory rule made explicit** — **✅ applied 2026-07-03** to root CLAUDE.md
  Tooling: yarn commands run from `client/` unless stated otherwise.

## 3. CLAUDE.md additions — ✅ applied 2026-07-03

- **Procedural materials pointer**: added to the Architecture list (Material Maker, clone
  location, plan doc path).
- **Research etiquette line**: added to Tooling — local sources (sibling clones, `docs/`,
  bundled tool docs) before web research; one focused agent for true gaps. Session lesson: the
  Material Maker clone answered every capability question (CLI flags, export targets, license)
  that a web agent was about to be asked.
- **Sibling-repo convention**: folded into the same line (`F:\FilePrograms\Dropbox\Projects\<name>`).

## 4. Process observations (no file change required)

- The docs tree's feature/plan convention worked well as a landing zone for this initiative —
  no changes suggested there.
- `client/CLAUDE.md`'s testing/tsc guidance is already agent-optimized (low-token reporter,
  "don't pre-filter" rule). The missing piece was only the permission layer above.
- When an initiative spans model tiers (Fable → Opus → Sonnet), the demarcation sections now
  embedded in the two procedural-materials plan docs are the template: phase-level tier
  assignments plus named subagent tasks, written at planning time while context is cheap.
