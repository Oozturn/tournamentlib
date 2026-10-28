# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Project

TournamentLib: a TypeScript library for managing tournament flow (bracket generation, scoring, progression,
rankings). Strict TypeScript-first API, AGPL-3.0-or-later. Early/actively-evolving — the `duel` format (single
and double elimination) is implemented; `ffa` and `roundrobin` are currently empty stub interfaces only.

Contributing norm from the README: keep changes focused, add/update tests, preserve backward compatibility
when possible, and ask before implementing a new feature (features are actively being designed, so an
unrequested one may conflict with planned work).

## Commands

- `npm run build` — bundle `src/index.ts` with tsup to `dist` (esm + cjs + `.d.ts`)
- `npm run dev` — tsup in watch mode
- `npm test` — run the Jest suite
- `npm run test:watch` — Jest in watch mode
- `npm run typecheck` — `tsc --noEmit`
- Single test file: `npx jest tests/duel.spec.ts`
- Single test case: `npx jest -t "name substring"`

There is no lint script configured. Formatting follows the `prettier` config embedded in `package.json`
(no semicolons, 2-space tabs, no trailing commas, printWidth 120).

Tests live in `tests/*.spec.ts` and run against TypeScript sources directly via `ts-jest` (ESM preset) —
no build step is needed before testing.

## Architecture

### Domain hierarchy

`Tournament` (`src/tournament.ts`) owns one `Phase` per `TournamentPhase` (`POOL` | `FINAL`) and delegates
scoring/queries to whichever phase is current. Each `Phase` owns a flat list of `Match`es; each `Match` has
one or more `MatchSet`s; each set holds per-opponent scores (`Record<OpponentId, number>`). Opponents are
either `PlayerOpponent` (carries `Telemetry` stats) or `TeamOpponent` (carries a list of `PlayerOpponent`s) —
`PhaseBase` always decomposes teams into their underlying players for telemetry purposes.

Nodes are addressed by a nested id shape (`src/types.ts`): `NodeId` → `BracketId` (+bracket) → `RoundId`
(+round) → `MatchId` (+match) → `SetId` (+set). `idToString`/`compatibleIds` in `src/tools.ts` serialize and
match these partial ids — most lookups (`getMatch`, `getMatches(filter)`) go through `compatibleIds` against
a partial `MatchId`.

### Phase template (`src/phase.ts`)

`PhaseBase` is an abstract template-method class that each format subclass (`DuelPhase`, and the planned FFA
/ round-robin implementations) must complete by implementing:

- `generateMatches()` — build the bracket/schedule for the format, called once from the subclass constructor
- `progress()` — drive match completion forward (fill in next opponents, lock/unlock downstream matches, etc.)
- `updateSetCache(setId, match)` / `updateMatchCache(match)` — populate `setContribCache` / `matchContribCache`
  so telemetry doesn't require re-scanning every match
- `updatePlayersTelemetry()` — recompute `Telemetry` for players queued in `playersToUpdateTelemetry`

`PhaseBase.score()` is the single entry point for recording a score: it validates via `notScorable()` (format
subclasses extend this, e.g. `DuelPhase` additionally forbids a drawn match result), mutates the set, marks
the match complete via `matchIsComplete()`, then runs `progress()` → `updateCompletion()` →
`updatePlayersTelemetry()` → `updateResultsCache()` in that order. Subclasses push edited match ids into
`matchesToProgress` (a `Map` keyed by stringified id, used as a work queue) rather than recomputing from
scratch.

Everything returned to callers (`getMatch`, `getMatches`, `getOpponents`) is deep-copied (`deepCopyMatch`,
`deepCopyOpponents` in `src/tools.ts`) — internal state (`this.matches`, `this.opponents`, `this.players`) is
never handed out by reference.

### DuelPhase (`src/formats/duel.ts`)

Generates a power-of-two bracket from `opponents.length` (seeded via the standard `[1, 8, 4, 5, 2, 7, 3, 6]`
reduction), with winner-bracket (WB) rounds and, for double elimination, loser-bracket (LB) rounds plus a
grand final. Progression between matches is precomputed once in `indexMatches()` as two maps:

- `childrenMatches`: for a given match, where its winner (`right()`) and loser (`down()`) go next
- `parentMatches`: the reverse lookup, used to lock/unlock a match once its children start scoring

`right()`/`down()` encode the actual bracket-shape rules (WBR1 feeding LBR1, LB "downmix" seeding when there
are >4 opponents unless `downmix: false`, grand-final-1→grand-final-2 reset logic, bronze-final wiring for
`enableExtendedFinals`) — these are the trickiest part of the format and should be read together with the
inline comments when changing bracket shape. `progress()` branches on three cases per match in the work
queue: forfeit/walkover (`progressFFMatch`), still-incomplete (`progressIncompleteMatch`, used when a score is
*removed* and downstream state must be unwound), and complete (`progressCompleteMatch`).

### Not yet implemented

- `Tournament.validateSettings()` and `Tournament.startPhase()` throw "not yet implemented"
- `src/persistence.ts` is empty
- `FfaFormat` / `RoundRobinFormat` (`src/formats/ffa.ts`, `src/formats/roundrobin.ts`) are empty marker
  interfaces with no backing class

Don't assume these work; check before relying on them in examples or tests.

## OpenSpec

This repo is scaffolded for the OpenSpec spec-driven workflow (`openspec/`), but no specs or changes have been
authored yet (`openspec/specs` and `openspec/changes/archive` are empty). Use the `openspec-propose` /
`openspec-apply-change` / etc. skills when asked to work in that workflow.
