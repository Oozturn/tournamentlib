import { PhaseBase } from "../phase"
import { computeScoreRatio, idToString, newMatch } from "../tools"
import {
  Match,
  MatchId,
  matchIdString,
  MatchSet,
  OpponentId,
  PhaseBracket,
  SetId,
  type Stats,
  type Opponent,
  type PhaseSettings,
  type TournamentPhase
} from "../types"

/** Narrows the scores of a set to numbers, which is the case unless the set carries a forfeit (`"FF"`). */
function isNumericScores(scores: MatchSet["scores"]): scores is Record<OpponentId, number> {
  return !Object.values(scores).includes("FF")
}

export interface DuelSettings extends PhaseSettings {
  type: "duel"
  elimination: "single" | "double"
  enableExtendedFinals: boolean
  nbLBMatchSets?: number[]
  downmix?: boolean
}

export class DuelPhase extends PhaseBase {
  declare settings: DuelSettings
  private bracketPower: number = 0
  protected parentMatches: Map<matchIdString, MatchId[]>
  protected childrenMatches: Map<matchIdString, Record<"right" | "down", { matchId: MatchId; index: number } | null>>

  constructor(tournamentPhase: TournamentPhase) {
    super("duel", tournamentPhase)
    this.parentMatches = new Map()
    this.childrenMatches = new Map()
  }

  public init(opponentIds: OpponentId[], settings: DuelSettings): void {
    super.init(opponentIds, settings)
    this.settings = {
      ...this.settings,
      nbLBMatchSets: settings.nbLBMatchSets ? [...settings.nbLBMatchSets] : undefined
    }
    this.generateMatches()
    this.indexMatches()
    // Progress WO matches
    this.matches.forEach((m) => {
      if (m.opponents.some((o) => o?.forfeit == true)) this.matchesToProgress.set(idToString(m.id), m.id)
    })
    this.progress()
  }

  protected validateSettings(settings: DuelSettings, opponentIds: OpponentId[]): void {
    super.validateSettings(settings, opponentIds)
    if (settings.elimination !== "single" && settings.elimination !== "double") {
      throw new Error(`validateSettings: elimination must be either "single" or "double".`)
    }
    if (opponentIds.length < 4 && settings.elimination === "double") {
      throw new Error(`validateSettings: double elimination requires at least 4 opponents.`)
    }
    if (opponentIds.length < 4 && settings.enableExtendedFinals) {
      throw new Error(`validateSettings: enableExtendedFinals requires at least 4 opponents.`)
    }
  }

  protected generateMatches(): void {
    // generate matches folowing the duel elimination rules and the old lib algorithm
    this.bracketPower = Math.ceil(Math.log2(this.opponents.length))
    const nbMatchesFirstRound = Math.pow(2, this.bracketPower - 1)
    const nbMatchSets: number[] = Array(this.bracketPower).fill(this.settings.nbMatchSets[0])
    if (!this.settings.allMatchesSameSetsNumber) {
      // fill nbMatchSets with the settings.matchSets values (reverse), starting from the last round then fill the rest with 1s
      for (let i = 1; i <= this.bracketPower; i++) {
        nbMatchSets[this.bracketPower - i] = this.settings.nbMatchSets.at(-i) || 1
      }
    }

    // First round, WB
    this.matches.push(
      ...Array.from({ length: nbMatchesFirstRound }, (_, index) => {
        return newMatch(
          { phase: this.tournamentPhase, bracket: PhaseBracket.winner, round: 1, match: index + 1 } as MatchId,
          nbMatchSets[0]!,
          0
        )
      })
    )
    // Get the seeds in order to populate the first round matches with opponents ([1, 8, 4, 5, 2, 7, 3, 6])
    const seeds = Array.from({ length: this.bracketPower }).reduce(
      (seeds: number[]) => {
        return seeds.flatMap((s) => [s, 2 * seeds.length + 1 - s])
      },
      [1]
    )
    // Populate first round matches with opponents
    const WOopponent: Opponent = { id: "", forfeit: true }
    this.matches.forEach((match, index) => {
      const seed1 = seeds[index * 2]! - 1
      const seed2 = seeds[index * 2 + 1]! - 1
      match.opponents.push(this.opponents[seed1] || WOopponent, this.opponents[seed2] || WOopponent)
    })

    // Next rounds, WB
    Array.from({ length: this.bracketPower - 1 }, (_, roundIndex) => {
      const round = roundIndex + 2
      const nbMatchesInRound = Math.pow(2, this.bracketPower - round)
      this.matches.push(
        ...Array.from({ length: nbMatchesInRound }, (_, matchIndex) => {
          return newMatch(
            { phase: this.tournamentPhase, bracket: PhaseBracket.winner, round, match: matchIndex + 1 } as MatchId,
            nbMatchSets[round - 1]!,
            2
          )
        })
      )
    })

    if (this.settings.elimination === "double") {
      // LB
      Array.from({ length: 2 * this.bracketPower }, (_, roundIndex) => {
        const round = roundIndex + 1
        const nbMatchesInThisRound = 2 ** (this.bracketPower - 1 - Math.floor((round + 1) / 2))
        const nbLBMatchSets: number[] = Array(2 * this.bracketPower).fill(this.settings.nbLBMatchSets?.[0] || 1)
        if (!this.settings.allMatchesSameSetsNumber) {
          for (let i = 1; i <= 2 * this.bracketPower; i++) {
            nbLBMatchSets[2 * this.bracketPower - i] = (this.settings.nbLBMatchSets || [1]).at(-i) || 1
          }
        }
        Array.from({ length: nbMatchesInThisRound }, (_, matchIndex) => {
          this.matches.push(
            newMatch(
              { phase: this.tournamentPhase, bracket: PhaseBracket.loser, round, match: matchIndex + 1 } as MatchId,
              nbLBMatchSets[round - 1]!,
              2
            )
          )
        })
      })
      // Grand final
      this.matches.push(
        newMatch(
          {
            phase: this.tournamentPhase,
            bracket: PhaseBracket.loser,
            round: 2 * this.bracketPower - 1,
            match: 1
          } as MatchId,
          this.settings.nbLBMatchSets?.at(-1) || 1,
          2
        )
      )
    }

    // Bronze final if no LB, else grand final
    if (this.settings.enableExtendedFinals) {
      this.matches.push(
        newMatch(
          {
            phase: this.tournamentPhase,
            bracket: PhaseBracket.loser,
            round: this.settings.elimination === "double" ? 2 * this.bracketPower : 1,
            match: 1
          } as MatchId,
          this.settings.nbLBMatchSets?.at(-1) || 1,
          2
        )
      )
    }
  }

  protected indexMatches(): void {
    super.indexMatches()
    // Link matches for progression (parentMatches and childrenMatches)
    this.matches.forEach((match) => {
      const mId = match.id
      const right = this.right(mId)
      const down = this.down(mId)
      this.childrenMatches.set(idToString(mId), { right, down })
      if (right) {
        this.parentMatches.set(idToString(right.matchId), [
          ...(this.parentMatches.get(idToString(right.matchId)) || []),
          mId
        ])
      }
      if (down) {
        this.parentMatches.set(idToString(down.matchId), [
          ...(this.parentMatches.get(idToString(down.matchId)) || []),
          mId
        ])
      }
    })
  }

  // Find the match Id for the winner
  private right(matchId: MatchId): { matchId: MatchId; index: number } | null {
    const { bracket, round, match } = matchId
    const hasLB = this.settings.elimination === "double"
    const extended = this.settings.enableExtendedFinals
    const downMix = this.settings.downmix === false ? false : this.opponents.length > 4

    // No further progression
    // SE = Simple Elimination, no LB
    // DE = Double Elimination, LB
    const FinalSE = !hasLB && round == this.bracketPower
    const BronzeFinalSE = !hasLB && extended && bracket == PhaseBracket.loser
    const FinalDELong = bracket == PhaseBracket.loser && round == 2 * this.bracketPower
    const FinalDEShort = bracket == PhaseBracket.loser && round == 2 * this.bracketPower - 1 && !extended
    if (FinalSE || BronzeFinalSE || FinalDELong || FinalDEShort) {
      return null
    }

    // Winner of WB, goes to grand final
    if (hasLB && bracket == PhaseBracket.winner && round == this.bracketPower) {
      return {
        matchId: {
          phase: this.tournamentPhase,
          bracket: PhaseBracket.loser,
          round: 2 * this.bracketPower - 1,
          match: 1
        } as MatchId,
        index: 0
      }
    }

    const targetId = {
      phase: this.tournamentPhase,
      bracket,
      round: round + 1,
      match: bracket == PhaseBracket.loser && round % 2 == 1 ? match : Math.floor((match + 1) / 2)
    } as MatchId

    //// WB
    if (bracket == PhaseBracket.winner) {
      return { matchId: targetId, index: (match + 1) % 2 }
    }

    //// LB
    // LB final winner
    if (round == 2 * this.bracketPower - 2) {
      return { matchId: targetId, index: 1 }
    }
    // Grand final 1 winner goes in pos 0
    if (round == 2 * this.bracketPower - 1) {
      return { matchId: targetId, index: 0 }
    }
    // unless downMix, LBR1 winners move inversely to normal progression
    if (round == 1) {
      return { matchId: targetId, index: downMix ? 1 : match % 2 }
    }
    // winner from LB always bottom in odd rounds, otherwise normal progression
    return { matchId: targetId, index: round % 2 == 1 ? 1 : (match + 1) % 2 }
  }

  // Find the match Id for the looser
  private down(matchId: MatchId): { matchId: MatchId; index: number } | null {
    const { bracket, round, match } = matchId
    const hasLB = this.settings.elimination === "double"
    const extended = this.settings.enableExtendedFinals
    const downMix = this.settings.downmix === false ? false : this.opponents.length > 4

    //// No further progression
    if ((!hasLB && bracket == PhaseBracket.winner) || bracket == PhaseBracket.loser) {
      // Bronze final
      if (bracket == PhaseBracket.winner && round == this.bracketPower - 1 && extended) {
        return {
          matchId: { phase: this.tournamentPhase, bracket: PhaseBracket.loser, round: 1, match: 1 } as MatchId,
          index: (match + 1) % 2
        }
      }
      // Grand final 1 looser goes in pos 1 if extended finals, else no further progression
      if (extended && bracket == PhaseBracket.loser && round == 2 * this.bracketPower - 1) {
        return {
          matchId: {
            phase: this.tournamentPhase,
            bracket: PhaseBracket.loser,
            round: 2 * this.bracketPower,
            match: 1
          } as MatchId,
          index: 1
        }
      }
      // Other here are kicked out
      return null
    }

    //// WB
    // WBR1 always feeds into LBR1 as if it were WBR2
    if (round == 1) {
      return {
        matchId: {
          phase: this.tournamentPhase,
          bracket: PhaseBracket.loser,
          round: 1,
          match: Math.floor((match + 1) / 2)
        } as MatchId,
        index: match % 2
      }
    }
    // normal LB drops: on top for (r>2) and (r<=2 if odd g) to match bracket movement
    if (!downMix) {
      return {
        matchId: { phase: this.tournamentPhase, bracket: PhaseBracket.loser, round: (round - 1) * 2, match },
        index: round > 2 || match % 2 ? 0 : 1
      }
    }
    // downmix
    const nbMatches = 2 ** (this.bracketPower - round) // Matches in this round
    const midPoint = 2 ** (this.bracketPower - round - 1) // "center" of the round
    const reversed = Math.floor(round / 2) % 2 // reverse the match list map
    const partitioned = Math.floor((round + 1) / 2) % 2 // split the match list map in two, change order then rejoin the lists

    let targetMatch = reversed ? nbMatches - match + 1 : match
    if (reversed && partitioned) {
      targetMatch = match > midPoint ? nbMatches - match + midPoint + 1 : midPoint - match + 1
    } else if (partitioned) {
      targetMatch = match > midPoint ? match - midPoint : match + midPoint
    }
    return {
      matchId: {
        phase: this.tournamentPhase,
        bracket: PhaseBracket.loser,
        round: (round - 1) * 2,
        match: targetMatch
      } as MatchId,
      index: 0
    }
  }

  private getParentMatches(matchId: MatchId): Match[] {
    const parentIds = this.parentMatches.get(idToString(matchId)) || []
    return parentIds.map((parentId) => this._getMatch(parentId)).filter((m) => m !== undefined)
  }

  private getChildrenMatches(matchId: MatchId): Record<"right" | "down", { match: Match; index: number } | null> {
    const children = this.childrenMatches.get(idToString(matchId)) || { right: null, down: null }
    return {
      right: children.right
        ? {
            match: this._getMatch(children.right!.matchId)!,
            index: children.right.index
          }
        : null,
      down: children.down ? { match: this._getMatch(children.down!.matchId)!, index: children.down.index } : null
    }
  }

  protected notScorable(setId: SetId, opponentId: OpponentId, score: number | undefined): string | void {
    const superReturn = super.notScorable(setId, opponentId, score)
    if (superReturn) {
      return superReturn
    }

    // Specific checks for DuelPhase

    const match = this._getMatch(setId)! // Match is checked in super.notScorable()

    // A match resolved by a forfeit is frozen, for any of its opponents and even to remove a score
    if (this.isResolvedByForfeit(match)) {
      return "Match was resolved by a forfeit"
    }

    // Equality in sets is possible, but not in match following the matchWinRule (bestOfN or sumOfSets)
    // Duplicate the match scores then apply the new one
    const poententialMatchSets: MatchSet[] = match.sets.map((set) => {
      return { id: set.id, scores: { ...set.scores } }
    })
    if (score !== undefined) poententialMatchSets[setId.set - 1]!.scores[opponentId] = score
    else delete poententialMatchSets[setId.set - 1]!.scores[opponentId]

    // If match is not completed by this score, no need to check further
    if (!poententialMatchSets.every((set) => Object.keys(set.scores).length === match.opponents.length)) {
      return
    }

    // Compute the match scores for each opponent
    // Sum the scores for each opponent in the match, according to the matchWinRule)
    const pointsMap = this.getPointsMap({ ...match, sets: poententialMatchSets })
    const matchPoints = Array.from(pointsMap.values())
    if (matchPoints[0] === matchPoints[1]) {
      return `Match would be a draw, which is not allowed`
    }
  }

  protected lockMatch(match: Match): void {
    const { right, down } = this.getChildrenMatches(match.id)

    if ((right && this.hasStarted(right.match)) || (down && this.hasStarted(down.match))) {
      match.locked = true
    }
    // A walkover match records no score, so its parents depend on the matches it feeds
    if (this.hasWalkover(match)) {
      this.getParentMatches(match.id).forEach((parent) => this.lockMatch(parent))
    }
  }

  protected unlockMatch(match: Match): void {
    const { right, down } = this.getChildrenMatches(match.id)

    if (
      !(right && right.match.complete !== false && this.hasStarted(right.match)) &&
      !(down && down.match.complete !== false && this.hasStarted(down.match))
    ) {
      match.locked = false
    }
    // A walkover match records no score, so its parents depend on the matches it feeds
    if (this.hasWalkover(match)) {
      this.getParentMatches(match.id).forEach((parent) => this.unlockMatch(parent))
    }
  }

  protected matchIsComplete(match: Match): boolean {
    // A match is complete if all its sets are complete or if a majority of sets are won by one opponent (bestOfN)
    if (match.sets.every((set) => Object.keys(set.scores).length === match.opponents.length)) {
      return true
    }
    if (this.settings.matchWinRule === "bestOfN") {
      const pointsMap = this.getPointsMap(match)
      if (match.sets.length / 2 < Math.max(...pointsMap.values())) {
        return true
      }
    }
    return false
  }

  protected progress(): void {
    while (this.matchesToProgress.size) {
      const nextId = this.matchesToProgress.values().next().value!
      const matchToProgress = this._getMatch(nextId)
      if (!matchToProgress) {
        throw new Error(`progress: match ${idToString(nextId)} not found.`)
      }
      this.matchesToProgress.delete(idToString(nextId))
      if (matchToProgress.opponents.some((o) => o?.id === "")) {
        // A walkover progresses again, complete or not, as a parent correction can replace its other opponent
        this.progressFFMatch(matchToProgress)
      } else if (this.isResolvedByForfeit(matchToProgress)) {
        // A match resolved by a forfeit is frozen
        continue
      } else if (matchToProgress.complete) {
        // A played match stays played, even if one of its opponents forfeited since
        this.progressCompleteMatch(matchToProgress)
      } else if (matchToProgress.opponents.some((o) => o?.forfeit === true)) {
        this.progressFFMatch(matchToProgress)
      } else {
        this.progressIncompleteMatch(matchToProgress)
      }
    }
  }

  /**
   * Fills the stats in one pass over the matches. A match against a walkover or resolved by a forfeit counts for
   * nobody. Otherwise each set counts once every opponent has a numeric score in it, even if the match is in progress,
   * and the match counts once it is complete with at least one counted set.
   */
  protected fillStats(stats: Map<OpponentId, Stats>): void {
    // First incomplete match of each opponent, in the order of this.matches, for matchesRemaining
    const nextMatches = new Map<OpponentId, Match>()

    for (const match of this.matches) {
      if (!match.complete) {
        match.opponents.forEach((o) => {
          if (o && !nextMatches.has(o.id)) nextMatches.set(o.id, match)
        })
      }
      if (this.hasWalkover(match) || this.isResolvedByForfeit(match)) {
        continue
      }
      const opponents = match.opponents.filter((o): o is Opponent => o !== undefined)
      if (opponents.length !== match.opponents.length) {
        continue
      }

      let countedSets = 0
      match.sets.forEach(({ scores }) => {
        if (!opponents.every((o) => typeof scores[o.id] === "number")) {
          return
        }
        countedSets++
        opponents.forEach((o) => {
          const opponentStats = stats.get(o.id)
          const other = opponents.find((other) => other.id !== o.id)
          if (!opponentStats || !other) return
          let scored = scores[o.id] as number
          let conceded = scores[other.id] as number
          if (this.settings.invertedScoring) {
            ;[scored, conceded] = [conceded, scored]
          }
          opponentStats.setsPlayed++
          if (scored > conceded) opponentStats.setsWon++
          else if (scored < conceded) opponentStats.setsLost++
          else opponentStats.setsDraw++
          opponentStats.scoredPoints += scored
          opponentStats.concededPoints += conceded
        })
      })

      // A duel match can't be a draw (see notScorable()), so matchesDraw stays at 0
      if (match.complete && countedSets > 0) {
        const winnerId = this.getWinnerId(match)
        opponents.forEach((o) => {
          const opponentStats = stats.get(o.id)
          if (!opponentStats) return
          opponentStats.matchesPlayed++
          if (o.id === winnerId) opponentStats.matchesWon++
          else opponentStats.matchesLost++
        })
      }
    }

    stats.forEach((opponentStats, opponentId) => {
      opponentStats.ratioPoints = computeScoreRatio(opponentStats.scoredPoints, opponentStats.concededPoints)

      const nextMatch = nextMatches.get(opponentId)
      if (nextMatch === undefined) {
        return
      }
      const { bracket, round } = nextMatch.id
      if (bracket === PhaseBracket.winner) {
        opponentStats.matchesRemaining =
          this.bracketPower -
          (round - 1) +
          (this.settings.elimination === "double" ? (this.settings.enableExtendedFinals ? 2 : 1) : 0)
      } else {
        // In double elimination, rounds r to 2p - 1 (grand final 1) remain, plus grand final 2 with extended finals.
        // In single elimination, the only loser bracket match is the bronze final.
        opponentStats.matchesRemaining =
          this.settings.elimination === "double"
            ? 2 * this.bracketPower - round + (this.settings.enableExtendedFinals ? 1 : 0)
            : 1
      }
    })
  }

  /**
   * Progress a match against a walkover or with a forfeiting opponent, which is complete as long as all opponents are
   * present.
   * The walkover loses first, otherwise the first forfeiting opponent loses: when both opponents forfeited, the one in
   * position 2 wins. A forfeit replaces every set with `"FF"` for each forfeiting opponent, while a walkover writes nothing.
   */
  private progressFFMatch(match: Match): void {
    const loser = match.opponents.find((o) => o?.id === "") || match.opponents.find((o) => o?.forfeit === true)!
    const winner = match.opponents.find((o) => o?.id !== loser.id)
    if (!winner) return

    // Write the forfeit, replacing the scores already recorded, unless the loser is a walkover
    if (loser.id !== "") {
      const forfeitScores = Object.fromEntries(
        match.opponents.filter((o): o is Opponent => o?.forfeit === true).map((o) => [o.id, "FF" as const])
      )
      match.sets.forEach((set) => {
        set.scores = { ...forfeitScores }
      })
    }
    // Complete the match and lock its parents
    match.complete = true
    this.getParentMatches(match.id).forEach((parent) => this.lockMatch(parent))

    // If the match is a grand final 1, the placement depends on its winner
    if (
      match.id.bracket === PhaseBracket.loser &&
      match.id.round === 2 * Math.ceil(Math.log2(this.opponents.length)) - 1
    ) {
      this.progressGF1(match, winner.id, loser.id)
      return
    }

    const { right, down } = this.getChildrenMatches(match.id)
    if (right) {
      right.match.opponents[right.index] = winner
      this.matchesToProgress.set(idToString(right.match.id), right.match.id)
    }
    if (down) {
      down.match.opponents[down.index] = loser
      this.matchesToProgress.set(idToString(down.match.id), down.match.id)
    }
  }

  /**
   * Progress an incomplete match.
   * This concerns matches that just start and complete matches where a score has been removed.
   */
  private progressIncompleteMatch(match: Match): void {
    // If match is not complete, clear its children (only the concerned opponent)
    const { right, down } = this.getChildrenMatches(match.id) || {}
    ;[right, down].forEach((child) => {
      if (child) {
        // empty opponent and remove its score
        child.match.opponents[child.index] = undefined
        child.match?.sets.forEach((set) => {
          set.scores = Object.fromEntries(
            Object.entries(set.scores).filter(
              ([key]) =>
                !this._getMatch(match.id)
                  ?.opponents.map((o) => o?.id)
                  .includes(key)
            )
          )
        })
      }
    })
    // If match is empty, unlock its parents. Else, lock them
    const parentMatches = this.getParentMatches(match.id)
    if (match.sets.every((set) => Object.keys(set.scores).length === 0)) {
      parentMatches.forEach((parent) => {
        this.unlockMatch(parent)
      })
    } else {
      parentMatches.forEach((parent) => {
        this.lockMatch(parent)
      })
    }
  }

  /**
   * Progress a complete match.
   */
  private progressCompleteMatch(match: Match): void {
    const winnerId = this.getWinnerId(match)
    const loserId = match.opponents.find((opponent) => opponent?.id !== winnerId)?.id

    if (!winnerId || !loserId) {
      throw new Error(`progress: could not determine winner or loser for match ${idToString(match.id)}.`)
    }

    // If the match is a grand final 1
    if (
      match.id.bracket === PhaseBracket.loser &&
      match.id.round === 2 * Math.ceil(Math.log2(this.opponents.length)) - 1
    ) {
      this.progressGF1(match, winnerId, loserId)
      return
    }

    // Fill children
    const { right, down } = this.getChildrenMatches(match.id) || {}
    const pairs: Record<OpponentId, { match: Match; index: number } | null | undefined> = {}
    pairs[winnerId] = right
    pairs[loserId] = down
    Object.entries(pairs).forEach(([opponentId, child]) => {
      if (child) {
        child.match.opponents[child.index] = this.opponents.find((o) => o?.id === opponentId)
        this.matchesToProgress.set(idToString(child.match.id), child.match.id)
      }
    })
  }

  /**
   * Progress a grand final 1 match and decide if a GF2 is needed.
   */
  private progressGF1(match: Match, gf1WinnerId: OpponentId, gf1LoserId: OpponentId): void {
    // Grand final 1 is complete, check if extended finals are enabled and if the winner is the WB winner
    if (!this.settings.enableExtendedFinals) {
      // No GF2, return
      return
    }
    const gf2 = this.matches.find(
      (m) => m.id.bracket === PhaseBracket.loser && m.id.round === 2 * Math.ceil(Math.log2(this.opponents.length))
    )
    if (!gf2) {
      throw new Error(`progressGF1: could not find GF2 match.`)
    }
    gf2.complete = false
    if (match.opponents[0]?.id === gf1WinnerId) {
      // The WB winner won the GF1, the tournament is complete
      // Mark GF2 as complete
      const gf2 = this.matches.find(
        (m) => m.id.bracket === PhaseBracket.loser && m.id.round === 2 * Math.ceil(Math.log2(this.opponents.length))
      )
      if (gf2) gf2.complete = true
      return
    }
    const { right, down } = this.getChildrenMatches(match.id) || {}
    if (right) {
      right.match.opponents[right.index] = this.opponents.find((o) => o?.id === gf1LoserId)
      this.matchesToProgress.set(idToString(right.match.id), right.match.id)
    }
    if (down) {
      down.match.opponents[down.index] = this.opponents.find((o) => o?.id === gf1WinnerId)
      this.matchesToProgress.set(idToString(down.match.id), down.match.id)
    }
  }

  /**
   * Whether the match was resolved by a forfeit, read from its scores (`"FF"`) and not from `Opponent.forfeit`, which
   * describes the current state of an opponent and can be toggled back.
   */
  private isResolvedByForfeit(match: Match): boolean {
    return match.sets.some((set) => !isNumericScores(set.scores))
  }

  private hasWalkover(match: Match): boolean {
    return match.opponents.some((o) => o?.id === "")
  }

  /**
   * Whether the match has a score. A walkover match never records one, so it counts as started once a match it feeds
   * has started: changing its opponent would replace an opponent in that match.
   */
  private hasStarted(match: Match): boolean {
    if (match.sets.some((set) => Object.keys(set.scores).length > 0)) {
      return true
    }
    if (!this.hasWalkover(match)) {
      return false
    }
    const { right, down } = this.getChildrenMatches(match.id)
    return [right, down].some((child) => child !== null && this.hasStarted(child.match))
  }

  /**
   * Returns the winner of a match from its counted sets, according to the matchWinRule and invertedScoring settings, or
   * undefined if no set counts.
   */
  private getWinnerId(match: Match): OpponentId | undefined {
    // Sum the scores for each opponent in the match, according to the matchWinRule
    const pointsMap = this.getPointsMap(match)
    // Then find the winner according to the invertedScoring setting
    return Array.from(pointsMap.entries()).sort(([, scoreA], [, scoreB]) => {
      if (this.settings.invertedScoring) {
        return scoreA - scoreB
      } else {
        return scoreB - scoreA
      }
    })[0]?.[0]
  }

  private getPointsMap(match: Match): Map<OpponentId, number> {
    // Sum the scores for each opponent in the match, according to the matchWinRule)
    const pointsMap = new Map<OpponentId, number>()
    match.sets.forEach(({ scores }) => {
      // Only complete sets count, and sets carrying a forfeit never do
      if (Object.keys(scores).length !== match.opponents.length || !isNumericScores(scores)) {
        return
      }
      // Draw sets dont count for bestOfN, and are transparent for sumOfSets
      if (this.settings.matchWinRule === "bestOfN" && new Set(Object.values(scores)).size === 1) {
        return
      }
      const biggestScore = Math.max(...Object.values(scores))
      for (const [opponentId, score] of Object.entries(scores)) {
        pointsMap.set(
          opponentId,
          (pointsMap.get(opponentId) || 0) +
            (this.settings.matchWinRule === "bestOfN" ? (score === biggestScore ? 1 : 0) : score)
        )
      }
    })
    return pointsMap
  }
}
