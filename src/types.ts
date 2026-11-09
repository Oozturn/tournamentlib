/////////////////////////////////////////////
// Entrant
/////////////////////////////////////////////

export type OpponentId = string

/**
 * What the caller provides to enter a phase. The phase creates its opponents from these declared fields only.
 */
export interface Entrant {
  readonly id: OpponentId
}

/////////////////////////////////////////////
// Opponent
/////////////////////////////////////////////

/**
 * The state of an entrant within a phase, which the phase updates as it progresses.
 */
export interface Opponent {
  readonly id: OpponentId
  forfeit: boolean
  stats: Telemetry
}

/////////////////////////////////////////////
// Id
/////////////////////////////////////////////

/**
 * Node identifier, used to identify any node of the tournament.
 * Phase is mandatory, other values are optional
 */
export interface NodeId {
  phase: TournamentPhase
  bracket?: PhaseBracket
  round?: number
  match?: number
  set?: number
}
export interface BracketId extends NodeId {
  bracket: PhaseBracket
}
export interface RoundId extends BracketId {
  round: number
}
export interface MatchId extends RoundId {
  match: number
}
export interface SetId extends MatchId {
  set: number
}

/////////////////////////////////////////////
// Match
/////////////////////////////////////////////

export type matchIdString = string // Code readability
export type roundIdString = string // Code readability
export type setIdString = string // Code readability
/**
 * A set of a match and the score of each opponent who has one.
 * A score is either a number or `"FF"`. Only a declared forfeit writes `"FF"`, for the opponent who forfeited: `score()`
 * never accepts it.
 */
export interface MatchSet {
  readonly id: SetId
  scores: Record<OpponentId, number | "FF">
}
export interface Match {
  readonly id: MatchId
  opponents: (Opponent | undefined)[]
  sets: MatchSet[]
  locked: boolean
  complete: boolean
}

/////////////////////////////////////////////
// Phase
/////////////////////////////////////////////

export const PHASE_TYPES = ["duel", "ffa", "roundrobin"] as const
export type PhaseType = (typeof PHASE_TYPES)[number]

export const MATCH_WIN_RULES = ["bestOfN", "sumOfSets"] as const
export type MatchWinRule = (typeof MATCH_WIN_RULES)[number]

/**
 * Phase settings, used to configure the phase.
 * - type: Phase type (one of PHASE_TYPES)
 * - invertedScoring: Whether the scoring is inverted. Default false
 * - nbMatchSets: Required. Number of sets per round, as positive integers. Values line up from the end: the last value
 *   is the final round, and earlier rounds without a value default to 1. With allMatchesSameSetsNumber, every round
 *   uses the first value instead.
 * - allMatchesSameSetsNumber: Whether all matches have the same number of sets. Default true
 * - matchWinRule: Required. Rule to determine the winner of a match (one of MATCH_WIN_RULES)
 */
export interface PhaseSettings {
  type: PhaseType
  invertedScoring: boolean
  nbMatchSets: number[]
  allMatchesSameSetsNumber: boolean
  matchWinRule: MatchWinRule
}

/////////////////////////////////////////////
// Tournament
/////////////////////////////////////////////

export interface TournamentSettings {
  phases: PhaseSettings[]
  invertedScoring: boolean
}

export enum TournamentPhase {
  Pool = "POOL",
  Final = "FINAL"
}
export enum PhaseBracket {
  winner = 1,
  loser = 2
}

/////////////////////////////////////////////
// Results
/////////////////////////////////////////////

/**
 * Stores the contribution of each opponent in a set, to be used for telemetry and progression.
 */
export type SetContribCache = Record<
  setIdString,
  Map<
    OpponentId,
    {
      forfeit: boolean
      contrib:
        | {
            scored: number
            conceded: number
            ratioPoints: number
          }
        | undefined
    }
  >
>

/**
 * Stores the contribution of each opponent in a match, to be used for telemetry and progression.
 */
export type MatchContribCache = Record<
  matchIdString,
  Map<
    OpponentId,
    {
      forfeit: boolean
      win: boolean
      loss: boolean
      draw: boolean
    }
  >
>

export type PhaseTelemetry = {
  Metadata: {
    id: TournamentPhase
    type: PhaseType
    complete: boolean
    startedAt: Date | undefined
    completedAt: Date | undefined
  }
  Volume: {
    matchesTotal: number
    matchesCompleted: number
    setsTotal: number
    setsCompleted: number
  }
  opponents: Record<
    OpponentId,
    {
      setsWon: number
      setsLost: number
      setsDraw: number
      pointsFor: number
      pointsAgainst: number
      matchesWon: number
      matchesLost: number
      matchesDraw: number
    }
  >
  updatedAt: Date
}

export type Telemetry = {
  matchesPlayed: number
  matchesRemaining: number
  matchesWon: number
  matchesLost: number
  matchesDraw: number
  setsPlayed: number
  setsWon: number
  setsLost: number
  setsDraw: number
  scoredPoints: number
  concededPoints: number
  ratioPoints: number
}

export interface Result {
  opponentId: OpponentId
  rank: number
  forfeit: boolean
  telemetry: Telemetry
}
