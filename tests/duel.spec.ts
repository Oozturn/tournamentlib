import {
  DuelPhase,
  DuelSettings,
  Entrant,
  Entrants,
  MATCH_WIN_RULES,
  MatchId,
  newOpponents,
  newTelemetry,
  PHASE_TYPES,
  PhaseBracket,
  PlayerEntrant,
  PlayerOpponent,
  TeamEntrant,
  TournamentPhase
} from "../src"
const W = PhaseBracket.winner
const L = PhaseBracket.loser
const F = TournamentPhase.Final

const zeroStats = {
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

function createPlayers(nb: number): PlayerEntrant[] {
  return Array.from({ length: nb }, (_, index) => ({
    id: `${index + 1}`,
    type: "player"
  }))
}
function createTeams(nbTeams: number, nbPlayersPerTeam: number): TeamEntrant[] {
  return Array.from({ length: nbTeams }, (_, index) => ({
    id: `${index + 1}`,
    type: "team",
    players: createPlayers(nbPlayersPerTeam).map((p) => ({ ...p, id: `${index + 1}-${p.id}` }))
  }))
}

const duelBaseSettings: DuelSettings = {
  type: "duel",
  invertedScoring: false,
  enableExtendedFinals: false,
  allMatchesSameSetsNumber: true,
  nbMatchSets: [1],
  nbLBMatchSets: [1],
  elimination: "single",
  matchWinRule: "bestOfN",
  downmix: true
}
function newDuel(nbOpponents: number, teams: boolean = false, settings?: Partial<DuelSettings>): DuelPhase {
  const opponents = teams ? createTeams(nbOpponents, 2) : createPlayers(nbOpponents)
  const duel = new DuelPhase(F)
  duel.init(opponents, { ...duelBaseSettings, ...settings })
  return duel
}
type Step = {
  b: PhaseBracket
  r: number
  m: number
  s?: number
  p1: string
  p2: string
  sc1: number
  sc2: number
}
function play(duel: DuelPhase, steps: Step[]): void {
  steps.forEach((st) => {
    duel.score({ phase: F, bracket: st.b, round: st.r, match: st.m, set: st.s || 1 }, st.p1, st.sc1)
    duel.score({ phase: F, bracket: st.b, round: st.r, match: st.m, set: st.s || 1 }, st.p2, st.sc2)
  })
}
function autoPlay(duel: DuelPhase, bracket: PhaseBracket | undefined = undefined): void {
  while (duel.getCompletion() < 1) {
    const next = duel.getMatches({ bracket }).find((m) => !m.complete && m.opponents.every((o) => o !== undefined))
    if (!next) {
      break
    }
    const [p1, p2] = next.opponents.map((o) => o?.id)
    const nextSet = next.sets.find((s) => Object.values(s.scores).length < 2)
    if (nextSet) {
      duel.score(nextSet.id, p1!, 3)
      duel.score(nextSet.id, p2!, 1)
    }
  }
}

const score = (
  duel: DuelPhase,
  bracket: PhaseBracket,
  round: number,
  match: number,
  set: number,
  opponentId: string,
  scoreValue: number | undefined
) => {
  duel.score({ phase: F, bracket, round, match, set }, opponentId, scoreValue)
}

describe("Duel phase structure and graph", () => {
  describe("Duel input validation", () => {
    test("Duel type", () =>
      expect(() => newDuel(2, false, { elimination: "invalid" } as unknown as Partial<DuelSettings>)).toThrow(
        'validateSettings: elimination must be either "single" or "double".'
      ))
    test("Minimum opponents", () =>
      expect(() => newDuel(1)).toThrow("validateEntrants: at least 2 entrants are required."))
    test("Double elimination minimum opponents", () =>
      expect(() => newDuel(2, false, { elimination: "double" })).toThrow(
        "validateSettings: double elimination requires at least 4 opponents."
      ))
    test("Extended finals minimum opponents", () =>
      expect(() => newDuel(2, false, { enableExtendedFinals: true })).toThrow(
        "validateSettings: enableExtendedFinals requires at least 4 opponents."
      ))

    test("Duplicate player IDs", () => {
      const players = createPlayers(2).map((p) => ({ ...p, id: "a" }))
      const duel = new DuelPhase(F)
      expect(() => duel.init(players, duelBaseSettings)).toThrow(
        "validateEntrants: unicity in entrants id is not respected."
      )
    })
    test("Duplicate team player IDs", () => {
      const teams = createTeams(2, 2).map((t) => ({
        ...t,
        players: t.players.map((p, index) => ({ ...p, id: `${index + 1}` }))
      }))
      const duel = new DuelPhase(F)
      expect(() => duel.init(teams, duelBaseSettings)).toThrow(
        "validateEntrants: unicity in entrants id is not respected."
      )
    })
    test("Correct team player IDs", () => {
      expect(() => newDuel(2, true)).not.toThrow()
    })
    test("Correct simple elimination Duel", () => {
      expect(() => newDuel(2)).not.toThrow()
    })
    test("Correct double elimination Duel", () => {
      expect(() => newDuel(4, false, { ...duelBaseSettings, elimination: "double" })).not.toThrow()
    })

    const initWith = (entrants: Entrant[]) => () => new DuelPhase(F).init(entrants as Entrants, duelBaseSettings)
    const mixedError = "validateEntrants: entrants must be either all players or all teams."
    const emptyTeamError = "validateEntrants: every team must have at least one player."
    const emptyIdError = "validateEntrants: entrant ids must not be empty."
    const unicityError = "validateEntrants: unicity in entrants id is not respected."

    test("Mixed players and teams", () => {
      const player = createPlayers(2)[1]!
      const team = createTeams(1, 1)[0]!
      expect(initWith([player, team])).toThrow(mixedError)
      expect(initWith([team, player])).toThrow(mixedError)
    })
    test("Mixed players and teams don't compile", () => {
      const player = createPlayers(2)[1]!
      const team = createTeams(1, 1)[0]!
      const duel = new DuelPhase(F)
      // @ts-expect-error: a list that mixes players and teams must be refused at compile time
      expect(() => duel.init([player, team], duelBaseSettings)).toThrow(mixedError)
    })
    test("Team without players", () => {
      const [team1, team2] = createTeams(2, 1)
      expect(initWith([{ ...team1!, players: [] }, team2!])).toThrow(emptyTeamError)
      expect(initWith(createTeams(2, 0))).toThrow(emptyTeamError)
    })
    test("Empty ids", () => {
      const [player1, player2] = createPlayers(2)
      const [team1, team2] = createTeams(2, 2)
      const [teamPlayer, otherTeamPlayer] = team1!.players
      expect(initWith([{ ...player1!, id: "" }, player2!])).toThrow(emptyIdError)
      expect(initWith([{ ...team1!, id: "" }, team2!])).toThrow(emptyIdError)
      expect(initWith([{ ...team1!, players: [{ ...teamPlayer!, id: "" }, otherTeamPlayer!] }, team2!])).toThrow(
        emptyIdError
      )
    })
    test("Several empty ids report the empty id, not the unicity", () => {
      const players = createPlayers(2).map((p) => ({ ...p, id: "" }))
      expect(initWith(players)).toThrow(emptyIdError)
    })
    test("Duplicate team IDs", () => {
      const teams = createTeams(2, 1).map((t) => ({ ...t, id: "a" }))
      expect(initWith(teams)).toThrow(unicityError)
    })
    test("Duplicate player IDs within a team", () => {
      const [team1, team2] = createTeams(2, 2)
      const players = team1!.players.map((p) => ({ ...p, id: "a" }))
      expect(initWith([{ ...team1!, players }, team2!])).toThrow(unicityError)
    })
    test("Player with the ID of a team", () => {
      const [team1, team2] = createTeams(2, 1)
      const players = team1!.players.map((p) => ({ ...p, id: team2!.id }))
      expect(initWith([{ ...team1!, players }, team2!])).toThrow(unicityError)
    })
    test("Only players or only teams", () => {
      expect(initWith(createPlayers(4))).not.toThrow()
      expect(initWith(createTeams(4, 2))).not.toThrow()
    })
    test("Generated walkovers keep their empty id", () => {
      const firstRound = newDuel(3).getMatches({ bracket: W, round: 1 })
      expect(firstRound.flatMap((m) => m.opponents.map((o) => o?.id))).toContain("")
    })
  })

  describe("Phase common settings validation", () => {
    test("Accepted values are exported", () => {
      expect(PHASE_TYPES).toEqual(["duel", "ffa", "roundrobin"])
      expect(MATCH_WIN_RULES).toEqual(["bestOfN", "sumOfSets"])
    })
    test("Empty nbMatchSets", () =>
      expect(() => newDuel(2, false, { ...duelBaseSettings, nbMatchSets: [] })).toThrow(
        "validateSettings: nbMatchSets must not be empty."
      ))
    test("Invalid nbMatchSets", () => {
      expect(() => newDuel(2, false, { ...duelBaseSettings, nbMatchSets: [-1, 2] })).toThrow(
        "validateSettings: all nbMatchSets must be greater than 0."
      )
      expect(() => newDuel(2, false, { ...duelBaseSettings, nbMatchSets: [0, 2] })).toThrow(
        "validateSettings: all nbMatchSets must be greater than 0."
      )
    })
    test.each<[string, unknown]>([
      ["1.5", 1.5],
      ["NaN", NaN],
      ["Infinity", Infinity],
      ['"1"', "1"],
      ['new String("1")', new String("1")],
      ["true", true],
      ["null", null],
      ["undefined", undefined]
    ])("Non-integer nbMatchSets: %s", (_name, value) => {
      expect(() => newDuel(2, false, { nbMatchSets: [value] } as unknown as DuelSettings)).toThrow(
        "validateSettings: all nbMatchSets must be integers."
      )
    })
    test("Positive integers in nbMatchSets", () => {
      expect(() => newDuel(2, false, { nbMatchSets: [1, 3, 5] })).not.toThrow()
    })
    test("Invalid type", () => {
      expect(() => newDuel(2, false, { type: "invalid" } as unknown as DuelSettings)).toThrow(
        "validateSettings: type must be one of duel, ffa, roundrobin."
      )
    })
    test("Invalid matchWinRule", () => {
      expect(() =>
        newDuel(2, false, { ...duelBaseSettings, matchWinRule: "invalid" } as unknown as DuelSettings)
      ).toThrow("validateSettings: matchWinRule must be one of bestOfN, sumOfSets.")
    })

    describe("allMatchesSameSetsNumber", () => {
      const setsPerMatch = (duel: DuelPhase) => duel.getMatches().map((m) => m.sets.length)

      test("Defaults to true when absent", () => {
        const settings: Partial<DuelSettings> = { ...duelBaseSettings, nbMatchSets: [2, 3] }
        delete settings.allMatchesSameSetsNumber
        const duel = new DuelPhase(F)
        duel.init(createPlayers(4), settings as DuelSettings)
        expect(duel.settings.allMatchesSameSetsNumber).toBe(true)
        expect(setsPerMatch(duel)).toEqual([2, 2, 2])
      })
      test("Keeps false when provided", () => {
        const duel = newDuel(4, false, { nbMatchSets: [2, 3], allMatchesSameSetsNumber: false })
        expect(duel.settings.allMatchesSameSetsNumber).toBe(false)
        expect(setsPerMatch(duel)).toEqual([2, 2, 3])
      })
    })
  })

  describe("Duel phase structure", () => {
    test("Number of matches", () => {
      // Single elimination
      expect(newDuel(4).getMatches().length).toBe(3)
      expect(newDuel(8).getMatches().length).toBe(7)
      expect(newDuel(8, false, { enableExtendedFinals: true }).getMatches().length).toBe(8)
      expect(newDuel(14).getMatches().length).toBe(15)
      // Double elimination
      expect(newDuel(4, false, { elimination: "double" }).getMatches().length).toBe(6)
      expect(newDuel(4, false, { elimination: "double", enableExtendedFinals: true }).getMatches().length).toBe(7)
      expect(newDuel(8, false, { elimination: "double" }).getMatches().length).toBe(14)
      expect(newDuel(14, false, { elimination: "double" }).getMatches().length).toBe(30)
      // Loser bracket matches
      expect(newDuel(4).getMatches({ bracket: L }).length).toBe(0)
      expect(newDuel(4, false, { enableExtendedFinals: true }).getMatches({ bracket: L }).length).toBe(1)
      expect(newDuel(4, false, { elimination: "double" }).getMatches({ bracket: L }).length).toBe(3)
      expect(
        newDuel(4, false, { elimination: "double", enableExtendedFinals: true }).getMatches({
          bracket: L
        }).length
      ).toBe(4)
      // Finals
      expect(newDuel(4).getMatches({ bracket: W, round: 2 }).length).toBe(1) // No LB, no bronze
      expect(newDuel(4, false, { enableExtendedFinals: true }).getMatches({ round: 2 }).length).toBe(1) // No LB, bronze
      expect(newDuel(4, false, { enableExtendedFinals: true }).getMatches({ bracket: L, round: 1 }).length).toBe(1) // No LB, bronze
      expect(newDuel(4, false, { elimination: "double" }).getMatches({ bracket: L, round: 3 }).length).toBe(1) // LB, no extended finals
      expect(newDuel(4, false, { elimination: "double" }).getMatches({ bracket: L, round: 4 }).length).toBe(0) // LB, no extended finals
      expect(
        newDuel(4, false, { elimination: "double", enableExtendedFinals: true }).getMatches({
          bracket: L,
          round: 4
        }).length
      ).toBe(1) // LB, no extended finals
      expect(
        newDuel(4, false, { elimination: "double", enableExtendedFinals: false }).getMatches({ round: 4 }).length
      ).toBe(0)
      expect(
        newDuel(4, false, { elimination: "double", enableExtendedFinals: true }).getMatches({ round: 4 }).length
      ).toBe(1)
    })

    test("number of sets", () => {
      expect(
        newDuel(4, false, { nbMatchSets: [1] })
          .getMatches()
          .every((m) => m.sets.length === 1)
      ).toBe(true)
      expect(
        newDuel(4, false, { nbMatchSets: [3] })
          .getMatches()
          .every((m) => m.sets.length === 3)
      ).toBe(true)
      expect(
        newDuel(4, false, { nbMatchSets: [3], elimination: "double" })
          .getMatches({ bracket: L })
          .every((m) => m.sets.length === 1)
      ).toBe(true)
      expect(
        newDuel(4, false, { nbMatchSets: [3], nbLBMatchSets: [2], elimination: "double" })
          .getMatches({ bracket: L })
          .every((m) => m.sets.length === 2)
      ).toBe(true)
      expect(
        newDuel(4, false, {
          nbMatchSets: [3],
          nbLBMatchSets: [2],
          elimination: "double",
          allMatchesSameSetsNumber: false
        })
          .getMatches({ bracket: L })
          .filter((m) => m.sets.length === 2).length
      ).toBe(1)
      expect(
        newDuel(4, false, {
          nbMatchSets: [3],
          nbLBMatchSets: [2],
          elimination: "double",
          allMatchesSameSetsNumber: false
        }).getMatch({ phase: F, bracket: L, round: 3, match: 1 })?.sets.length
      ).toBe(2)
      expect(
        newDuel(4, false, {
          nbMatchSets: [3],
          nbLBMatchSets: [2],
          elimination: "double",
          enableExtendedFinals: true,
          allMatchesSameSetsNumber: false
        }).getMatch({ phase: F, bracket: L, round: 3, match: 1 })?.sets.length
      ).toBe(2)
      expect(
        newDuel(4, false, {
          nbMatchSets: [3],
          nbLBMatchSets: [2],
          elimination: "double",
          enableExtendedFinals: true,
          allMatchesSameSetsNumber: false
        }).getMatch({ phase: F, bracket: L, round: 4, match: 1 })?.sets.length
      ).toBe(2)
      expect(
        newDuel(8, false, { nbMatchSets: [2, 3], allMatchesSameSetsNumber: false })
          .getMatches()
          .filter((m) => m.sets.length === 1).length
      ).toBe(4)
      expect(
        newDuel(8, false, { nbMatchSets: [2, 3], allMatchesSameSetsNumber: false })
          .getMatches()
          .filter((m) => m.sets.length === 2).length
      ).toBe(2)
      expect(
        newDuel(8, false, { nbMatchSets: [2, 3], allMatchesSameSetsNumber: false })
          .getMatches()
          .filter((m) => m.sets.length === 3).length
      ).toBe(1)
    })

    test("Match seeding", () => {
      const getOpponentsSeeding = (duel: DuelPhase) =>
        duel.getMatches({ bracket: W, round: 1 }).flatMap((m) => m.opponents.map((o) => o?.id))
      expect(getOpponentsSeeding(newDuel(8))).toEqual(["1", "8", "4", "5", "2", "7", "3", "6"])
      expect(getOpponentsSeeding(newDuel(6))).toEqual(["1", "", "4", "5", "2", "", "3", "6"])
      expect(
        newDuel(6)
          .getMatch({ phase: F, bracket: W, round: 1, match: 1 })
          ?.opponents.filter((o) => o?.id === "")
          .at(0)
      ).toStrictEqual({
        id: "",
        type: "player",
        forfeit: true,
        stats: {}
      })
    })
  })
})

describe("Duel phase scoring and progression", () => {
  describe("Match scoring", () => {
    test("Score unscorable reasons, undefined and zero", () => {
      const duel = newDuel(4)
      expect(() => score(duel, W, 1, 1, 1, "1", 3)).not.toThrow()
      expect(() => score(duel, W, 1, 1, 1, "2", 3)).toThrow(
        "score: impossible to score 1.1.1.1 / 2 / 3: Opponent 2 not found in match"
      )
      expect(() => score(duel, W, 1, 3, 1, "1", 3)).toThrow(
        "score: impossible to score 1.1.3.1 / 1 / 3: Match not found"
      )
      expect(() => score(duel, W, 1, 1, 2, "1", 3)).toThrow(
        "score: impossible to score 1.1.1.2 / 1 / 3: Set 2 not found in match"
      )
      expect(() => score(duel, W, 1, 1, 1, "4", 1)).not.toThrow()
      expect(() => score(duel, W, 2, 1, 1, "1", 3)).toThrow(
        "score: impossible to score 1.2.1.1 / 1 / 3: Match is not ready, not enough opponents"
      )
      expect(() => score(duel, W, 1, 1, 1, "4", 3)).toThrow(
        "score: impossible to score 1.1.1.1 / 4 / 3: Match would be a draw, which is not allowed"
      )
      expect(() => score(duel, W, 1, 1, 1, "4", 2)).not.toThrow()
      play(duel, [{ b: W, r: 1, m: 2, p1: "2", p2: "3", sc1: 3, sc2: 1 }])
      expect(() => score(duel, W, 2, 1, 1, "1", 3)).not.toThrow()
      expect(() => score(duel, W, 1, 1, 1, "4", 1)).toThrow(
        "score: impossible to score 1.1.1.1 / 4 / 1: Match is locked"
      )
      expect(() => score(duel, W, 2, 1, 1, "1", undefined)).not.toThrow()
      expect(() => score(duel, W, 1, 1, 1, "4", 4)).not.toThrow()
      expect(() => score(duel, W, 2, 1, 1, "4", 0)).not.toThrow()
    })
    test("Match scoring with inverted scoring and sumOfSets", () => {
      const duelSum = newDuel(4, false, { invertedScoring: true, matchWinRule: "sumOfSets", nbMatchSets: [3] })
      play(duelSum, [
        { b: W, r: 1, m: 1, s: 1, p1: "1", p2: "4", sc1: 3, sc2: 0 },
        { b: W, r: 1, m: 1, s: 2, p1: "1", p2: "4", sc1: 3, sc2: 3 },
        { b: W, r: 1, m: 1, s: 3, p1: "1", p2: "4", sc1: 0, sc2: 4 }
      ])
      expect(() => score(duelSum, W, 1, 1, 3, "4", 3)).toThrow(
        "score: impossible to score 1.1.1.3 / 4 / 3: Match would be a draw, which is not allowed"
      )
      expect(() => score(duelSum, W, 1, 1, 2, "1", 4)).toThrow(
        "score: impossible to score 1.1.1.2 / 1 / 4: Match would be a draw, which is not allowed"
      )
    })

    test("Match scoring with normal scoring and bestOfN", () => {
      const duelBest = newDuel(4, false, { matchWinRule: "bestOfN", nbMatchSets: [3] })
      play(duelBest, [
        { b: W, r: 1, m: 1, s: 1, p1: "1", p2: "4", sc1: 3, sc2: 0 },
        { b: W, r: 1, m: 1, s: 2, p1: "1", p2: "4", sc1: 4, sc2: 3 }
      ])
      // 1v4 : 3, 0 / 4, 3 => 1 wins 2 sets to 0
      expect(duelBest.getMatch({ phase: F, bracket: W, round: 1, match: 1 })?.complete).toBe(true)
      expect(duelBest.getMatch({ phase: F, bracket: W, round: 2, match: 1 })?.opponents[0]?.id).toBe("1")
      expect(() => score(duelBest, W, 1, 1, 2, "1", 3)).not.toThrow() // 2nd set is now draw
      expect(duelBest.getMatch({ phase: F, bracket: W, round: 2, match: 1 })?.opponents[0]?.id).toBe(undefined)
      expect(duelBest.getMatch({ phase: F, bracket: W, round: 1, match: 1 })?.complete).toBe(false)
      expect(() => score(duelBest, W, 1, 1, 3, "1", 1)).not.toThrow()
      expect(() => score(duelBest, W, 1, 1, 3, "4", 3)).toThrow(
        "score: impossible to score 1.1.1.3 / 4 / 3: Match would be a draw, which is not allowed"
      )
      expect(() => score(duelBest, W, 1, 1, 3, "4", 5)).toThrow(
        "score: impossible to score 1.1.1.3 / 4 / 5: Match would be a draw, which is not allowed"
      )
      score(duelBest, W, 1, 1, 3, "4", 0)
      expect(duelBest.getMatch({ phase: F, bracket: W, round: 1, match: 1 })?.complete).toBe(true)
    })
  })

  test("Opponents progression no downmix", () => {
    const duel = newDuel(4, false, { enableExtendedFinals: true, elimination: "double" })
    play(duel, [{ b: W, r: 1, m: 1, p1: "1", p2: "4", sc1: 3, sc2: 1 }])
    expect(duel.getMatch({ phase: F, bracket: W, round: 2, match: 1 })?.opponents[0]?.id).toBe("1")
    expect(duel.getMatch({ phase: F, bracket: L, round: 1, match: 1 })?.opponents[1]?.id).toBe("4")
    // score until grand final 1
    play(duel, [
      { b: W, r: 1, m: 2, p1: "2", p2: "3", sc1: 3, sc2: 1 },
      { b: W, r: 2, m: 1, p1: "1", p2: "2", sc1: 3, sc2: 1 }
    ])
    expect(duel.getMatch({ phase: F, bracket: L, round: 3, match: 1 })?.opponents[0]?.id).toBe("1")
    play(duel, [
      { b: L, r: 1, m: 1, p1: "4", p2: "3", sc1: 3, sc2: 1 },
      { b: L, r: 2, m: 1, p1: "4", p2: "2", sc1: 3, sc2: 1 }
    ])
    expect(duel.getMatch({ phase: F, bracket: L, round: 3, match: 1 })?.opponents[1]?.id).toBe("4")
    expect(duel.getCompletion()).toBe(5 / 7)
    // WB Winner wins
    play(duel, [{ b: L, r: 3, m: 1, p1: "1", p2: "4", sc1: 3, sc2: 1 }])
    expect(duel.getCompletion()).toBe(1)
    score(duel, 2, 3, 1, 1, "1", undefined)
    expect(duel.getCompletion()).toBe(6 / 7)
    // LB Winner finally wins
    play(duel, [{ b: L, r: 3, m: 1, p1: "4", p2: "1", sc1: 3, sc2: 1 }])
    expect(duel.getCompletion()).toBe(6 / 7)
    play(duel, [{ b: L, r: 4, m: 1, p1: "4", p2: "1", sc1: 3, sc2: 1 }])
    expect(duel.getCompletion()).toBe(1)
  })

  test("Opponents progression downmix", () => {
    const duelDownmix = newDuel(16, false, { elimination: "double", downmix: true })
    autoPlay(duelDownmix)
    const duelNoDownmix = newDuel(16, false, { elimination: "double", downmix: false })
    autoPlay(duelNoDownmix)

    expect(
      duelDownmix.getMatches({ bracket: L, round: 2 }).flatMap((m) => m.opponents.map((o) => o?.id))
    ).toStrictEqual(["5", "9", "8", "12", "6", "10", "7", "11"])
    expect(
      duelNoDownmix.getMatches({ bracket: L, round: 2 }).flatMap((m) => m.opponents.map((o) => o?.id))
    ).toStrictEqual(["8", "9", "12", "5", "7", "10", "11", "6"])
  })

  test("Forfeit in team", () => {
    const duel = newDuel(4, true)
    duel.toggleForfeit("1-1")
    expect(duel.getOpponents(true, false).find((o) => o.id === "1")?.forfeit).toBe(false)
    duel.toggleForfeit("1-2")
    expect(duel.getOpponents(true, false).find((o) => o.id === "1")?.forfeit).toBe(true)
  })

  test("Forfeit and WO - scoring and progression", () => {
    const duel = newDuel(6, false, { enableExtendedFinals: true, elimination: "double" })
    expect(duel.getMatch({ phase: F, bracket: W, round: 1, match: 1 })?.opponents.map((o) => o?.id)).toStrictEqual([
      "1",
      ""
    ])
    expect(duel.getMatch({ phase: F, bracket: W, round: 1, match: 3 })?.opponents.map((o) => o?.id)).toStrictEqual([
      "2",
      ""
    ])
    expect(duel.getMatch({ phase: F, bracket: W, round: 2, match: 1 })?.opponents.map((o) => o?.id)).toStrictEqual([
      "1",
      undefined
    ])

    play(duel, [
      { b: W, r: 1, m: 2, p1: "4", p2: "5", sc1: 3, sc2: 1 },
      { b: W, r: 1, m: 4, p1: "3", p2: "6", sc1: 3, sc2: 1 }
    ])
    expect(duel.getMatch({ phase: F, bracket: L, round: 1, match: 1 })?.opponents.map((o) => o?.id)).toStrictEqual([
      "5",
      ""
    ])
    expect(duel.getMatch({ phase: F, bracket: L, round: 2, match: 1 })?.opponents.map((o) => o?.id)).toStrictEqual([
      undefined,
      "5"
    ])
    duel.toggleForfeit("5")
    play(duel, [
      { b: W, r: 2, m: 1, p1: "1", p2: "4", sc1: 3, sc2: 1 },
      { b: W, r: 2, m: 2, p1: "2", p2: "3", sc1: 3, sc2: 1 }
    ])
    expect(duel.getMatch({ phase: F, bracket: L, round: 2, match: 1 })?.complete).toBe(true)
    expect(duel.getMatch({ phase: F, bracket: L, round: 3, match: 1 })?.opponents.map((o) => o?.id)).toStrictEqual([
      "4",
      undefined
    ])
    expect(duel.getMatch({ phase: F, bracket: W, round: 3, match: 1 })?.opponents.map((o) => o?.id)).toStrictEqual([
      "1",
      "2"
    ])
    duel.score({ phase: F, bracket: W, round: 3, match: 1, set: 1 }, "1", 3)
    duel.toggleForfeit("2")
    expect(duel.getMatch({ phase: F, bracket: W, round: 3, match: 1 })?.complete).toBe(true)
    expect(duel.getMatch({ phase: F, bracket: W, round: 3, match: 1 })?.sets[0]?.scores).toStrictEqual({ "2": "FF" })
  })

  describe("Score validation", () => {
    const finiteError = "Score must be a finite number"

    test.each<[string, unknown]>([
      ["NaN", NaN],
      ["Infinity", Infinity],
      ["-Infinity", -Infinity],
      ['"3"', "3"],
      ["null", null],
      ['"FF"', "FF"]
    ])("Rejected score leaves the match unchanged: %s", (_name, value) => {
      const duel = newDuel(4)
      score(duel, W, 1, 1, 1, "4", 1)
      const before = duel.getMatches()
      expect(() => score(duel, W, 1, 1, 1, "1", value as number)).toThrow(finiteError)
      expect(duel.getMatches()).toEqual(before)
    })
    test('A "FF" score doesn\'t compile', () => {
      const duel = newDuel(4)
      // @ts-expect-error: only a declared forfeit writes "FF", score() never accepts it
      expect(() => duel.score({ phase: F, bracket: W, round: 1, match: 1, set: 1 }, "1", "FF")).toThrow(finiteError)
    })
    test("An invalid score on a locked match reports the lock", () => {
      const duel = newDuel(4)
      play(duel, [
        { b: W, r: 1, m: 1, p1: "1", p2: "4", sc1: 3, sc2: 1 },
        { b: W, r: 1, m: 2, p1: "2", p2: "3", sc1: 3, sc2: 1 }
      ])
      score(duel, W, 2, 1, 1, "1", 3)
      expect(() => score(duel, W, 1, 1, 1, "1", NaN)).toThrow("Match is locked")
    })
    test("An undefined score removes the score", () => {
      const duel = newDuel(4)
      score(duel, W, 1, 1, 1, "1", 3)
      score(duel, W, 1, 1, 1, "1", undefined)
      expect(duel.getMatch({ phase: F, bracket: W, round: 1, match: 1 })?.sets[0]?.scores).toEqual({})
    })
    test("Negative and decimal scores are accepted", () => {
      const duel = newDuel(4)
      score(duel, W, 1, 1, 1, "1", -1)
      score(duel, W, 1, 1, 1, "4", 2.5)
      expect(duel.getMatch({ phase: F, bracket: W, round: 1, match: 1 })?.sets[0]?.scores).toEqual({
        "1": -1,
        "4": 2.5
      })
    })
  })

  describe("Duel results and completion", () => {
    test("Duel results - single elimination, no extended finals", () => {
      const duel = newDuel(4)
      autoPlay(duel)
      expect(duel.getResult().map((r) => ({ id: r.opponentId, forfeit: r.forfeit, rank: r.rank }))).toStrictEqual([
        { id: "1", forfeit: false, rank: 1 },
        { id: "2", forfeit: false, rank: 2 },
        { id: "3", forfeit: false, rank: 3 },
        { id: "4", forfeit: false, rank: 3 }
      ])
      expect(duel.getCompletion()).toBe(1)
    })
    test("Duel results - single elimination, extended finals", () => {
      const duel = newDuel(4, false, { enableExtendedFinals: true, elimination: "single" })
      autoPlay(duel)
      expect(duel.getResult().map((r) => ({ id: r.opponentId, forfeit: r.forfeit, rank: r.rank }))).toStrictEqual([
        { id: "1", forfeit: false, rank: 1 },
        { id: "2", forfeit: false, rank: 2 },
        { id: "4", forfeit: false, rank: 2 },
        { id: "3", forfeit: false, rank: 4 }
      ])
      expect(duel.getCompletion()).toBe(1)
    })
    test("Duel results - double elimination, extended finals", () => {
      const duel = newDuel(4, false, { enableExtendedFinals: true, elimination: "double" })
      autoPlay(duel)
      expect(duel.getResult().map((r) => ({ id: r.opponentId, forfeit: r.forfeit, rank: r.rank }))).toStrictEqual([
        { id: "1", forfeit: false, rank: 1 },
        { id: "2", forfeit: false, rank: 2 },
        { id: "3", forfeit: false, rank: 3 },
        { id: "4", forfeit: false, rank: 4 }
      ])
      expect(duel.getCompletion()).toBe(1)
    })
    test("Duel results - WO & FF, double elimination, extended finals", () => {
      const duel = newDuel(7, false, { enableExtendedFinals: true, elimination: "double" })
      autoPlay(duel, W)
      duel.toggleForfeit("4")
      autoPlay(duel)
      expect(duel.getResult().map((r) => ({ id: r.opponentId, forfeit: r.forfeit, rank: r.rank }))).toStrictEqual([
        { id: "1", forfeit: false, rank: 1 },
        { id: "2", forfeit: false, rank: 2 },
        { id: "3", forfeit: false, rank: 3 },
        { id: "5", forfeit: false, rank: 4 },
        { id: "6", forfeit: false, rank: 4 },
        { id: "7", forfeit: false, rank: 6 },
        { id: "4", forfeit: true, rank: 7 }
      ])
      expect(duel.getCompletion()).toBe(1)
    })
    test("Duel results - WO & FF, inverted score", () => {
      const duel = newDuel(7, false, { invertedScoring: true })
      autoPlay(duel, W)
      duel.toggleForfeit("4")
      autoPlay(duel)
      expect(duel.getResult().map((r) => ({ id: r.opponentId, forfeit: r.forfeit, rank: r.rank }))).toStrictEqual([
        { id: "6", forfeit: false, rank: 1 },
        { id: "5", forfeit: false, rank: 2 },
        { id: "7", forfeit: false, rank: 3 },
        { id: "1", forfeit: false, rank: 4 },
        { id: "2", forfeit: false, rank: 4 },
        { id: "3", forfeit: false, rank: 4 },
        { id: "4", forfeit: true, rank: 7 }
      ])
      expect(duel.getCompletion()).toBe(1)
    })
    test("Duel results - WO & FF, 3 sets bestOfN", () => {
      const duel = newDuel(7, false, {
        nbMatchSets: [3],
        nbLBMatchSets: [3],
        enableExtendedFinals: true,
        elimination: "double"
      })
      autoPlay(duel, W)
      duel.toggleForfeit("4")
      autoPlay(duel)
      expect(duel.getResult().map((r) => ({ id: r.opponentId, forfeit: r.forfeit, rank: r.rank }))).toStrictEqual([
        { id: "1", forfeit: false, rank: 1 },
        { id: "2", forfeit: false, rank: 2 },
        { id: "3", forfeit: false, rank: 3 },
        { id: "5", forfeit: false, rank: 4 },
        { id: "6", forfeit: false, rank: 4 },
        { id: "7", forfeit: false, rank: 6 },
        { id: "4", forfeit: true, rank: 7 }
      ])
      expect(duel.getCompletion()).toBe(1)
    })
    test("Duel results - WO & FF, 3 sets sumOf", () => {
      const duel = newDuel(7, false, {
        nbMatchSets: [3],
        nbLBMatchSets: [3],
        enableExtendedFinals: true,
        elimination: "double",
        matchWinRule: "sumOfSets"
      })
      autoPlay(duel, W)
      duel.toggleForfeit("4")
      autoPlay(duel)
      expect(duel.getResult().map((r) => ({ id: r.opponentId, forfeit: r.forfeit, rank: r.rank }))).toStrictEqual([
        { id: "1", forfeit: false, rank: 1 },
        { id: "2", forfeit: false, rank: 2 },
        { id: "3", forfeit: false, rank: 3 },
        { id: "5", forfeit: false, rank: 4 },
        { id: "6", forfeit: false, rank: 4 },
        { id: "7", forfeit: false, rank: 6 },
        { id: "4", forfeit: true, rank: 7 }
      ])
      expect(duel.getCompletion()).toBe(1)
    })
  })

  describe("Opponent telemetry", () => {
    test("Opponent telemetry - solo player", () => {
      const soloDuel = newDuel(7)
      play(soloDuel, [
        { b: W, r: 1, m: 2, p1: "4", p2: "5", sc1: 2, sc2: 3 },
        { b: W, r: 1, m: 3, p1: "2", p2: "7", sc1: 2, sc2: 7 },
        { b: W, r: 2, m: 1, p1: "1", p2: "5", sc1: 7, sc2: 1 }
      ])
      expect(soloDuel.getResult().find((r) => r.opponentId === "1")?.telemetry.matchesRemaining).toBe(1)
      soloDuel.toggleForfeit("1")
      play(soloDuel, [
        { b: W, r: 1, m: 4, p1: "3", p2: "6", sc1: 3, sc2: 0 },
        { b: W, r: 2, m: 2, p1: "7", p2: "3", sc1: 3, sc2: 0 }
      ])
      expect(soloDuel.getCompletion()).toBe(1)
      const results = soloDuel.getResult()
      expect(results.find((r) => r.opponentId === "1")?.telemetry).toStrictEqual({
        matchesPlayed: 1,
        matchesRemaining: 0,
        matchesWon: 1,
        matchesLost: 0,
        matchesDraw: 0,
        setsPlayed: 1,
        setsWon: 1,
        setsLost: 0,
        setsDraw: 0,
        scoredPoints: 7,
        concededPoints: 1,
        ratioPoints: ((7 - 1) / (7 + 1) + 1) / 2
      })
    })
    test("Opponent telemetry - team player", () => {
      const teamDuel = newDuel(7, true)
      play(teamDuel, [
        { b: W, r: 1, m: 2, p1: "4", p2: "5", sc1: 2, sc2: 3 },
        { b: W, r: 1, m: 3, p1: "2", p2: "7", sc1: 2, sc2: 7 },
        { b: W, r: 2, m: 1, p1: "1", p2: "5", sc1: 7, sc2: 1 }
      ])
      expect(teamDuel.getResult().find((r) => r.opponentId === "1-1")?.telemetry.matchesRemaining).toBe(1)
      teamDuel.toggleForfeit("1-1")
      play(teamDuel, [
        { b: W, r: 1, m: 4, p1: "3", p2: "6", sc1: 3, sc2: 0 },
        { b: W, r: 2, m: 2, p1: "7", p2: "3", sc1: 3, sc2: 0 },
        { b: W, r: 3, m: 1, p1: "1", p2: "7", sc1: 1, sc2: 0 }
      ])
      expect(teamDuel.getCompletion()).toBe(1)
      const results = teamDuel.getResult()
      expect(results.find((r) => r.opponentId === "1-1")?.telemetry).toStrictEqual({
        matchesPlayed: 1,
        matchesRemaining: 0,
        matchesWon: 1,
        matchesLost: 0,
        matchesDraw: 0,
        setsPlayed: 1,
        setsWon: 1,
        setsLost: 0,
        setsDraw: 0,
        scoredPoints: 7,
        concededPoints: 1,
        ratioPoints: ((7 - 1) / (7 + 1) + 1) / 2
      })
      expect(results.find((r) => r.opponentId === "1-2")?.telemetry).toStrictEqual({
        matchesPlayed: 2,
        matchesRemaining: 0,
        matchesWon: 2,
        matchesLost: 0,
        matchesDraw: 0,
        setsPlayed: 2,
        setsWon: 2,
        setsLost: 0,
        setsDraw: 0,
        scoredPoints: 8,
        concededPoints: 1,
        ratioPoints: ((8 - 1) / (8 + 1) + 1) / 2
      })
    })
  })
})

describe("Duel forfeit", () => {
  const matchId = (bracket: PhaseBracket, round: number, match: number) => ({ phase: F, bracket, round, match })
  const firstMatch = matchId(W, 1, 1)
  const final = matchId(W, 2, 1)
  const setScores = (duel: DuelPhase, id: MatchId) => duel.getMatch(id)?.sets.map((s) => s.scores)
  const opponentIds = (duel: DuelPhase, id: MatchId) => duel.getMatch(id)?.opponents.map((o) => o?.id)

  describe("Forfeit represented by the FF score", () => {
    test("A player's forfeit on a one-set match", () => {
      const duel = newDuel(4)
      duel.toggleForfeit("1")
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }])
      expect(duel.getMatch(firstMatch)?.complete).toBe(true)
      expect(opponentIds(duel, final)).toStrictEqual(["4", undefined])
    })
    test("A forfeit on a match with several sets", () => {
      const duel = newDuel(4, false, { nbMatchSets: [3] })
      duel.toggleForfeit("1")
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }, { "1": "FF" }, { "1": "FF" }])
    })
    test("A team's forfeit is written under the team id", () => {
      const duel = newDuel(4, true)
      duel.toggleForfeit("1")
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }])
    })
    test("The forfeit of a team's last player", () => {
      const duel = newDuel(4, true)
      duel.toggleForfeit("1-1")
      duel.toggleForfeit("1-2")
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }])
    })
    test("The forfeit of part of a team's players", () => {
      const duel = newDuel(4, true)
      duel.toggleForfeit("1-1")
      expect(duel.getMatch(firstMatch)?.complete).toBe(false)
      expect(setScores(duel, firstMatch)).toStrictEqual([{}])
    })
    test("A forfeit with inverted scoring", () => {
      const duel = newDuel(4, false, { invertedScoring: true })
      duel.toggleForfeit("1")
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }])
      expect(opponentIds(duel, final)).toStrictEqual(["4", undefined])
    })
  })

  describe("No score given to the opponent", () => {
    test("The opponent has no score", () => {
      const duel = newDuel(4, false, { nbMatchSets: [3] })
      duel.toggleForfeit("1")
      duel.getMatch(firstMatch)?.sets.forEach((s) => expect(s.scores).not.toHaveProperty("4"))
    })
    test("The removed setting provided by a JavaScript caller has no effect", () => {
      const duel = new DuelPhase(F)
      const settings = { ...duelBaseSettings, ffPlayerScoreAgainst: 30 } as DuelSettings
      expect(() => duel.init(createPlayers(4), settings)).not.toThrow()
      duel.toggleForfeit("1")
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }])
    })
  })

  describe("Sets replaced by a forfeit during a match", () => {
    test("A forfeit after a played set", () => {
      const duel = newDuel(4, false, { nbMatchSets: [3] })
      play(duel, [{ b: W, r: 1, m: 1, s: 1, p1: "1", p2: "4", sc1: 5, sc2: 2 }])
      duel.toggleForfeit("1")
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }, { "1": "FF" }, { "1": "FF" }])
    })
    test("A forfeit after a partial score", () => {
      const duel = newDuel(2)
      score(duel, W, 1, 1, 1, "1", 3)
      duel.toggleForfeit("2")
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "2": "FF" }])
    })
  })

  describe("Complete match not changed by a forfeit", () => {
    test("A forfeit after a played match", () => {
      const duel = newDuel(4)
      play(duel, [{ b: W, r: 1, m: 1, p1: "1", p2: "4", sc1: 5, sc2: 2 }])
      duel.toggleForfeit("1")
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": 5, "4": 2 }])
    })
    test("The forfeit of the winner of a match already resolved by a forfeit", () => {
      const duel = newDuel(4)
      duel.toggleForfeit("1")
      duel.toggleForfeit("4")
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }])
    })
    test("A cancelled forfeit", () => {
      const duel = newDuel(4)
      duel.toggleForfeit("1")
      duel.toggleForfeit("1")
      expect(duel.getOpponents(true, false).find((o) => o.id === "1")?.forfeit).toBe(false)
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }])
      expect(duel.getMatch(firstMatch)?.complete).toBe(true)
    })
  })

  describe("Correction of a match played before a forfeit", () => {
    // "1" beats "4", then forfeits while waiting for its opponent in the final
    const playedThenForfeited = () => {
      const duel = newDuel(4)
      play(duel, [{ b: W, r: 1, m: 1, p1: "1", p2: "4", sc1: 5, sc2: 2 }])
      duel.toggleForfeit("1")
      return duel
    }

    test("A corrected value changing the winner", () => {
      const duel = playedThenForfeited()
      score(duel, W, 1, 1, 1, "4", 7)
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": 5, "4": 7 }])
      expect(opponentIds(duel, final)).toStrictEqual(["4", undefined])
    })
    test("A corrected value keeping the winner", () => {
      const duel = playedThenForfeited()
      score(duel, W, 1, 1, 1, "4", 3)
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": 5, "4": 3 }])
      expect(opponentIds(duel, final)).toStrictEqual(["1", undefined])
    })
    test("A removed score", () => {
      const duel = playedThenForfeited()
      score(duel, W, 1, 1, 1, "4", undefined)
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }])
      expect(opponentIds(duel, final)).toStrictEqual(["4", undefined])
    })
  })

  describe("Match resolved by a forfeit not editable", () => {
    const forfeitError = "Match was resolved by a forfeit"

    test.each<[string, string, number | undefined]>([
      ["a score of the opponent", "4", 9],
      ["a score of the forfeiting opponent", "1", 9],
      ["a removed score", "1", undefined]
    ])("Rejects %s and leaves the phase unchanged", (_name, opponentId, value) => {
      const duel = newDuel(4)
      duel.toggleForfeit("1")
      const before = { match: duel.getMatch(firstMatch), result: duel.getResult() }
      expect(() => score(duel, W, 1, 1, 1, opponentId, value)).toThrow(forfeitError)
      expect(duel.getMatch(firstMatch)).toStrictEqual(before.match)
      expect(duel.getResult()).toStrictEqual(before.result)
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }])
    })
  })

  describe("Match resolved by a forfeit excluded from the stats", () => {
    const stats = (duel: DuelPhase, id: string) => duel.getResult().find((r) => r.opponentId === id)?.telemetry
    const noMatchCounted = {
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      setsPlayed: 0,
      setsWon: 0,
      setsLost: 0,
      scoredPoints: 0,
      concededPoints: 0
    }

    test("The winner of a forfeit without a played set", () => {
      const duel = newDuel(4)
      duel.toggleForfeit("1")
      expect(stats(duel, "1")).toMatchObject(noMatchCounted)
      expect(stats(duel, "4")).toMatchObject(noMatchCounted)
    })
    test("A forfeit after a played set", () => {
      const duel = newDuel(4, false, { nbMatchSets: [3] })
      play(duel, [{ b: W, r: 1, m: 1, s: 1, p1: "1", p2: "4", sc1: 5, sc2: 2 }])
      duel.toggleForfeit("1")
      expect(stats(duel, "1")).toMatchObject(noMatchCounted)
      expect(stats(duel, "4")).toMatchObject(noMatchCounted)
    })
    test("A forfeit after a played set with inverted scoring", () => {
      const duel = newDuel(4, false, { nbMatchSets: [3], invertedScoring: true })
      play(duel, [{ b: W, r: 1, m: 1, s: 1, p1: "1", p2: "4", sc1: 5, sc2: 2 }])
      duel.toggleForfeit("1")
      expect(stats(duel, "4")?.matchesLost).toBe(0)
      expect(stats(duel, "1")).toMatchObject(noMatchCounted)
      expect(stats(duel, "4")).toMatchObject(noMatchCounted)
    })
    test("A forfeit after a played set, for every player of the teams", () => {
      const duel = newDuel(4, true, { nbMatchSets: [3] })
      play(duel, [{ b: W, r: 1, m: 1, s: 1, p1: "1", p2: "4", sc1: 5, sc2: 2 }])
      duel.toggleForfeit("1")
      ;["1-1", "1-2", "4-1", "4-2"].forEach((id) => expect(stats(duel, id)).toMatchObject(noMatchCounted))
    })
    test("A forfeit after a played match", () => {
      const duel = newDuel(4)
      play(duel, [{ b: W, r: 1, m: 1, p1: "1", p2: "4", sc1: 7, sc2: 1 }])
      duel.toggleForfeit("1")
      // The final is resolved by the forfeit of "1" once its opponent is known
      play(duel, [{ b: W, r: 1, m: 2, p1: "2", p2: "3", sc1: 3, sc2: 1 }])
      expect(setScores(duel, final)).toStrictEqual([{ "1": "FF" }])
      expect(stats(duel, "1")).toMatchObject({
        matchesPlayed: 1,
        matchesWon: 1,
        matchesLost: 0,
        scoredPoints: 7,
        concededPoints: 1
      })
      expect(stats(duel, "2")).toMatchObject({ matchesPlayed: 1, matchesWon: 1, scoredPoints: 3 })
    })
  })

  describe("Double forfeit in a match", () => {
    test("Double forfeit in the loser bracket", () => {
      const duel = newDuel(8, false, { elimination: "double" })
      duel.toggleForfeit("1")
      duel.toggleForfeit("4")
      const match = duel.getMatch(matchId(L, 1, 1))
      expect(match?.opponents.map((o) => o?.id)).toStrictEqual(["4", "1"])
      expect(match?.opponents.map((o) => o?.forfeit)).toStrictEqual([true, true])
      expect(match?.sets.map((s) => s.scores)).toStrictEqual([{ "4": "FF", "1": "FF" }])
      expect(match?.complete).toBe(true)
      // "1", in position 2, moves on to the next loser bracket round
      expect(opponentIds(duel, matchId(L, 2, 1))).toStrictEqual([undefined, "1"])
    })
    test("Double forfeit in the bronze final", () => {
      const duel = newDuel(4, false, { enableExtendedFinals: true })
      duel.toggleForfeit("1")
      duel.toggleForfeit("2")
      const match = duel.getMatch(matchId(L, 1, 1))
      expect(match?.opponents.map((o) => o?.id)).toStrictEqual(["1", "2"])
      expect(match?.opponents.map((o) => o?.forfeit)).toStrictEqual([true, true])
      expect(match?.sets.map((s) => s.scores)).toStrictEqual([{ "1": "FF", "2": "FF" }])
      expect(match?.complete).toBe(true)
    })
    test("The next match of the forfeiting opponent who moves on", () => {
      const duel = newDuel(8, false, { elimination: "double" })
      duel.toggleForfeit("1")
      duel.toggleForfeit("4")
      // The loser of this match joins "1" in the next loser bracket round
      play(duel, [{ b: W, r: 2, m: 1, p1: "8", p2: "5", sc1: 3, sc2: 1 }])
      expect(opponentIds(duel, matchId(L, 2, 1))).toStrictEqual(["5", "1"])
      expect(setScores(duel, matchId(L, 2, 1))).toStrictEqual([{ "1": "FF" }])
      expect(opponentIds(duel, matchId(L, 3, 1))).toContain("5")
    })
  })

  describe("Forfeit in the grand final", () => {
    // With 4 opponents, the grand final 1 is loser bracket round 3 and the grand final 2 is round 4
    const gf1 = matchId(L, 3, 1)
    const gf2 = matchId(L, 4, 1)
    const playMatch = (duel: DuelPhase, id: MatchId) => {
      const [p1, p2] = opponentIds(duel, id)!
      play(duel, [{ b: id.bracket, r: id.round, m: id.match, p1: p1!, p2: p2!, sc1: 3, sc2: 1 }])
    }
    // Plays every match before the grand final 1 and returns its opponents
    const reachGrandFinal = (duel: DuelPhase) => {
      autoPlay(duel, W)
      playMatch(duel, matchId(L, 1, 1))
      playMatch(duel, matchId(L, 2, 1))
      return opponentIds(duel, gf1)!
    }

    test("Grand final without extended finals", () => {
      const duel = newDuel(4, false, { elimination: "double" })
      const [, second] = reachGrandFinal(duel)
      expect(duel.getCompletion()).toBe(5 / 6)
      duel.toggleForfeit(second!)
      expect(setScores(duel, gf1)).toStrictEqual([{ [second!]: "FF" }])
      expect(duel.getCompletion()).toBe(1)
    })
    test("Forfeit of the opponent in position 2 with extended finals", () => {
      const duel = newDuel(4, false, { elimination: "double", enableExtendedFinals: true })
      const [, second] = reachGrandFinal(duel)
      duel.toggleForfeit(second!)
      expect(duel.getMatch(gf1)?.complete).toBe(true)
      expect(duel.getMatch(gf2)?.complete).toBe(true)
      expect(setScores(duel, gf2)).toStrictEqual([{}])
      expect(duel.getCompletion()).toBe(1)
    })
    test("Forfeit of the opponent in position 1 with extended finals", () => {
      const duel = newDuel(4, false, { elimination: "double", enableExtendedFinals: true })
      const [first] = reachGrandFinal(duel)
      duel.toggleForfeit(first!)
      expect(duel.getMatch(gf1)?.complete).toBe(true)
      expect(duel.getMatch(gf2)?.complete).toBe(true)
      expect(setScores(duel, gf1)).toStrictEqual([{ [first!]: "FF" }])
      expect(setScores(duel, gf2)).toStrictEqual([{ [first!]: "FF" }])
      expect(duel.getCompletion()).toBe(1)
    })
  })

  describe("Walkover distinct from forfeit", () => {
    test("A walkover without forfeit", () => {
      const duel = newDuel(3)
      expect(opponentIds(duel, firstMatch)).toStrictEqual(["1", ""])
      expect(duel.getMatch(firstMatch)?.complete).toBe(true)
      expect(setScores(duel, firstMatch)).toStrictEqual([{}])
    })
    test("A forfeiting opponent against a walkover", () => {
      const duel = newDuel(6, false, { elimination: "double" })
      duel.toggleForfeit("5")
      const lbMatch = matchId(L, 1, 1)
      expect(opponentIds(duel, lbMatch)).toStrictEqual(["5", ""])
      expect(duel.getMatch(lbMatch)?.complete).toBe(true)
      expect(setScores(duel, lbMatch)).toStrictEqual([{}])
      expect(opponentIds(duel, matchId(L, 2, 1))).toContain("5")
    })
    test("A parent correction replaces the opponent of a complete walkover match", () => {
      const duel = newDuel(6, false, { elimination: "double" })
      const lbMatch = matchId(L, 1, 1)
      play(duel, [{ b: W, r: 1, m: 2, p1: "4", p2: "5", sc1: 3, sc2: 1 }])
      expect(opponentIds(duel, matchId(L, 2, 1))).toContain("5")
      score(duel, W, 1, 2, 1, "5", 4)
      expect(opponentIds(duel, lbMatch)).toStrictEqual(["4", ""])
      expect(duel.getMatch(lbMatch)?.complete).toBe(true)
      expect(setScores(duel, lbMatch)).toStrictEqual([{}])
      expect(opponentIds(duel, matchId(L, 2, 1))).toContain("4")
      expect(opponentIds(duel, matchId(L, 2, 1))).not.toContain("5")
    })
    test("A played match after a walkover locks the parents of the walkover match", () => {
      // "9" loses to "8", passes the walkover in loser bracket round 1, then plays loser bracket round 2
      const duel = newDuel(10, false, { elimination: "double" })
      play(duel, [
        { b: W, r: 1, m: 2, p1: "8", p2: "9", sc1: 3, sc2: 1 },
        { b: W, r: 2, m: 2, p1: "4", p2: "5", sc1: 3, sc2: 1 },
        { b: L, r: 2, m: 1, p1: "5", p2: "9", sc1: 3, sc2: 1 }
      ])
      expect(() => score(duel, W, 1, 2, 1, "9", 4)).toThrow("Match is locked")
      expect(opponentIds(duel, matchId(L, 2, 1))).toStrictEqual(["5", "9"])
      // Clearing the match after the walkover unlocks them again
      score(duel, L, 2, 1, 1, "5", undefined)
      score(duel, L, 2, 1, 1, "9", undefined)
      score(duel, W, 1, 2, 1, "9", 4)
      expect(opponentIds(duel, matchId(L, 2, 1))).toStrictEqual(["5", "8"])
    })
  })
})

describe("Opponent creation", () => {
  test("newTelemetry returns 12 counters at zero", () => {
    expect(newTelemetry()).toStrictEqual(zeroStats)
    expect(Object.keys(newTelemetry())).toHaveLength(12)
  })
  test("newTelemetry returns a new object on each call", () => {
    expect(newTelemetry()).not.toBe(newTelemetry())
  })
  test("newOpponents creates a player", () => {
    expect(newOpponents([{ type: "player", id: "a" }])).toStrictEqual([
      { type: "player", id: "a", forfeit: false, stats: zeroStats }
    ])
  })
  test("newOpponents creates a team and its players", () => {
    expect(newOpponents([{ type: "team", id: "t", players: [{ type: "player", id: "a" }] }])).toStrictEqual([
      {
        type: "team",
        id: "t",
        forfeit: false,
        players: [{ type: "player", id: "a", forfeit: false, stats: zeroStats }]
      }
    ])
  })
  test("newOpponents drops undeclared fields, including on team players", () => {
    const entrants = [
      { type: "player", id: "a", name: "Alice", forfeit: true, stats: { ...zeroStats, matchesWon: 9 } },
      {
        type: "team",
        id: "t",
        name: "Team",
        forfeit: true,
        stats: { ...zeroStats, matchesWon: 9 },
        players: [{ type: "player", id: "b", name: "Bob", forfeit: true, stats: { ...zeroStats, matchesWon: 9 } }]
      }
    ] as unknown as Entrant[]
    expect(newOpponents(entrants)).toStrictEqual([
      { type: "player", id: "a", forfeit: false, stats: zeroStats },
      {
        type: "team",
        id: "t",
        forfeit: false,
        players: [{ type: "player", id: "b", forfeit: false, stats: zeroStats }]
      }
    ])
  })
  test("newOpponents gives each player its own stats", () => {
    const [first, second] = newOpponents([
      { type: "player", id: "a" },
      { type: "player", id: "b" }
    ]) as PlayerOpponent[]
    expect(first!.stats).not.toBe(second!.stats)
  })
})

describe("Phase lifecycle", () => {
  const firstMatch = { phase: F, bracket: W, round: 1, match: 1 }

  describe("Initialization", () => {
    test("A phase can be created without opponents or settings", () => {
      const duel = new DuelPhase(F)
      expect(duel.getMatches()).toEqual([])
    })
    test("init generates the matches", () => {
      const duel = new DuelPhase(F)
      duel.init(createPlayers(4), duelBaseSettings)
      expect(duel.getMatches()).toHaveLength(3)
      duel.getMatches({ bracket: W, round: 1 }).forEach((m) => {
        expect(m.opponents.every((o) => o !== undefined)).toBe(true)
      })
    })
    test("init progresses the walkovers", () => {
      const duel = new DuelPhase(F)
      duel.init(createPlayers(3), duelBaseSettings)
      expect(duel.getMatch({ phase: F, bracket: W, round: 2, match: 1 })?.opponents[0]?.id).toBe("1")
    })
  })

  describe("Opponents created from entrants", () => {
    const player = (id: string) => ({ type: "player", id, forfeit: false, stats: zeroStats })

    test("Players keep their type and id, without forfeit and with zeroed stats", () => {
      const duel = new DuelPhase(F)
      duel.init(createPlayers(4), duelBaseSettings)
      expect(duel.getOpponents(true, false)).toStrictEqual(["1", "2", "3", "4"].map(player))
    })
    test("Teams keep their type and id, without stats, and their players start from zero", () => {
      const duel = new DuelPhase(F)
      duel.init(createTeams(2, 2), duelBaseSettings)
      expect(duel.getOpponents(true, false)).toStrictEqual([
        { type: "team", id: "1", forfeit: false, players: ["1-1", "1-2"].map(player) },
        { type: "team", id: "2", forfeit: false, players: ["2-1", "2-2"].map(player) }
      ])
    })
    test("Only the players of a played match have their stats updated", () => {
      const duel = newDuel(4)
      play(duel, [{ b: W, r: 1, m: 1, p1: "1", p2: "4", sc1: 3, sc2: 1 }])
      const opponent = (id: string) => duel.getOpponents(true, true).find((o) => o.id === id)
      expect(opponent("1")).toMatchObject({ stats: { matchesWon: 1, scoredPoints: 3 } })
      expect(opponent("4")).toMatchObject({ stats: { matchesLost: 1, scoredPoints: 1 } })
      expect(opponent("2")).toStrictEqual(player("2"))
      expect(opponent("3")).toStrictEqual(player("3"))
    })
  })

  describe("Undeclared fields", () => {
    const nonZeroStats = { ...zeroStats, matchesWon: 9, scoredPoints: 9 }
    const initWith = (entrants: unknown[], settings: DuelSettings = duelBaseSettings) => {
      const duel = new DuelPhase(F)
      duel.init(entrants as PlayerEntrant[], settings)
      return duel
    }
    const withFirst = (fields: object) => {
      const [first, ...others] = createPlayers(4)
      return [{ ...first!, ...fields }, ...others]
    }

    test("A forfeit provided as input is ignored", () => {
      const duel = initWith(withFirst({ forfeit: true }))
      expect(duel.getOpponents(true, false).find((o) => o.id === "1")?.forfeit).toBe(false)
      expect(duel.getMatches({ bracket: W, round: 1 }).some((m) => m.complete)).toBe(false)
      expect(duel.getCompletion()).toBe(0)
    })
    test("Stats provided as input are ignored", () => {
      const duel = initWith(withFirst({ stats: nonZeroStats }))
      expect(duel.getOpponents(true, false).find((o) => o.id === "1")).toMatchObject({ stats: zeroStats })
    })
    test("A free field provided as input is ignored", () => {
      const duel = initWith(withFirst({ name: "Alice" }))
      expect(duel.getOpponents(true, false).find((o) => o.id === "1")).not.toHaveProperty("name")
    })
    test("Undeclared fields on a team and on its players are ignored", () => {
      const [team, ...others] = createTeams(4, 2)
      const [teamPlayer, ...otherPlayers] = team!.players
      const undeclared = { forfeit: true, name: "Alice", stats: nonZeroStats }
      const duel = initWith([
        { ...team!, ...undeclared, players: [{ ...teamPlayer!, ...undeclared }, ...otherPlayers] },
        ...others
      ])
      const opponents = duel.getOpponents(true, false)
      expect(opponents[0]).toStrictEqual({
        type: "team",
        id: "1",
        forfeit: false,
        players: [
          { type: "player", id: "1-1", forfeit: false, stats: zeroStats },
          { type: "player", id: "1-2", forfeit: false, stats: zeroStats }
        ]
      })
      expect(duel.getMatches({ bracket: W, round: 1 }).some((m) => m.complete)).toBe(false)
    })
  })

  describe("Forfeit before the phase starts", () => {
    const final = { phase: F, bracket: W, round: 2, match: 1 }

    test("A player's forfeit before any score progresses its match", () => {
      const duel = newDuel(4)
      duel.toggleForfeit("1")
      expect(duel.getMatch(firstMatch)?.complete).toBe(true)
      expect(duel.getMatch(final)?.opponents.map((o) => o?.id)).toContain("4")
      expect(duel.getOpponents(true, false).find((o) => o.id === "1")?.forfeit).toBe(true)
    })
    test("A team's forfeit before any score progresses its match", () => {
      const duel = newDuel(4, true)
      duel.toggleForfeit("1")
      const team = duel.getOpponents(true, false).find((o) => o.id === "1")
      expect(team).toMatchObject({ forfeit: true, players: [{ forfeit: true }, { forfeit: true }] })
      expect(duel.getMatch(firstMatch)?.complete).toBe(true)
      expect(duel.getMatch(final)?.opponents.map((o) => o?.id)).toContain("4")
    })
  })

  describe("Isolation", () => {
    test("Changing the caller's players after init doesn't change the phase", () => {
      const players = createPlayers(4)
      const duel = new DuelPhase(F)
      duel.init(players, duelBaseSettings)
      const before = duel.getOpponents(true, false)

      players[0] = { type: "player", id: "replaced" }
      players.pop()

      expect(duel.getOpponents(true, false)).toEqual(before)
    })
    test("Changing the caller's teams after init doesn't change the phase", () => {
      const teams = createTeams(4, 2)
      const duel = new DuelPhase(F)
      duel.init(teams, duelBaseSettings)
      const before = duel.getOpponents(true, false)

      teams[0] = { type: "team", id: "replaced", players: [] }
      teams.pop()

      expect(duel.getOpponents(true, false)).toEqual(before)
    })
    test("Changing the players of a caller's team after init doesn't change the phase", () => {
      const teams = createTeams(4, 2)
      const duel = new DuelPhase(F)
      duel.init(teams, duelBaseSettings)
      const before = duel.getOpponents(true, false)

      teams[0]!.players[0] = { type: "player", id: "replaced" }
      teams[0]!.players.pop()

      expect(duel.getOpponents(true, false)).toEqual(before)
    })
    test("Changing the caller's settings after init doesn't change the phase", () => {
      const settings: DuelSettings = { ...duelBaseSettings, nbMatchSets: [1], nbLBMatchSets: [1] }
      const duel = new DuelPhase(F)
      duel.init(createPlayers(4), settings)
      const before = structuredClone(duel.settings)

      settings.elimination = "double"
      settings.nbMatchSets.push(3)
      settings.nbLBMatchSets!.push(3)

      expect(duel.settings).toEqual(before)
    })
  })

  describe("Validation", () => {
    test.each<[string, Entrant[], DuelSettings, string]>([
      ["too few opponents", createPlayers(1), duelBaseSettings, "validateEntrants: at least 2 entrants are required."],
      [
        "duplicate ids",
        createPlayers(2).map((p) => ({ ...p, id: "a" })),
        duelBaseSettings,
        "validateEntrants: unicity in entrants id is not respected."
      ],
      [
        "invalid common settings",
        createPlayers(2),
        { ...duelBaseSettings, nbMatchSets: [] },
        "validateSettings: nbMatchSets must not be empty."
      ],
      [
        "invalid duel settings",
        createPlayers(2),
        { ...duelBaseSettings, elimination: "double" },
        "validateSettings: double elimination requires at least 4 opponents."
      ],
      [
        "mixed players and teams",
        [createPlayers(2)[1]!, createTeams(1, 1)[0]!],
        duelBaseSettings,
        "validateEntrants: entrants must be either all players or all teams."
      ],
      [
        "team without players",
        createTeams(2, 0),
        duelBaseSettings,
        "validateEntrants: every team must have at least one player."
      ],
      [
        "empty id",
        createPlayers(2).map((p) => ({ ...p, id: "" })),
        duelBaseSettings,
        "validateEntrants: entrant ids must not be empty."
      ],
      [
        "infinite nbMatchSets",
        createPlayers(2),
        { ...duelBaseSettings, nbMatchSets: [Infinity] },
        "validateSettings: all nbMatchSets must be integers."
      ]
    ])("Rejected init leaves the phase empty: %s", (_name, entrants, settings, message) => {
      const duel = new DuelPhase(F)
      expect(() => duel.init(entrants as Entrants, settings)).toThrow(message)
      expect(duel.getMatches()).toEqual([])
      expect(duel.getOpponents(true, false)).toEqual([])
      expect(duel.settings).toBeUndefined()
    })
    test("A valid init succeeds after a rejected one", () => {
      const duel = new DuelPhase(F)
      expect(() => duel.init(createPlayers(1), duelBaseSettings)).toThrow()
      duel.init(createPlayers(4), duelBaseSettings)
      expect(duel.getMatches()).toHaveLength(3)
      expect(duel.getOpponents(true, true)).toHaveLength(4)
    })
    test("A valid init succeeds after rejecting an infinite nbMatchSets", () => {
      const duel = new DuelPhase(F)
      expect(() => duel.init(createPlayers(4), { ...duelBaseSettings, nbMatchSets: [Infinity] })).toThrow()
      duel.init(createPlayers(4), duelBaseSettings)
      expect(duel.getMatches()).toHaveLength(3)
    })
  })

  describe("Single initialization", () => {
    const alreadyInitialized = "init: phase is already initialized."
    const startedDuel = () => {
      const duel = newDuel(4)
      play(duel, [{ b: W, r: 1, m: 1, p1: "1", p2: "4", sc1: 3, sc2: 1 }])
      return duel
    }
    const snapshot = (duel: DuelPhase) => ({
      matches: duel.getMatches(),
      opponents: duel.getOpponents(true, false),
      completion: duel.getCompletion(),
      result: duel.getResult()
    })

    test("A second valid init throws and leaves the phase unchanged", () => {
      const duel = startedDuel()
      const before = snapshot(duel)
      expect(before.completion).toBeGreaterThan(0)
      expect(() => duel.init(createPlayers(8), duelBaseSettings)).toThrow(alreadyInitialized)
      expect(snapshot(duel)).toEqual(before)
    })
    test("A second invalid init throws the same error, not a validation error", () => {
      const duel = startedDuel()
      const before = snapshot(duel)
      expect(() => duel.init(createPlayers(1), duelBaseSettings)).toThrow(alreadyInitialized)
      expect(snapshot(duel)).toEqual(before)
    })
  })

  describe("Before init", () => {
    test("Reads return empty values", () => {
      const duel = new DuelPhase(F)
      expect(duel.getMatches()).toEqual([])
      expect(duel.getMatch(firstMatch)).toBeUndefined()
      expect(duel.getOpponents(true, false)).toEqual([])
      expect(duel.getOpponents(true, true)).toEqual([])
      expect(duel.getResult()).toEqual([])
      expect(duel.getCompletion()).toBe(0)
      expect(duel.settings).toBeUndefined()
    })
    test("score throws", () => {
      const duel = new DuelPhase(F)
      expect(() => duel.score({ ...firstMatch, set: 1 }, "1", 3)).toThrow("Match not found")
    })
    test("toggleForfeit throws", () => {
      const duel = new DuelPhase(F)
      expect(() => duel.toggleForfeit("1")).toThrow("toggleForfeit: opponent 1 not found.")
    })
  })
})
