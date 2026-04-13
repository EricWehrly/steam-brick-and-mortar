# Sign Placement Rules Plan

**Branch:** `openclaw/feat-layout-enhancements` (or dedicated branch)  
**Status:** Working document — not committed

---

## Context

Currently, bucket sign placement is layout-agnostic: signs are placed reactively as games
are sorted and shelves are created. To support varied shelf configurations and density
requirements, we need **pluggable rules** that determine *where* and *how often* signs appear.

Initial rule set:
1. **Row boundary signs**: Place signs at the beginning and end of shelf rows (when row length > 4)
2. **Interval signs**: Place signs every N shelves within a row (starting at 9 shelves per row)
3. Future extensibility: Additional rules (density, genre spacing, custom patterns, etc.)

The rule system should live independent of the layout strategy itself (e.g., Arc) to allow
rules to apply across different room configurations.

---

## Problem statement

When rows have varying lengths (4–15+ shelves), sign placement today is:
- **All-or-nothing**: Either bucket signs appear everywhere or nowhere
- **Non-strategic**: Doesn't account for row length or game density
- **Hardcoded**: Logic tied to specific shelf sequences

What we need:
- **Declarative rules**: Define where signs appear as constraints, not imperative placement calls
- **Row-aware**: Rules reference row position and length
- **Extensible**: New rules don't require cascading changes to ShelfSectionPlanner
- **Testable**: Rule application can be validated in isolation

---

## Proposed architecture

### 1. SignPlacementRule interface

```typescript
interface SignPlacementRule {
  // Determine if this rule applies to the given row
  canApply(rowContext: SignPlacementContext): boolean;

  // Return indices within the row where signs should appear
  // Indices are relative to row start (0 = first shelf in row)
  getSignIndices(rowContext: SignPlacementContext): number[];
}

interface SignPlacementContext {
  rowIndex: number;              // 0-based row number
  rowLength: number;             // Total shelves in this row
  shelfSequence: ShelfDescriptor[];  // Shelves in this row
  gamesByShelf: Map<ShelfId, GameEntries>;  // Games assigned to each shelf
  previousBucketIndices: Set<number>;  // Indices where signs already exist
}
```

### 2. Rule implementations

#### RowBoundaryRule
- **Applies when**: `rowLength > 4`
- **Places signs at**: Index 0 (start), Index `rowLength - 1` (end)
- **Rationale**: Visual bookends for multi-shelf rows; economical for short rows (4 or fewer)

```typescript
interface RowBoundaryRule extends SignPlacementRule {
  minRowLength: number = 5;  // Configurable threshold
}
```

#### IntervalRule
- **Applies when**: `rowLength >= 9`
- **Places signs every**: N shelves (configurable, starting value = 4)
- **Placement pattern**: Signs at indices 0, 4, 8, 12, ... (if row length allows)
- **Rationale**: Subdivide long rows for visual rhythm and category signposting

```typescript
interface IntervalRule extends SignPlacementRule {
  minRowLength: number = 9;
  interval: number = 4;  // Place a sign every N shelves
}
```

### 3. SignPlacementRuleSet (orchestrator)

```typescript
class SignPlacementRuleSet {
  private rules: SignPlacementRule[] = [];

  register(rule: SignPlacementRule): void { ... }

  // Apply all rules in order; deduplicate indices
  computeIndicesForRow(context: SignPlacementContext): number[] {
    const indices = new Set<number>();
    for (const rule of this.rules) {
      if (rule.canApply(context)) {
        rule.getSignIndices(context).forEach(i => indices.add(i));
      }
    }
    return Array.from(indices).sort((a, b) => a - b);
  }
}
```

---

## Change 1 — Introduce SignPlacementRule abstraction

**Status:** Not started

Create new files:
- `client/src/scene/signs/SignPlacementRule.ts` — interface definitions
- `client/src/scene/signs/rules/RowBoundaryRule.ts` — boundary sign rule
- `client/src/scene/signs/rules/IntervalRule.ts` — interval-based rule
- `client/src/scene/signs/SignPlacementRuleSet.ts` — orchestrator

`SignPlacementRuleSet` is instantiated and registered in `ShelfSectionPlanner`:

```typescript
this.signRuleSet = new SignPlacementRuleSet();
this.signRuleSet.register(new RowBoundaryRule({ minRowLength: 5 }));
this.signRuleSet.register(new IntervalRule({ minRowLength: 9, interval: 4 }));
```

**Estimated diff:** +120 lines new code, 0 lines changed in existing files.  
**Risk:** Low. Pure abstraction, no behavioral changes yet.

---

## Change 2 — Integrate rules into ShelfSectionPlanner

**Status:** Deferred until Change 1 is done

When `ShelfSectionPlanner` receives `ShelfReady` events (after Change 1 from
layout-sign-responsibility-plan is landed):

1. Group shelves by row
2. For each row, compute `SignPlacementContext`
3. Call `signRuleSet.computeIndicesForRow(context)`
4. Place bucket signs at returned indices
5. **Remove** hardcoded bucket sign placement logic (e.g., `placeTimeBucketSignForShelf(shelf)`)

This replaces reactive ("place a sign for this shelf") with declarative ("these indices
get signs according to rules").

**Estimated diff:** +40 lines (rule integration), −30 lines (removed hardcoded logic).  
**Risk:** Medium. Changes the core placement loop; requires thorough testing of row grouping.

---

## Change 3 — Make rules pluggable (configuration)

**Status:** Future — post-MVP

Allow rule configuration from external sources:
- Hard-code for now (MVP)
- Environment variables (next phase)
- Room metadata / config files (post-launch)

```typescript
// Example: future config structure
const signRulesConfig = {
  rowBoundary: { enabled: true, minRowLength: 5 },
  interval: { enabled: true, minRowLength: 9, interval: 4 },
  // future density: { ... }
};
```

---

## Change 4 — Add rule filters / modifiers (deferred)

**Status:** Future — identified, low priority

Once Change 2 is solid, consider:
- **Rule filters**: "Don't place signs on the 'junk drawer' shelf" (exclude shelf by tag)
- **Modifiers**: "Prefer signs on genre boundaries" (align to genre transitions)
- **Density caps**: "Max 3 signs per row, regardless of rules"

Current scope: Keep rules simple and independent. Filters/modifiers are a second-phase
optimization.

---

## Future rule categories (beyond sign placement)

The `SignPlacementRule` abstraction is specifically scoped to sign placement. However,
the *pattern* generalizes to other layout decisions. Future work may introduce parallel
rule systems for shelf distribution, grouping, and room-level organization.

### Distribution Rules (shelf isolation)

**Concept**: Coerce shelf distribution to avoid leaving isolated shelves.

Example: If a category spans 2.75 rows and would leave 1 shelf alone in row 3, instead
redistribute to balance: 2.5 shelves per row, avoiding solo shelves in trailing rows.

```typescript
interface ShelfDistributionRule {
  // Given a category's shelf count and available rows, return adjusted distribution
  // e.g., [10, 10, 3] → [8, 8, 7] (more even spread, no solos)
  computeDistribution(
    totalShelves: number,
    availableRowSlots: number
  ): number[];
}
```

**Use cases**:
- "No shelf shall be alone" (minimum 2 shelves per row)
- "Prefer N±1 distribution" (shelf counts differ by at most 1)

**Scope**: Affects how many shelves per row *before* signs are placed. Change 2's row
grouping would use output of this rule.

---

### Grouping Rules (spatial organization)

**Concept**: Beyond rows, group shelves into intentional clusters for visual hierarchy
or layout strategy.

Example: A square 16-shelf grid could be divided into 4 groups of 4 shelves, or 2 groups
of 8. Grouping feeds into renderer layout (visibility, LOD, physics bounds, etc.).

```typescript
interface ShelfGroupingRule {
  // Given a sequence of shelves and context (e.g., category, room zone),
  // return groups of shelf indices
  computeGroups(
    shelves: ShelfDescriptor[],
    context: ShelfGroupingContext
  ): number[][];  // e.g., [[0,1,2,3], [4,5,6,7], ...]
}

interface ShelfGroupingContext {
  categoryId: string;
  availableSpace: { width: number; depth: number };
  strategy: 'square' | 'row' | 'custom';
}
```

**Use cases**:
- "Divide into 2×2 grids" (square aesthetic)
- "Limit group size to 6 shelves" (cognitive load, LOD boundaries)
- "Group by genre sub-category" (spatial semantics)

**Scope**: Higher-level than rows. Could determine physical/logical boundaries for VR
interaction zones, LOD culling, or instanced rendering batches.

---

### Designated Areas (room-level zones)

**Concept**: Declare physical areas of the room as "slots" where game categories spawn.

Example: Front-left zone: Multiplayer games (15 shelves max). Front-right zone: Story games
(20 shelves). Back wall: VR exclusives (10 shelves). If a category exceeds its zone, cascade
to an overflow zone or adjust distribution within the zone.

```typescript
interface DesignatedAreaRule {
  // Assign categories to room zones based on metadata/aesthetics
  assignCategoryToArea(category: GameCategory): RoomZone;

  // Constrain shelf distribution within the assigned area
  computeDistributionInArea(category: GameCategory, zone: RoomZone): number[];
}

interface RoomZone {
  id: string;
  label: string;  // "Front-left", "Back wall", etc.
  maxShelves: number;
  position: Vector3;
  orientation: Quaternion;
}
```

**Use cases**:
- "All multiplayer games in the arcade corner"
- "VR exclusives on their own wall"
- "Newly released games in the feature spot (front-center)"

**Scope**: Room coordinate system. Would be driven by curator decisions or metadata assignments,
not computed heuristics.

---

### Artistic Layouts (curator-defined)

**Concept**: Bypass heuristic rules entirely; curators directly specify which categories
spawn in which zones, at what density, with what visual treatment.

Example: "Indie games form a mosaic wall (3×4 grid, 12 shelves). Side-scrollers get pastel
neon signs. Puzzle games cluster in the back alcove."

```typescript
interface ArtisticLayout {
  // Explicit zone assignments (curator or algorithmic pre-pass)
  zones: Array<{
    id: string;
    categories: string[];  // Which game categories
    shelfGrid: [rows: number, columns: number];
    displayStyle: 'neon' | 'hologram' | 'vintage' | ...;
  }>;
}
```

**Use cases**:
- Thematic events ("Sci-fi month: all sci-fi games in the hologram zone")
- Museum-quality curation (no algorithmic distribution)
- Space optimization for odd room shapes (art gallery aesthetic)

**Scope**: Highest level. Would require a curator UI and explicit save/config format.
Likely Phase 3+ work.

---

## Architecture implications

The rule systems form a **pipeline**:

```
1. Distribution Rules
   (total shelves) → (shelf counts per row)
       ↓
2. Grouping Rules
   (rows) → (groups/zones)
       ↓
3. Designated Area Rules
   (groups) → (room zones)
       ↓
4. Sign Placement Rules (← current scope)
   (zoned shelves) → (sign indices)
       ↓
5. Artistic Rules (optional override)
   (explicit curation) → (replace all above)
```

**Current implementation** focuses on stage 4 (sign placement). **Distribution rules** (stage 1)
would be a natural next phase, feeding cleaner input to shelf grouping. **Designated areas**
(stage 3) requires curator tooling. **Artistic layouts** (stage 5) are post-launch.

The rule abstraction pattern scales across all stages: each is independently testable,
pluggable, and composable.

---

## Sequence recommendation

1. **Change 1** (rule abstraction) — start here, zero risk
2. **Change 2** (integration into ShelfSectionPlanner) — requires layout-responsibility-plan Change 1
3. **Change 3** (configuration) — once rules are stable
4. **Distribution Rules** (stage 1 of pipeline) — next phase, feeds cleaner data to grouping
5. **Grouping Rules** (stage 2 of pipeline) — follows distribution; enables LOD/rendering optimizations
6. **Designated Area Rules** (stage 3 of pipeline) — requires curator tooling and zone metadata
7. **Artistic Layouts** (stage 5 of pipeline) — post-launch, curator UI and explicit curation

---

## Testing strategy

### Unit tests
- `RowBoundaryRule.test.ts`: Verify boundary indices for rows of length 4–15
- `IntervalRule.test.ts`: Verify interval placement at length 9, 13, 17, etc.
- `SignPlacementRuleSet.test.ts`: Verify deduplication and rule ordering

### Integration tests
- Shelves grouped by row, rules applied, signs placed at correct indices
- Row grouping with varying shelf data (empty shelves, no games, etc.)

### Visual/live tests
- Place 15+ shelves in a row, verify signs appear at boundaries + intervals
- Vary row lengths, confirm rules adapt

---

## Open questions

1. **Row definition**: How do we determine row boundaries in Arc? By geometry (Y-axis proximity)?
   By explicit row markers in shelf descriptors? (Answer: likely geometric clustering, ref layout plan)

2. **Sign variance**: Do boundary signs look different from interval signs? Same renderer?
   (Current assumption: same bucket-sign renderer, different visual asset per position type)

3. **Genre cues**: Should interval signs align to genre transitions, or are they purely geometric?
   (Deferred to Change 4; rule filters will handle this)

4. **Dynamic updates**: If games are sorted in-place, do signs move/update? Or do we regenerate the whole row?
   (Assumption: regenerate on sort; rules recompute, old signs removed, new ones placed)

5. **Distribution + Grouping sequencing**: When should distribution rules run relative to grouping rules?
   Can a grouping rule override distribution decisions, or are they independent pipelines?
   (Candidate: distribution first, grouping consumes the result; artist rules override both)

6. **Zone metadata**: How are room zones (for designated areas) defined? Hardcoded in room layout?
   Stored alongside room descriptors? Curator-assigned? (Answer: TBD; likely follows room architecture decisions)

---

## Reference: Related plans

- [Layout & Sign Responsibility Plan](./layout-sign-responsibility-plan.md) — bucket sign ownership migration
- Architecture: [event-driven-architecture-pattern.md](../architecture/event-driven-architecture-pattern.md)
