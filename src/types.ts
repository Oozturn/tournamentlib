/////////////////////////////////////////////
// Opponent
/////////////////////////////////////////////

export type OpponentId = string
export type OpponentType = "player" | "team"
export interface Opponent {
  readonly type: OpponentType
  readonly id: OpponentId
  forfeit: boolean
}
export interface PlayerOpponent extends Opponent {
  readonly type: "player"
  stats: Telemetry
}
export interface TeamOpponent extends Opponent {
  readonly type: "team"
  players: PlayerOpponent[]
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
export interface MatchSet {
  readonly id: SetId
  scores: Record<OpponentId, number>
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

export type PhaseType = "duel" | "ffa" | "roundrobin"

/**
 * Phase settings, used to configure the phase.
 * - type: Phase type (duel, ffa, roundrobin)
 * - invertedScoring: Whether the scoring is inverted. Default false
 * - matchSets: Array of sets for each round of the phase (starting from the final round down to the start). Default [1]
 * - allMatchesSameSetsNumber: Whether all matches have the same number of sets. Default true
 * - matchWinRule: Rule to determine the winner of a match. Default 'bestOfN'
 */
export interface PhaseSettings {
  type: PhaseType
  invertedScoring: boolean
  nbMatchSets: number[]
  allMatchesSameSetsNumber: boolean
  matchWinRule: "bestOfN" | "sumOfSets"
  ffPlayerScoreAgainst: number
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
 * Stores the contribution of each player (no team) in a set, to be used for telemetry and progression.
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
 * Stores the contribution of each opponent (player or team) in a match, to be used for telemetry and progression.
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
