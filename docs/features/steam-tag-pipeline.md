# Feature: Steam Tag Pipeline

**Act**: 2 (Best Effort — active work in separate branch; invest to try, not required to complete)
**Status**: In Progress (branch active; not yet reconciled with main)
**Priority**: Medium

> **Ways of working note**: This is the kind of feature we want to make a real attempt at and pursue until we get somewhere interesting — but we won't hang up on completion. The SteamSpy branch is actively running this experiment. When it's ready, we reconcile and integrate.

## Goal

Surface SteamSpy community tags as a first-class data source for game categorization and sorting — feeding the "sort by user tags" north star that defines the GameSort full pipeline.

## Context

Steam's official API doesn't expose community tags in any usable form. SteamSpy (`steamspy.com/api`) provides them, but rate-limiting is severe: ~1 request/second. Fetching tags for an 800-game library naively would take 13+ minutes.

The solution is a background Lambda that pre-hydrates a tag dataset into S3 on a schedule (or on-demand), so the client can fetch a bulk tag snapshot rather than hitting SteamSpy per-game. This is infrastructure work distinct from the sort logic itself.

This work is actively underway in a separate branch. The branch will be reconciled with main when it's ready — not a current blocker.

## Acceptance Criteria

- SteamSpy tags are available for client consumption without per-game rate limit exposure
- Tags are surfaced in the GameSort pipeline as a sort/filter dimension ("sort by community tag")
- Tag data is refreshed on a reasonable schedule (daily? weekly? TBD)
- Client degrades gracefully when tag data is unavailable or stale

## Stories / Tasks

- **Lambda hydration**: secondary background Lambda fetches SteamSpy tags at a safe rate and writes a bulk snapshot to S3
- **Lambda exposure**: primary Lambda exposes the S3 snapshot to the client via an existing or new endpoint
- **Client consumption**: client fetches tag snapshot at startup; parses and maps tags to `appid`
- **GameSort integration**: wire tags into `GameSorter` as a sort/filter dimension
- **UI affordance**: "sort by community tag" option in the sort panel; tag list browsable

## Notes / Open Questions

- Rate limit is ~1 req/sec to SteamSpy; the background Lambda must respect this and schedule accordingly
- S3 snapshot format needs to be defined — probably a flat JSON map of `appid → string[]`
- SteamSpy research was done; see `docs/plans/steamspy-tags-lambda-plan.md` for the infrastructure design
- See also `docs/plans/steam-tag-research.md` for SteamSpy API analysis, rate limits, ToS assessment, and Steam tag pill CSS styling reference.
- This is complementary to local file investigation (user categories) — SteamSpy provides community tags, local files provide personal categories; both feed the tag-sorting north star
- Branch reconciliation with main is pending; do not attempt to merge until the main branch stabilizes post-intermission
