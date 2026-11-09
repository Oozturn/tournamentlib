import type { Entrant, Match, MatchId, MatchSet, NodeId, Opponent, Result, Telemetry } from "./types"

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

export function newTelemetry(): Telemetry {
  return {
    matchesPlayed: 0,
    matchesRemaining: 0,
    matchesWon: 0,
    matchesLost: 0,
    matchesDraw: 0,
    setsPlayed: 0,
    setsWon: 0,
    setsLost: 0,
    setsDraw: 0,
    scoredPoints: 0,
    concededPoints: 0,
    ratioPoints: 0
  }
}

/**
 * Creates the opponents of a phase from its entrants, reading only their id: undeclared fields are not copied.
 */
export function newOpponents(entrants: Entrant[]): Opponent[] {
  return entrants.map((entrant) => ({ id: entrant.id, forfeit: false, stats: newTelemetry() }))
}

export function computeScoreRatio(scored: number, conceded: number): number {
  return scored + conceded === 0 ? 0.5 : ((scored - conceded) / (scored + conceded) + 1) / 2 // between 0 and 1, 0.5 if draw
}

export function deepCopyOpponents(opponents: (Opponent | undefined)[]): (Opponent | undefined)[] {
  return opponents.map((o) => (o ? { ...o, stats: { ...o.stats } } : undefined))
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
