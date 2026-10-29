import { compatibleIds, deepCopyMatch, deepCopyOpponents, idToString, isTeamOpponent, sameResults } from "./tools"
import { PhaseType } from "./types"
import type {
  Opponent,
  OpponentId,
  PhaseSettings,
  Match,
  Result,
  SetId,
  MatchId,
  TournamentPhase,
  matchIdString,
  TeamOpponent,
  SetContribCache,
  MatchContribCache,
  PlayerOpponent
} from "./types"

export interface Phase {
  readonly type: PhaseType
  readonly settings: PhaseSettings

  /** Returns the current ranking of the phase, one entry per player, sorted by rank. */
  getResult(): Result[]
  /** Returns the phase completion ratio, from 0 (no match complete) to 1 (all matches complete). */
  getCompletion(): number

  /**
   * Returns the opponents of the phase.
   * @param includeForfeited Whether to include opponents who have forfeited
   * @param individualOpponents Whether to return players (true) instead of the phase's opponents, which may be teams (false)
   */
  getOpponents(includeForfeited: boolean, individualOpponents: boolean): Opponent[]
  /**
   * Toggles the forfeit status of an opponent (or a player within a team), then re-progresses the phase so that
   * matches, telemetry and results reflect the new forfeit state.
   */
  toggleForfeit(opponentId: OpponentId): void

  /** Returns a single match by id, or undefined if it does not exist. */
  getMatch(matchId: MatchId): Match | undefined
  /** Returns every match matching the given partial id (e.g. all matches of a given round or bracket). */
  getMatches(filter: Partial<MatchId>): Match[]

  /**
   * Records (or removes, when score is undefined) an opponent's score for a given set, then progresses the
   * tournament, recomputes completion, telemetry and results accordingly.
   */
  score(setId: SetId, opponentId: OpponentId, score: number | undefined): void
}

export abstract class PhaseBase implements Phase {
  readonly type: PhaseType
  readonly settings: PhaseSettings
  readonly tournamentPhase: TournamentPhase
  protected matches: Match[] = []
  protected opponents: Opponent[] = []
  protected players: PlayerOpponent[] = []
  protected teamOfPlayers: Map<OpponentId, TeamOpponent> = new Map()
  private resultsCache: Result[] = []
  private completion: number = 0

  // Avoid to search for matches to progress by caching the edited ones
  protected matchesToProgress: Map<matchIdString, MatchId> = new Map()
  // Avoid to search for players to update telemetry by caching the edited ones
  protected playersToUpdateTelemetry: Set<OpponentId> = new Set()
  // Data updated when a set is complete
  protected setContribCache: SetContribCache = {}
  // Data updated when the match is complete
  protected matchContribCache: MatchContribCache = {}

  protected matchIndex: Map<matchIdString, Match> = new Map()

  constructor(type: PhaseType, tournamentPhase: TournamentPhase, opponents: Opponent[], settings: PhaseSettings) {
    this.validateOpponents(opponents)
    this.validateSettings(settings, opponents)
    this.type = type
    this.tournamentPhase = tournamentPhase
    this.opponents = deepCopyOpponents(opponents).filter((o) => o !== undefined)
    this.opponents.forEach((opponent) => {
      if (isTeamOpponent(opponent)) {
        this.players.push(...opponent.players)
        opponent.players.forEach((p) => this.teamOfPlayers.set(p.id, opponent))
      } else {
        this.players.push(opponent as PlayerOpponent)
      }
    })
    this.settings = {
      ...settings,
      nbMatchSets: [...settings.nbMatchSets],
      allMatchesSameSetsNumber: !!settings.allMatchesSameSetsNumber,
      invertedScoring: !!settings.invertedScoring
    }
    // In sub classes, call these:
    // this.generateMatches()
    // this.indexMatches()
  }

  /**
   * This method is called in the constructor of the subclasses to generate the matches for the phase.
   * It is up to the subclass to implement the logic for generating matches, as it depends on the phase type.
   * After generating matches, the subclass should call indexMatches() to ensure the match index is up to date.
   */
  protected abstract generateMatches(): void

  /**
   * This method is called after a score is set, and should progress the tournament if needed.
   * It is up to the subclass to implement the logic for progressing the tournament, as it depends on the phase type.
   * Update telemetry of the match opponents if needed.
   */
  protected abstract progress(): void

  /**
   * This method is called from score() when a set is complete.
   * It saves the contribution of each player (not team) in the set to the setContribCache, so that it can be
   * used later to update telemetry or progress the tournament without parsing all the matches again.
   * @param setId The ID of the set to save
   * @param match The match containing the set to save
   */
  protected abstract updateSetCache(setId: SetId, match: Match): void

  /**
   * This method is called from progress() when a match is complete.
   * It saves the contribution of each opponent (player or team) in the match to the matchContribCache, so that it can be
   * used later to update telemetry or progress the tournament without parsing all the matches again.
   * @param match The match to save
   */
  protected abstract updateMatchCache(match: Match): void

  /**
   * Updates the telemetry for the opponents in PhaseBase.opponentsToUpdateTelemetry
   *
   */
  protected abstract updatePlayersTelemetry(): void

  public getResult(): Result[] {
    return this.resultsCache.map((r) => ({ ...r, telemetry: { ...r.telemetry } }))
  }

  public getCompletion(): number {
    return this.completion
  }

  public getOpponents(includeForfeited: boolean, individualOpponents: boolean): Opponent[] {
    if (individualOpponents) {
      return deepCopyOpponents(this.players.filter((p) => includeForfeited || !p.forfeit)).filter(
        (o) => o !== undefined
      )
    }
    return deepCopyOpponents(this.opponents.filter((o) => includeForfeited || !o.forfeit)).filter(
      (o) => o !== undefined
    )
  }

  public toggleForfeit(opponentId: OpponentId): void {
    const opponent = this.opponents.find((o) => o.id === opponentId) || this.players.find((p) => p.id === opponentId)
    if (!opponent) {
      throw new Error(`toggleForfeit: opponent ${opponentId} not found.`)
    }
    // Opponent is a team
    if (isTeamOpponent(opponent)) {
      opponent.forfeit = !opponent.forfeit
      opponent.players.forEach((p) => (p.forfeit = opponent.forfeit))
    }
    // Opponent is a player
    else {
      opponent.forfeit = !opponent.forfeit
    }

    const matchToProgress = this.matches.find((m) => !m.complete && m.opponents.some((o) => o?.id === opponentId))
    if (matchToProgress) {
      this.matchesToProgress.set(idToString(matchToProgress.id), matchToProgress.id)
    }

    // Opponent is a player in a team, check if the team is impacted by the forfeit
    const team = this.teamOfPlayers.get(opponentId)
    if (team) {
      team.forfeit = team.players.every((p) => p.forfeit)
      const matchToProgress = this.matches.find((m) => !m.complete && m.opponents.some((o) => o?.id === team.id))
      if (matchToProgress) {
        this.matchesToProgress.set(idToString(matchToProgress.id), matchToProgress.id)
      }
    }
    this.progress()
    this.updateCompletion()
    this.updatePlayersTelemetry()
    this.updateResultsCache()
  }

  public getMatch(matchId: MatchId): Match | undefined {
    return deepCopyMatch(this._getMatch(matchId))
  }

  public getMatches(filter?: Partial<MatchId>): Match[] {
    return this._getMatches(filter)
      .map((m) => deepCopyMatch(m))
      .filter((m) => m !== undefined)
  }

  public score(setId: SetId, opponentId: OpponentId, score: number | undefined): void {
    const notScorableReason = this.notScorable(setId, opponentId, score)
    if (notScorableReason) {
      throw new Error(
        `score: impossible to score ${idToString(setId)} / ${opponentId} / ${score}: ${notScorableReason}`
      )
    }
    // Checks for match, set and opponent existence are done in notScorable()
    const match = this._getMatch(setId)!
    const set = match.sets[setId.set - 1]!

    // An undefined score means this opponent removed its score
    if (score === undefined) {
      delete set.scores[opponentId]
    } else {
      set.scores[opponentId] = score
    }
    // update the setContribCache for all opponents in the match
    this.updateSetCache(setId, match)
    // Mark the match as complete if needed
    match.complete = false
    if (this.matchIsComplete(match)) {
      match.complete = true
    }
    this.matchesToProgress.set(idToString(match.id), match.id)
    this.progress()
    this.updateCompletion()
    this.updatePlayersTelemetry()
    this.updateResultsCache()
  }

  protected validateOpponents(opponents: Opponent[]): void {
    if (opponents.length < 2) {
      throw new Error(`validateOpponents: at least 2 opponents are required.`)
    }
    const uniqOpponents = new Set(opponents.map((o) => o.id))
    if (Array.from(uniqOpponents).length != opponents.length) {
      throw new Error(`validateOpponents: unicity in opponents id is not respected.`)
    }
    if (opponents[0]!.type === "team") {
      ;(opponents as TeamOpponent[]).flatMap((t) => t.players.map((p) => p.id)).forEach((id) => uniqOpponents.add(id))
      if (
        Array.from(uniqOpponents).length !=
        opponents.length + (opponents as TeamOpponent[]).flatMap((t) => t.players.map((p) => p.id)).length
      ) {
        throw new Error(`validateOpponents: unicity in opponents id is not respected.`)
      }
    }
  }

  protected validateSettings(settings: PhaseSettings, _opponents: Opponent[]): void {
    if (!["duel", "ffa", "roundrobin"].includes(settings.type)) {
      throw new Error(`validateSettings: type must be one of 'duel', 'ffa' or 'roundrobin'.`)
    }
    if (settings.nbMatchSets.length === 0) {
      throw new Error(`validateSettings: nbMatchSets must not be empty.`)
    }
    if (settings.nbMatchSets.some((set) => typeof set === "string" || (set as unknown) instanceof String)) {
      throw new Error(`validateSettings: all nbMatchSets must be numbers.`)
    }
    if (settings.nbMatchSets.some((set) => set <= 0)) {
      throw new Error(`validateSettings: all nbMatchSets must be greater than 0.`)
    }
    if (!["bestOfN", "sumOfSets"].includes(settings.matchWinRule)) {
      throw new Error(`validateSettings: matchWinRule must be either "bestOfN" or "sumOfSets".`)
    }
  }

  protected updateResultsCache() {
    // Get players telemetry, extract the place and forfeit status, and update the resultsCache
    const results = this.players.map((player) => {
      return {
        opponentId: player.id,
        rank: 0,
        forfeit: player.forfeit,
        telemetry: player.stats
      }
    })

    this.resultsCache = results
      .sort(
        // TODO: Validate the sorting criteria
        ({ forfeit: ffa, telemetry: a }, { forfeit: ffb, telemetry: b }) =>
          (ffa ? 1 : 0) - (ffb ? 1 : 0) ||
          b.matchesWon - a.matchesWon ||
          b.setsWon - a.setsWon ||
          b.matchesDraw - a.matchesDraw ||
          b.setsDraw - a.setsDraw ||
          b.ratioPoints - a.ratioPoints
      )
      .map((result, index) => ({ ...result, rank: index + 1 }))

    this.resultsCache.forEach((result, index) => {
      if (this.resultsCache[index + 1] && sameResults(result, this.resultsCache[index + 1]!)) {
        this.resultsCache[index + 1]!.rank = result.rank
      }
    })
  }

  protected updateCompletion() {
    this.completion = this.matches.filter((match) => match.complete).length / this.matches.length
  }

  protected indexMatches(): void {
    this.matchIndex.clear()
    for (const match of this.matches) {
      this.matchIndex.set(idToString(match.id), match)
    }
  }

  protected matchIsComplete(match: Match): boolean {
    return match.sets.every((set) => Object.keys(set.scores).length === match.opponents.length)
  }

  /**
   * If the score is impossible to set, returns a string explaining why. Otherwise returns nothing
   * @param setId The ID of the set to score
   * @param opponentId The ID of the opponent to score
   * @param score The score to set, or undefined to remove the score
   * @returns A string explaining why the score is impossible, or nothing if it is possible
   */
  protected notScorable(setId: SetId, opponentId: OpponentId, _score: number | undefined): string | void {
    const match = this._getMatch(setId)
    if (!match) {
      return `Match not found`
    }
    if (!match.sets[setId.set - 1]) {
      return `Set ${setId.set} not found in match`
    }
    if (!match.opponents.some((opponent) => opponent?.id === opponentId)) {
      return `Opponent ${opponentId} not found in match`
    }
    if (match.opponents.some((o) => o === undefined)) {
      return `Match is not ready, not enough opponents`
    }
    if (match?.locked) {
      return "Match is locked"
    }
    // Additional checks can be implemented in subclasses
  }

  protected _getMatch(matchId: MatchId): Match | undefined {
    const { set, ...mId } = matchId
    return this.matchIndex.get(idToString(mId)) || this.matches.find((match) => compatibleIds(mId, match.id))
  }

  protected _getMatches(filter?: Partial<MatchId>): Match[] {
    return this.matches.filter((match) => !filter || compatibleIds(filter, match.id))
  }
}
