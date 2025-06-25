# README Writing Guidelines

## Structure: "Above the Fold" Approach
- **Title & Summary**: Clear project description in 1-2 sentences
- **Quick Start**: Most direct entry point for experienced developers
  - Start with the simplest command that works (e.g., `docker compose run build`)
  - Include essential environment variables (e.g., `STEAM_API_KEY=x`)
  - Show where outputs go immediately after the command
- **Horizontal separator** (`---`) to create the "fold"
- **Progressive disclosure**: Explain technologies and details as needed below the fold
- **Multiple audiences**: Appeal to different skill levels progressively down the page

## Tone & Content
- **Direct and accessible** above the fold - get people started fast
- **Acknowledge the "lark" nature**: This is a fun, experimental project
- **Vision section**: Can be playful and aspirational (recreating Blockbuster nostalgia)
- **Technical details**: Below the fold for those who need deeper understanding

## Key Principles
- Scan-friendly for experienced developers
- No barriers to getting started
- Progressive complexity
- Clear separation between "just run it" and "understand it"

## Examples

### Good "Above the Fold" Structure
```markdown
# Project Name

One sentence description of what it does.

## Quick Start
```bash
# The simplest command that works
REQUIRED_VAR=value docker compose run build
```

**Outputs**: Brief description of where files go

---

## Rest of the README...
```

### Progressive Disclosure Pattern
1. **Immediate value** - get experienced developers started
2. **Brief context** - what technologies are involved
3. **Current status** - what works vs what's planned
4. **Details** - architecture, setup, contributing guidelines
