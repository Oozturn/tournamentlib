import { DuelPhase, DuelSettings, PhaseBracket, PlayerOpponent, TeamOpponent, TournamentPhase } from "../src"
const W = PhaseBracket.winner
const L = PhaseBracket.loser
const F = TournamentPhase.Final

function createPlayers(nb: number): PlayerOpponent[] {
  return Array.from({ length: nb }, (_, index) => ({
    id: `${index + 1}`,
    type: "player",
    forfeit: false,
    stats: {
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
  }))
}
function createTeams(nbTeams: number, nbPlayersPerTeam: number): TeamOpponent[] {
  return Array.from({ length: nbTeams }, (_, index) => ({
    id: `${index + 1}`,
    type: "team",
    forfeit: false,
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
  downmix: true,
  ffPlayerScoreAgainst: 30
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
      expect(() => newDuel(1)).toThrow("validateOpponents: at least 2 opponents are required."))
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
        "validateOpponents: unicity in opponents id is not respected."
      )
    })
    test("Duplicate team player IDs", () => {
      const teams = createTeams(2, 2).map((t) => ({
        ...t,
        players: t.players.map((p, index) => ({ ...p, id: `${index + 1}` }))
      }))
      const duel = new DuelPhase(F)
      expect(() => duel.init(teams, duelBaseSettings)).toThrow(
        "validateOpponents: unicity in opponents id is not respected."
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
  })

  describe("Phase common settings validation", () => {
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
      expect(() => newDuel(2, false, { ...duelBaseSettings, nbMatchSets: ["1"] } as unknown as DuelSettings)).toThrow(
        "validateSettings: all nbMatchSets must be numbers."
      )
    })
    test("Invalid matchWinRule", () => {
      expect(() =>
        newDuel(2, false, { ...duelBaseSettings, matchWinRule: "invalid" } as unknown as DuelSettings)
      ).toThrow('validateSettings: matchWinRule must be either "bestOfN" or "sumOfSets".')
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
    expect(duel.getMatch({ phase: F, bracket: W, round: 3, match: 1 })?.sets[0]?.scores).toStrictEqual({
      "1": 30,
      "2": 0
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

  describe("Isolation", () => {
    test("Changing the caller's players after init doesn't change the phase", () => {
      const players = createPlayers(4)
      const duel = new DuelPhase(F)
      duel.init(players, duelBaseSettings)
      const before = duel.getOpponents(true, false)

      players[0]!.forfeit = true
      players[0]!.stats.matchesWon = 99
      players.pop()

      expect(duel.getOpponents(true, false)).toEqual(before)
    })
    test("Changing the caller's teams after init doesn't change the phase", () => {
      const teams = createTeams(4, 2)
      const duel = new DuelPhase(F)
      duel.init(teams, duelBaseSettings)
      const before = duel.getOpponents(true, true)

      teams[0]!.players[0]!.forfeit = true

      expect(duel.getOpponents(true, true)).toEqual(before)
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
    test.each<[string, PlayerOpponent[], DuelSettings, string]>([
      [
        "too few opponents",
        createPlayers(1),
        duelBaseSettings,
        "validateOpponents: at least 2 opponents are required."
      ],
      [
        "duplicate ids",
        createPlayers(2).map((p) => ({ ...p, id: "a" })),
        duelBaseSettings,
        "validateOpponents: unicity in opponents id is not respected."
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
      ]
    ])("Rejected init leaves the phase empty: %s", (_name, opponents, settings, message) => {
      const duel = new DuelPhase(F)
      expect(() => duel.init(opponents, settings)).toThrow(message)
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
