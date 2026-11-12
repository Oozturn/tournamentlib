import type { Match, MatchId, MatchSet, NodeId, Opponent, OpponentId, Result, Stats } from "./types"

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

export function newStats(): Stats {
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
    ratioPoints: 0 // computeScoreRatio(0, 0): no points counted yet
  }
}

/**
 * Creates one opponent per id, in the order of the list, without a forfeit.
 */
export function newOpponents(opponentIds: OpponentId[]): Opponent[] {
  return opponentIds.map((id) => ({ id, forfeit: false }))
}

export function computeScoreRatio(scored: number, conceded: number): number {
  return scored + conceded === 0 ? 0 : (scored - conceded) / (scored + conceded) / 2 // between -0.5 and 0.5, 0 if draw
}

export function deepCopyOpponents(opponents: (Opponent | undefined)[]): (Opponent | undefined)[] {
  return opponents.map((o) => (o ? { ...o } : undefined))
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
  for (const key in a.stats) {
    if (a.stats[key as keyof Stats] !== b.stats[key as keyof Stats]) {
      return false
    }
  }
  return true
}
