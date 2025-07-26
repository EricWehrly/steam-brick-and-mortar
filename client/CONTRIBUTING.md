# Contributing to Steam Brick and Mortar Client

## Test Types & Scripts

- **Unit tests** (default):
  - Run with `yarn test`
  - Covers isolated logic for modules/components. Fast, no real-world calls.
- **Integration tests**:
  - Run with `yarn test:integration`
  - Files matching `*.int.test.ts` (in `test/integration/`)
  - Test cross-module behavior and real-world API calls. Excluded from unit runs.
- **Performance tests**:
  - Run with `yarn test:performance`
  - Located in `test/performance/`
  - For VR/texture/memory/large-data scenarios. Excluded from unit runs.
- **All tests**:
  - Run with `yarn test:all`
  - Runs everything (unit, integration, performance, live, etc.)

## Guidelines
- Add new unit tests for all new features and bugfixes.
- Integration and performance tests should be as thin as possible—prefer unit coverage.
- See `.github/copilot-instructions.md` for project-specific test and commit policies.

---
For more, see the README and docs/test-guidelines.md.
