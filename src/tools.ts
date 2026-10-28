import type {
  Match,
  MatchId,
  MatchSet,
  NodeId,
  Opponent,
  PlayerOpponent,
  Result,
  TeamOpponent,
  Telemetry
} from "./types"

/**
 * Checks if the provided NodeId matches the filter.
 */
export function compatibleIds(filter: Partial<NodeId>, id: Partial<NodeId>): boolean {
  return (
    [undefined, id.phase].includes(filter.phase) &&
    [undefined, id.bracket].includes(filter.bracket) &&
    [undefined, id.round].includes(filter.round) &&
    [undefined, id.match].includes(filter.match) &&
    [undefined, id.set].includes(filter.set)
  )
}

export function idToString(id: Partial<NodeId>, showPhase: boolean = false): string {
  let returnedString = `${showPhase ? id.phase : ""}`
  if (id.bracket !== undefined) {
    returnedString += `${showPhase ? "." : ""}${id.bracket}`
    if (id.round !== undefined) {
      returnedString += `.${id.round}`
      if (id.match !== undefined) {
        returnedString += `.${id.match}`
        if (id.set !== undefined) {
          returnedString += `.${id.set}`
        }
      }
    }
  }
  return returnedString
}

export function newMatch(id: MatchId, nbSets: number, opponents: number): Match {
  const sets: MatchSet[] = Array.from({ length: nbSets }, (_, index) => ({
    id: { ...id, set: index + 1 },
    scores: {}
  })) as MatchSet[]
  return { id, opponents: Array(opponents).fill(undefined) as Opponent[], sets, locked: false, complete: false }
}

export function computeScoreRatio(scored: number, conceded: number): number {
  return scored + conceded === 0 ? 0.5 : ((scored - conceded) / (scored + conceded) + 1) / 2 // between 0 and 1, 0.5 if draw
}

/**
 * Type guard narrowing an Opponent to a TeamOpponent, avoiding `as TeamOpponent` casts.
 */
export function isTeamOpponent(opponent: Opponent): opponent is TeamOpponent {
  return opponent.type === "team"
}

export function deepCopyOpponents(opponents: (Opponent | undefined)[]): (Opponent | undefined)[] {
  return opponents.map((o) => {
    if (!o) {
      return undefined
    }
    if (o.type === "player") {
      return { ...o, stats: { ...(o as PlayerOpponent).stats } }
    }
    return {
      ...o,
      players: (o as TeamOpponent).players.map((p) => ({ ...p, stats: { ...(p as PlayerOpponent).stats } }))
    }
  })
}
export function deepCopyMatch(match: Match | undefined): Match | undefined {
  if (!match) {
    return undefined
  }
  return {
    ...match,
    id: { ...match.id },
    opponents: deepCopyOpponents(match.opponents),
    sets: match.sets.map((set) => ({ id: { ...set.id }, scores: { ...set.scores } }))
  }
}

export function sameResults(a: Result, b: Result): boolean {
  if (a === b) return true
  if (a.forfeit !== b.forfeit) return false
  for (const key in a.telemetry) {
    if (a.telemetry[key as keyof Telemetry] !== b.telemetry[key as keyof Telemetry]) {
      return false
    }
  }
  return true
}
