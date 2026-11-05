import { newOpponents } from "./tools"
import { TournamentPhase } from "./types"
import type { Entrants, Opponent, OpponentId, TournamentSettings, Match, MatchId, SetId, Result } from "./types"
import type { Phase } from "./phase"

export interface TournamentInterface {
  readonly settings: TournamentSettings

  getCurrentPhase(): Phase | undefined
  /**
   * Results and statistics of each players, also available in players objects
   */
  getResult(): Result[]
  /**
   * Percentage of completed matches (between 0 and 1).
   * If tournament has two phases, each phase represents 50% even if they don't have the same number of matches
   */
  getCompletion(): number

  getOpponents(includeForfeited: boolean): Opponent[]
  /**
   * if a player if declared forfeit, its next matches will be lost.
   * If a player if reverted from forfeit, these lost matches are not recovered.
   */
  toggleForfeit(opponentId: OpponentId): void

  getMatch(matchId: MatchId): Match | undefined
  getMatches(filter: Partial<MatchId>): Match[]

  /**
   * Each phase need to be started individually.
   * This allows to check the last scores of the previous phase before starting the next one.
   */
  startPhase(phase: TournamentPhase): void

  score(setId: SetId, opponentId: OpponentId, score: number): void
}

export class Tournament implements TournamentInterface {
  readonly settings: TournamentSettings
  private opponents: Opponent[]
  private useTeams: boolean
  private phases: Record<TournamentPhase, Phase>
  private currentPhase: TournamentPhase | undefined
  private completion: number = 0
  private resultsCache: Result[] = []

  constructor(entrants: Entrants, settings: TournamentSettings) {
    this.useTeams = entrants[0]?.type === "team"
    this.validateEntrants(entrants)
    this.opponents = newOpponents(entrants)
    this.validateSettings(settings)
    this.settings = settings
    this.phases = {} as Record<TournamentPhase, Phase>
  }

  getCurrentPhase(): Phase | undefined {
    if (this.currentPhase) {
      return this.phases[this.currentPhase]
    }
    return undefined
  }

  getResult(): Result[] {
    return this.resultsCache
  }

  getCompletion(): number {
    return this.completion
  }

  getOpponents(includeForfeited: boolean = true): Opponent[] {
    return this.opponents.filter((opponent) => includeForfeited || !opponent.forfeit)
  }

  toggleForfeit(opponentId: OpponentId): void {
    const opponent = this.opponents.find((o) => o.id === opponentId)
    if (opponent) {
      opponent.forfeit = !opponent.forfeit
    }
  }

  getMatch(matchId: MatchId): Match | undefined {
    if (!this.currentPhase) return undefined
    if (this.currentPhase == TournamentPhase.Pool) {
      return this.phases[this.currentPhase].getMatch(matchId)
    }
    return this.phases[this.currentPhase].getMatch(matchId) || this.phases[TournamentPhase.Pool].getMatch(matchId)
  }

  getMatches(filter: Partial<MatchId>): Match[] {
    return Object.values(this.phases).flatMap((phase) => phase.getMatches(filter))
  }

  startPhase(_phase: TournamentPhase = TournamentPhase.Pool): void {
    throw new Error(`startPhase: not yet implemented.`)
  }

  score(setId: SetId, opponentId: OpponentId, score: number): void {
    if (!this.currentPhase) return
    this.phases[this.currentPhase].score(setId, opponentId, score)
    this.updateResultsCache()
    this.updateCompletion()
  }

  private validateEntrants(entrants: Entrants): void {
    if (entrants.length < 2) {
      throw new Error(`validateEntrants: at least 2 entrants are required.`)
    }
    if (Array.from(new Set(entrants.map((e) => e.id))).length != entrants.length) {
      throw new Error(`validateEntrants: unicity in entrants id is not respected.`)
    }
    if (this.useTeams) {
      const ids = entrants.filter((e) => e.type === "team").flatMap((e) => [e.id, ...e.players.map((p) => p.id)])
      if (Array.from(new Set(ids)).length != ids.length) {
        throw new Error(`validateEntrants: unicity in entrants id is not respected.`)
      }
    }
  }

  private validateSettings(_settings: TournamentSettings): void {
    throw new Error(`validateSettings: net yet implemented.`)
  }

  private updateResultsCache(): void {
    // console.error(`updateResultsCache: not yet implemented.`)
  }

  private updateCompletion(): void {
    const nbPhases = this.settings.phases.length
    if (nbPhases === 0) return
    let completion = 0
    Object.values(this.phases).forEach((phase) => (completion += phase.getCompletion()))
    this.completion = completion / nbPhases
  }
}
