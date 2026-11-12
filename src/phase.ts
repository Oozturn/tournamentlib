import { compatibleIds, deepCopyMatch, deepCopyOpponents, idToString, newOpponents, sameResults } from "./tools"
import { MATCH_WIN_RULES, PHASE_TYPES } from "./types"
import type {
  Opponent,
  OpponentId,
  PhaseSettings,
  PhaseType,
  Match,
  Result,
  SetId,
  MatchId,
  TournamentPhase,
  matchIdString,
  SetContribCache,
  MatchContribCache
} from "./types"

export interface Phase {
  readonly type: PhaseType
  readonly settings: PhaseSettings

  /**
   * Initializes the phase with the ids of its opponents and its settings: validates them, creates an opponent for each
   * id in the order of the list, which sets the seeding (without forfeit and with zeroed stats), copies the settings,
   * generates the matches and progresses the walkovers. Each id must be a non-empty string, unique in the list. To
   * declare a forfeit before the phase starts, call `toggleForfeit` after `init`. It can only succeed once: any later call throws, while a call rejected by validation
   * leaves the phase empty and can be retried.
   * Until then, `settings` is `undefined` despite its type, reads return empty values, and `score` and `toggleForfeit` throw.
   */
  init(opponentIds: OpponentId[], settings: PhaseSettings): void

  /**
   * Returns the current ranking of the phase, one entry per opponent, sorted by rank, computed on each call from the
   * opponents' forfeit and telemetry. Returns an empty list before `init`.
   */
  getResult(): Result[]
  /**
   * Returns the phase completion ratio, from 0 (no match complete) to 1 (all matches complete), computed on each call.
   * Matches completed by a walkover or a forfeit count as complete. Returns 0 before `init`.
   */
  getCompletion(): number

  /**
   * Returns the opponents of the phase.
   * @param includeForfeited Whether to include opponents who have forfeited
   */
  getOpponents(includeForfeited: boolean): Opponent[]
  /**
   * Toggles the forfeit status of an opponent, then re-progresses the phase so that
   * matches, telemetry and results reflect the new forfeit state.
   * A match resolved by a forfeit carries the score `"FF"` for each opponent who forfeited, and no score for the other
   * opponents. This is the only way to write `"FF"`. How a forfeit resolves a match depends on the phase type.
   */
  toggleForfeit(opponentId: OpponentId): void

  /** Returns a single match by id, or undefined if it does not exist. */
  getMatch(matchId: MatchId): Match | undefined
  /** Returns every match matching the given partial id (e.g. all matches of a given round or bracket). */
  getMatches(filter: Partial<MatchId>): Match[]

  /**
   * Records (or removes, when score is undefined) an opponent's score for a given set, then progresses the
   * tournament and recomputes telemetry accordingly.
   * The score must be a finite number or undefined: `"FF"` is rejected, as only a declared forfeit (`toggleForfeit`)
   * writes it.
   */
  score(setId: SetId, opponentId: OpponentId, score: number | undefined): void
}

export abstract class PhaseBase implements Phase {
  readonly type: PhaseType
  settings!: PhaseSettings
  readonly tournamentPhase: TournamentPhase
  private initialized: boolean = false
  protected matches: Match[] = []
  protected opponents: Opponent[] = []

  // Avoid to search for matches to progress by caching the edited ones
  protected matchesToProgress: Map<matchIdString, MatchId> = new Map()
  // Avoid to search for players to update telemetry by caching the edited ones
  protected playersToUpdateTelemetry: Set<OpponentId> = new Set()
  // Data updated when a set is complete
  protected setContribCache: SetContribCache = {}
  // Data updated when the match is complete
  protected matchContribCache: MatchContribCache = {}

  protected matchIndex: Map<matchIdString, Match> = new Map()

  constructor(type: PhaseType, tournamentPhase: TournamentPhase) {
    this.type = type
    this.tournamentPhase = tournamentPhase
  }

  /**
   * This method is called in init() of the subclasses to generate the matches for the phase.
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
   * It saves the contribution of each opponent in the set to the setContribCache, so that it can be
   * used later to update telemetry or progress the tournament without parsing all the matches again.
   * @param setId The ID of the set to save
   * @param match The match containing the set to save
   */
  protected abstract updateSetCache(setId: SetId, match: Match): void

  /**
   * This method is called from progress() when a match is complete.
   * It saves the contribution of each opponent in the match to the matchContribCache, so that it can be
   * used later to update telemetry or progress the tournament without parsing all the matches again.
   * @param match The match to save
   */
  protected abstract updateMatchCache(match: Match): void

  /**
   * Updates the telemetry for the opponents in PhaseBase.opponentsToUpdateTelemetry
   *
   */
  protected abstract updatePlayersTelemetry(): void

  public init(opponentIds: OpponentId[], settings: PhaseSettings): void {
    if (this.initialized) {
      throw new Error(`init: phase is already initialized.`)
    }
    this.validateOpponentIds(opponentIds)
    this.validateSettings(settings, opponentIds)
    this.initialized = true
    this.opponents = newOpponents(opponentIds)
    this.settings = {
      ...settings,
      nbMatchSets: [...settings.nbMatchSets],
      allMatchesSameSetsNumber: settings.allMatchesSameSetsNumber ?? true,
      invertedScoring: !!settings.invertedScoring
    }
  }

  public getResult(): Result[] {
    const results: Result[] = this.opponents
      .map((opponent) => ({
        opponentId: opponent.id,
        rank: 0,
        forfeit: opponent.forfeit,
        telemetry: { ...opponent.stats }
      }))
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

    results.forEach((result, index) => {
      if (results[index + 1] && sameResults(result, results[index + 1]!)) {
        results[index + 1]!.rank = result.rank
      }
    })
    return results
  }

  public getCompletion(): number {
    if (this.matches.length === 0) {
      return 0
    }
    return this.matches.filter((match) => match.complete).length / this.matches.length
  }

  public getOpponents(includeForfeited: boolean): Opponent[] {
    return deepCopyOpponents(this.opponents.filter((o) => includeForfeited || !o.forfeit)).filter(
      (o) => o !== undefined
    )
  }

  public toggleForfeit(opponentId: OpponentId): void {
    const opponent = this.opponents.find((o) => o.id === opponentId)
    if (!opponent) {
      throw new Error(`toggleForfeit: opponent ${opponentId} not found.`)
    }
    opponent.forfeit = !opponent.forfeit

    const matchToProgress = this.matches.find((m) => !m.complete && m.opponents.some((o) => o?.id === opponentId))
    if (matchToProgress) {
      this.matchesToProgress.set(idToString(matchToProgress.id), matchToProgress.id)
    }
    this.progress()
    this.updatePlayersTelemetry()
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
    this.updatePlayersTelemetry()
  }

  protected validateOpponentIds(opponentIds: OpponentId[]): void {
    if (opponentIds.length < 2) {
      throw new Error(`validateOpponentIds: at least 2 opponents are required.`)
    }
    // Checked before the empty and unique ids, which only make sense on strings: a JavaScript caller passing objects
    // would otherwise get them as opponent ids.
    if (opponentIds.some((id) => typeof id !== "string")) {
      throw new Error(`validateOpponentIds: opponent ids must be strings.`)
    }
    if (opponentIds.includes("")) {
      throw new Error(`validateOpponentIds: opponent ids must not be empty.`)
    }
    if (new Set(opponentIds).size !== opponentIds.length) {
      throw new Error(`validateOpponentIds: opponent ids must be unique.`)
    }
  }

  protected validateSettings(settings: PhaseSettings, _opponentIds: OpponentId[]): void {
    if (!PHASE_TYPES.includes(settings.type)) {
      throw new Error(`validateSettings: type must be one of ${PHASE_TYPES.join(", ")}.`)
    }
    if (settings.nbMatchSets.length === 0) {
      throw new Error(`validateSettings: nbMatchSets must not be empty.`)
    }
    if (settings.nbMatchSets.some((set) => !Number.isInteger(set))) {
      throw new Error(`validateSettings: all nbMatchSets must be integers.`)
    }
    if (settings.nbMatchSets.some((set) => set <= 0)) {
      throw new Error(`validateSettings: all nbMatchSets must be greater than 0.`)
    }
    if (!MATCH_WIN_RULES.includes(settings.matchWinRule)) {
      throw new Error(`validateSettings: matchWinRule must be one of ${MATCH_WIN_RULES.join(", ")}.`)
    }
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
  protected notScorable(setId: SetId, opponentId: OpponentId, score: number | undefined): string | void {
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
    if (score !== undefined && !Number.isFinite(score)) {
      return "Score must be a finite number"
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
