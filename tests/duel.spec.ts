import {
  DuelPhase,
  DuelSettings,
  MATCH_WIN_RULES,
  MatchId,
  newOpponents,
  newStats,
  OpponentId,
  PHASE_TYPES,
  PhaseBracket,
  Stats,
  TournamentPhase
} from "../src"
const W = PhaseBracket.winner
const L = PhaseBracket.loser
const F = TournamentPhase.Final

const initialStats = Object.freeze({
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
} satisfies Stats)
// The match, set and point counters, which stay at 0 until the opponent plays
const { matchesRemaining: _remaining, ratioPoints: _ratio, ...zeroCounters } = initialStats

function createPlayers(nb: number): OpponentId[] {
  return Array.from({ length: nb }, (_, index) => `${index + 1}`)
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
function newDuel(nbOpponents: number, settings?: Partial<DuelSettings>): DuelPhase {
  const duel = new DuelPhase(F)
  duel.init(createPlayers(nbOpponents), { ...duelBaseSettings, ...settings })
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
      expect(() => newDuel(2, { elimination: "invalid" } as unknown as Partial<DuelSettings>)).toThrow(
        'validateSettings: elimination must be either "single" or "double".'
      ))
    test("Minimum opponents", () =>
      expect(() => newDuel(1)).toThrow("validateOpponentIds: at least 2 opponents are required."))
    test("Double elimination minimum opponents", () =>
      expect(() => newDuel(2, { elimination: "double" })).toThrow(
        "validateSettings: double elimination requires at least 4 opponents."
      ))
    test("Extended finals minimum opponents", () =>
      expect(() => newDuel(2, { enableExtendedFinals: true })).toThrow(
        "validateSettings: enableExtendedFinals requires at least 4 opponents."
      ))

    test("Duplicate player IDs", () => {
      const duel = new DuelPhase(F)
      expect(() => duel.init(["a", "a"], duelBaseSettings)).toThrow("validateOpponentIds: opponent ids must be unique.")
    })
    test("Correct simple elimination Duel", () => {
      expect(() => newDuel(2)).not.toThrow()
    })
    test("Correct double elimination Duel", () => {
      expect(() => newDuel(4, { ...duelBaseSettings, elimination: "double" })).not.toThrow()
    })

    const initWith = (opponentIds: OpponentId[]) => () => new DuelPhase(F).init(opponentIds, duelBaseSettings)
    const emptyIdError = "validateOpponentIds: opponent ids must not be empty."

    test("Empty ids", () => {
      expect(initWith(["", "2"])).toThrow(emptyIdError)
    })
    test("Several empty ids report the empty id, not the unicity", () => {
      expect(initWith(["", ""])).toThrow(emptyIdError)
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
      expect(() => newDuel(2, { ...duelBaseSettings, nbMatchSets: [] })).toThrow(
        "validateSettings: nbMatchSets must not be empty."
      ))
    test("Invalid nbMatchSets", () => {
      expect(() => newDuel(2, { ...duelBaseSettings, nbMatchSets: [-1, 2] })).toThrow(
        "validateSettings: all nbMatchSets must be greater than 0."
      )
      expect(() => newDuel(2, { ...duelBaseSettings, nbMatchSets: [0, 2] })).toThrow(
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
      expect(() => newDuel(2, { nbMatchSets: [value] } as unknown as DuelSettings)).toThrow(
        "validateSettings: all nbMatchSets must be integers."
      )
    })
    test("Positive integers in nbMatchSets", () => {
      expect(() => newDuel(2, { nbMatchSets: [1, 3, 5] })).not.toThrow()
    })
    test("Invalid type", () => {
      expect(() => newDuel(2, { type: "invalid" } as unknown as DuelSettings)).toThrow(
        "validateSettings: type must be one of duel, ffa, roundrobin."
      )
    })
    test("Invalid matchWinRule", () => {
      expect(() => newDuel(2, { ...duelBaseSettings, matchWinRule: "invalid" } as unknown as DuelSettings)).toThrow(
        "validateSettings: matchWinRule must be one of bestOfN, sumOfSets."
      )
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
        const duel = newDuel(4, { nbMatchSets: [2, 3], allMatchesSameSetsNumber: false })
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
      expect(newDuel(8, { enableExtendedFinals: true }).getMatches().length).toBe(8)
      expect(newDuel(14).getMatches().length).toBe(15)
      // Double elimination
      expect(newDuel(4, { elimination: "double" }).getMatches().length).toBe(6)
      expect(newDuel(4, { elimination: "double", enableExtendedFinals: true }).getMatches().length).toBe(7)
      expect(newDuel(8, { elimination: "double" }).getMatches().length).toBe(14)
      expect(newDuel(14, { elimination: "double" }).getMatches().length).toBe(30)
      // Loser bracket matches
      expect(newDuel(4).getMatches({ bracket: L }).length).toBe(0)
      expect(newDuel(4, { enableExtendedFinals: true }).getMatches({ bracket: L }).length).toBe(1)
      expect(newDuel(4, { elimination: "double" }).getMatches({ bracket: L }).length).toBe(3)
      expect(
        newDuel(4, { elimination: "double", enableExtendedFinals: true }).getMatches({
          bracket: L
        }).length
      ).toBe(4)
      // Finals
      expect(newDuel(4).getMatches({ bracket: W, round: 2 }).length).toBe(1) // No LB, no bronze
      expect(newDuel(4, { enableExtendedFinals: true }).getMatches({ round: 2 }).length).toBe(1) // No LB, bronze
      expect(newDuel(4, { enableExtendedFinals: true }).getMatches({ bracket: L, round: 1 }).length).toBe(1) // No LB, bronze
      expect(newDuel(4, { elimination: "double" }).getMatches({ bracket: L, round: 3 }).length).toBe(1) // LB, no extended finals
      expect(newDuel(4, { elimination: "double" }).getMatches({ bracket: L, round: 4 }).length).toBe(0) // LB, no extended finals
      expect(
        newDuel(4, { elimination: "double", enableExtendedFinals: true }).getMatches({
          bracket: L,
          round: 4
        }).length
      ).toBe(1) // LB, no extended finals
      expect(newDuel(4, { elimination: "double", enableExtendedFinals: false }).getMatches({ round: 4 }).length).toBe(0)
      expect(newDuel(4, { elimination: "double", enableExtendedFinals: true }).getMatches({ round: 4 }).length).toBe(1)
    })

    test("number of sets", () => {
      expect(
        newDuel(4, { nbMatchSets: [1] })
          .getMatches()
          .every((m) => m.sets.length === 1)
      ).toBe(true)
      expect(
        newDuel(4, { nbMatchSets: [3] })
          .getMatches()
          .every((m) => m.sets.length === 3)
      ).toBe(true)
      expect(
        newDuel(4, { nbMatchSets: [3], elimination: "double" })
          .getMatches({ bracket: L })
          .every((m) => m.sets.length === 1)
      ).toBe(true)
      expect(
        newDuel(4, { nbMatchSets: [3], nbLBMatchSets: [2], elimination: "double" })
          .getMatches({ bracket: L })
          .every((m) => m.sets.length === 2)
      ).toBe(true)
      expect(
        newDuel(4, {
          nbMatchSets: [3],
          nbLBMatchSets: [2],
          elimination: "double",
          allMatchesSameSetsNumber: false
        })
          .getMatches({ bracket: L })
          .filter((m) => m.sets.length === 2).length
      ).toBe(1)
      expect(
        newDuel(4, {
          nbMatchSets: [3],
          nbLBMatchSets: [2],
          elimination: "double",
          allMatchesSameSetsNumber: false
        }).getMatch({ phase: F, bracket: L, round: 3, match: 1 })?.sets.length
      ).toBe(2)
      expect(
        newDuel(4, {
          nbMatchSets: [3],
          nbLBMatchSets: [2],
          elimination: "double",
          enableExtendedFinals: true,
          allMatchesSameSetsNumber: false
        }).getMatch({ phase: F, bracket: L, round: 3, match: 1 })?.sets.length
      ).toBe(2)
      expect(
        newDuel(4, {
          nbMatchSets: [3],
          nbLBMatchSets: [2],
          elimination: "double",
          enableExtendedFinals: true,
          allMatchesSameSetsNumber: false
        }).getMatch({ phase: F, bracket: L, round: 4, match: 1 })?.sets.length
      ).toBe(2)
      expect(
        newDuel(8, { nbMatchSets: [2, 3], allMatchesSameSetsNumber: false })
          .getMatches()
          .filter((m) => m.sets.length === 1).length
      ).toBe(4)
      expect(
        newDuel(8, { nbMatchSets: [2, 3], allMatchesSameSetsNumber: false })
          .getMatches()
          .filter((m) => m.sets.length === 2).length
      ).toBe(2)
      expect(
        newDuel(8, { nbMatchSets: [2, 3], allMatchesSameSetsNumber: false })
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
        forfeit: true
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
      const duelSum = newDuel(4, { invertedScoring: true, matchWinRule: "sumOfSets", nbMatchSets: [3] })
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
      const duelBest = newDuel(4, { matchWinRule: "bestOfN", nbMatchSets: [3] })
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
    const duel = newDuel(4, { enableExtendedFinals: true, elimination: "double" })
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
    const duelDownmix = newDuel(16, { elimination: "double", downmix: true })
    autoPlay(duelDownmix)
    const duelNoDownmix = newDuel(16, { elimination: "double", downmix: false })
    autoPlay(duelNoDownmix)

    expect(
      duelDownmix.getMatches({ bracket: L, round: 2 }).flatMap((m) => m.opponents.map((o) => o?.id))
    ).toStrictEqual(["5", "9", "8", "12", "6", "10", "7", "11"])
    expect(
      duelNoDownmix.getMatches({ bracket: L, round: 2 }).flatMap((m) => m.opponents.map((o) => o?.id))
    ).toStrictEqual(["8", "9", "12", "5", "7", "10", "11", "6"])
  })

  test("Forfeit and WO - scoring and progression", () => {
    const duel = newDuel(6, { enableExtendedFinals: true, elimination: "double" })
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
      const duel = newDuel(4, { enableExtendedFinals: true, elimination: "single" })
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
      const duel = newDuel(4, { enableExtendedFinals: true, elimination: "double" })
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
      const duel = newDuel(7, { enableExtendedFinals: true, elimination: "double" })
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
      const duel = newDuel(7, { invertedScoring: true })
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
      const duel = newDuel(7, {
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
      const duel = newDuel(7, {
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

  describe("Duel completion", () => {
    const semiFinals: Step[] = [
      { b: W, r: 1, m: 1, p1: "1", p2: "4", sc1: 3, sc2: 1 },
      { b: W, r: 1, m: 2, p1: "2", p2: "3", sc1: 3, sc2: 1 }
    ]
    const final: Step = { b: W, r: 2, m: 1, p1: "1", p2: "2", sc1: 3, sc2: 1 }

    test("First match played", () => {
      const duel = newDuel(4)
      play(duel, [semiFinals[0]!])
      expect(duel.getCompletion()).toBe(1 / 3)
    })
    test("All matches played", () => {
      const duel = newDuel(4)
      play(duel, [...semiFinals, final])
      expect(duel.getCompletion()).toBe(1)
    })
    test("Match completed by a forfeit before any score", () => {
      const duel = newDuel(4)
      duel.toggleForfeit("4")
      expect(duel.getCompletion()).toBe(1 / 3)
    })
    test("Read before then after init", () => {
      const duel = new DuelPhase(F)
      expect(duel.getCompletion()).toBe(0)
      duel.init(createPlayers(3), duelBaseSettings)
      expect(duel.getCompletion()).toBe(1 / 3)
    })
    test("Phase with walkovers counts them right after init", () => {
      expect(newDuel(3).getCompletion()).toBe(1 / 3)
    })
    test("Phase without walkover", () => {
      expect(newDuel(4).getCompletion()).toBe(0)
    })
    test("Removing a score of the final", () => {
      const duel = newDuel(4)
      play(duel, [...semiFinals, final])
      score(duel, W, 2, 1, 1, "2", undefined)
      expect(duel.getCompletion()).toBe(2 / 3)
    })
    test("A rejected score leaves the completion unchanged", () => {
      const duel = newDuel(4)
      play(duel, [...semiFinals, final])
      const before = duel.getCompletion()
      expect(() => score(duel, W, 1, 1, 1, "4", 5)).toThrow("Match is locked")
      expect(duel.getCompletion()).toBe(before)
    })
    test("Successive reads return the same value", () => {
      const duel = newDuel(3)
      play(duel, [{ b: W, r: 1, m: 2, p1: "2", p2: "3", sc1: 3, sc2: 1 }])
      const first = duel.getCompletion()
      expect(duel.getCompletion()).toBe(first)
      expect(duel.getCompletion()).toBe(first)
    })
  })

  describe("Phase results", () => {
    const semiFinals: Step[] = [
      { b: W, r: 1, m: 1, p1: "1", p2: "4", sc1: 3, sc2: 1 },
      { b: W, r: 1, m: 2, p1: "2", p2: "3", sc1: 3, sc2: 1 }
    ]
    const final: Step = { b: W, r: 2, m: 1, p1: "1", p2: "2", sc1: 3, sc2: 1 }
    const ids = (duel: DuelPhase) =>
      duel
        .getResult()
        .map((r) => r.opponentId)
        .sort()

    test("One entry per opponent", () => {
      expect(ids(newDuel(4))).toStrictEqual(["1", "2", "3", "4"])
    })
    test("No entry for the walkover", () => {
      expect(ids(newDuel(3))).toStrictEqual(["1", "2", "3"])
    })
    test("Read before init", () => {
      expect(new DuelPhase(F).getResult()).toStrictEqual([])
    })
    test("Read before then after init", () => {
      const duel = new DuelPhase(F)
      expect(duel.getResult()).toStrictEqual([])
      duel.init(createPlayers(4), duelBaseSettings)
      expect(duel.getResult()).toHaveLength(4)
    })
    test("Players are tied right after init", () => {
      const results = newDuel(4).getResult()
      expect(results).toHaveLength(4)
      results.forEach((r) => {
        expect(r.rank).toBe(1)
        expect(r.forfeit).toBe(false)
      })
    })
    test("Phase fully played", () => {
      const duel = newDuel(4)
      play(duel, [...semiFinals, final])
      expect(duel.getResult().map((r) => r.rank)).toStrictEqual([1, 2, 3, 3])
    })
    test("Rank following tied players", () => {
      const duel = newDuel(7, { enableExtendedFinals: true, elimination: "double" })
      autoPlay(duel, W)
      duel.toggleForfeit("4")
      autoPlay(duel)
      const ranks = duel.getResult().map((r) => r.rank)
      const firstTied = ranks.indexOf(4)
      expect(ranks[firstTied + 1]).toBe(4)
      expect(ranks[firstTied + 2]).toBe(6)
    })
    test("Forfeited player is ranked last", () => {
      const duel = newDuel(4)
      duel.toggleForfeit("4")
      const last = duel.getResult().at(-1)
      expect(last?.opponentId).toBe("4")
      expect(last?.forfeit).toBe(true)
    })
    test("First match played", () => {
      const duel = newDuel(4)
      play(duel, [semiFinals[0]!])
      const first = duel.getResult().filter((r) => r.rank === 1)
      expect(first.map((r) => r.opponentId)).toStrictEqual(["1"])
      expect(first[0]!.stats.matchesWon).toBe(1)
    })
    test("A rejected score leaves the results unchanged", () => {
      const duel = newDuel(4)
      play(duel, [...semiFinals, final])
      const before = duel.getResult()
      expect(() => score(duel, W, 1, 1, 1, "4", 5)).toThrow("Match is locked")
      expect(duel.getResult()).toStrictEqual(before)
    })
    test("Successive reads return equal results", () => {
      const duel = newDuel(4)
      play(duel, [semiFinals[0]!])
      const first = duel.getResult()
      expect(duel.getResult()).toStrictEqual(first)
      expect(duel.getResult()).toStrictEqual(first)
    })
    test("Editing the read results has no effect on the phase", () => {
      const duel = newDuel(4)
      play(duel, [semiFinals[0]!])
      const expected = duel.getResult()
      const opponentBefore = duel.getOpponents(true).find((o) => o.id === "1")
      const read = duel.getResult()
      const entry = read.find((r) => r.opponentId === "1")!
      entry.rank = 99
      entry.stats.matchesWon = 99
      expect(duel.getResult()).toStrictEqual(expected)
      expect(duel.getOpponents(true).find((o) => o.id === "1")).toStrictEqual(opponentBefore)
    })
    test("Results read before a score keep their values", () => {
      const duel = newDuel(4)
      play(duel, [semiFinals[0]!])
      const before = duel.getResult()
      const snapshot = JSON.parse(JSON.stringify(before))
      play(duel, [semiFinals[1]!])
      expect(before).toStrictEqual(snapshot)
    })
  })

  describe("Opponent stats", () => {
    test("Opponent stats - solo player", () => {
      const soloDuel = newDuel(7)
      play(soloDuel, [
        { b: W, r: 1, m: 2, p1: "4", p2: "5", sc1: 2, sc2: 3 },
        { b: W, r: 1, m: 3, p1: "2", p2: "7", sc1: 2, sc2: 7 },
        { b: W, r: 2, m: 1, p1: "1", p2: "5", sc1: 7, sc2: 1 }
      ])
      expect(soloDuel.getResult().find((r) => r.opponentId === "1")?.stats.matchesRemaining).toBe(1)
      soloDuel.toggleForfeit("1")
      play(soloDuel, [
        { b: W, r: 1, m: 4, p1: "3", p2: "6", sc1: 3, sc2: 0 },
        { b: W, r: 2, m: 2, p1: "7", p2: "3", sc1: 3, sc2: 0 }
      ])
      expect(soloDuel.getCompletion()).toBe(1)
      const results = soloDuel.getResult()
      expect(results.find((r) => r.opponentId === "1")?.stats).toStrictEqual({
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
        ratioPoints: (7 - 1) / (7 + 1) / 2
      })
    })
  })

  describe("Phase stats", () => {
    const stats = (duel: DuelPhase, id: string) => duel.getResult().find((r) => r.opponentId === id)!.stats
    const firstMatchStep: Step = { b: W, r: 1, m: 1, p1: "1", p2: "4", sc1: 5, sc2: 2 }

    describe("Stats carried by the results", () => {
      test("Stats right after init", () => {
        newDuel(4)
          .getResult()
          .forEach((r) => {
            expect(Object.keys(r.stats).sort()).toStrictEqual(Object.keys(initialStats).sort())
            expect(r.stats).toMatchObject(zeroCounters)
            expect(r.stats.ratioPoints).toBe(newStats().ratioPoints)
          })
      })
      test("Opponents have no stats", () => {
        const duel = newDuel(4)
        play(duel, [firstMatchStep])
        duel.getOpponents(true).forEach((o) => expect(o).not.toHaveProperty("stats"))
        duel
          .getMatches()
          .flatMap((m) => m.opponents)
          .filter((o) => o !== undefined)
          .forEach((o) => expect(o).not.toHaveProperty("stats"))
      })
    })

    describe("Stats consistent with the matches", () => {
      test("Removed score", () => {
        const duel = newDuel(4)
        play(duel, [firstMatchStep])
        score(duel, W, 1, 1, 1, "4", undefined)
        expect(stats(duel, "1")).toMatchObject(zeroCounters)
        expect(stats(duel, "4")).toMatchObject(zeroCounters)
      })
      test("Corrected score changing the winner", () => {
        const duel = newDuel(4)
        play(duel, [firstMatchStep])
        score(duel, W, 1, 1, 1, "4", 7)
        expect(stats(duel, "4")).toMatchObject({ matchesWon: 1, scoredPoints: 7, concededPoints: 5 })
        expect(stats(duel, "1")).toMatchObject({ matchesLost: 1, matchesWon: 0 })
      })
    })

    describe("Set counted once finished", () => {
      test("Finished set of a match in progress", () => {
        const duel = newDuel(4, { nbMatchSets: [3] })
        play(duel, [{ ...firstMatchStep, s: 1 }])
        expect(stats(duel, "1")).toMatchObject({
          setsPlayed: 1,
          setsWon: 1,
          scoredPoints: 5,
          concededPoints: 2,
          matchesPlayed: 0
        })
        expect(stats(duel, "4")).toMatchObject({ setsPlayed: 1, setsLost: 1, matchesPlayed: 0 })
      })
      test("Partial score", () => {
        const duel = newDuel(4)
        score(duel, W, 1, 1, 1, "1", 3)
        expect(stats(duel, "1")).toMatchObject(zeroCounters)
        expect(stats(duel, "4")).toMatchObject(zeroCounters)
      })
      test("Drawn set", () => {
        const duel = newDuel(4, { nbMatchSets: [3] })
        play(duel, [{ ...firstMatchStep, s: 1, sc1: 3, sc2: 3 }])
        expect(stats(duel, "1")).toMatchObject({ setsPlayed: 1, setsDraw: 1 })
        expect(stats(duel, "4")).toMatchObject({ setsPlayed: 1, setsDraw: 1 })
      })
    })

    describe("Match counted when complete", () => {
      test("Played match", () => {
        const duel = newDuel(4)
        play(duel, [{ ...firstMatchStep, sc1: 3, sc2: 1 }])
        expect(stats(duel, "1")).toMatchObject({ matchesPlayed: 1, matchesWon: 1 })
        expect(stats(duel, "4")).toMatchObject({ matchesPlayed: 1, matchesLost: 1 })
        expect(stats(duel, "2")).toMatchObject(zeroCounters)
        expect(stats(duel, "3")).toMatchObject(zeroCounters)
      })
      test("Inverted scoring", () => {
        const duel = newDuel(4, { invertedScoring: true })
        play(duel, [{ ...firstMatchStep, sc1: 2, sc2: 5 }])
        expect(stats(duel, "1")).toMatchObject({ setsWon: 1, matchesWon: 1 })
        expect(stats(duel, "4")).toMatchObject({ setsLost: 1, matchesLost: 1 })
      })
    })

    describe("Walkover excluded from the stats", () => {
      test("Opponent passing a walkover", () => {
        const duel = newDuel(3)
        expect(duel.getMatch({ phase: F, bracket: W, round: 1, match: 1 })?.opponents.map((o) => o?.id)).toStrictEqual([
          "1",
          ""
        ])
        expect(stats(duel, "1")).toMatchObject({ matchesPlayed: 0, matchesWon: 0, setsPlayed: 0 })
      })
    })

    describe("Points ratio", () => {
      test("Counted points", () => {
        const duel = newDuel(4)
        play(duel, [{ ...firstMatchStep, sc1: 7, sc2: 1 }])
        expect(stats(duel, "1").ratioPoints).toBe(0.375)
      })
      test("More points conceded than scored", () => {
        const duel = newDuel(4)
        play(duel, [{ ...firstMatchStep, sc1: 7, sc2: 1 }])
        expect(stats(duel, "4").ratioPoints).toBe(-0.375)
      })
      test("Equal points", () => {
        const duel = newDuel(4, { nbMatchSets: [3] })
        play(duel, [{ ...firstMatchStep, s: 1, sc1: 3, sc2: 3 }])
        expect(stats(duel, "1").ratioPoints).toBe(0)
        expect(stats(duel, "4").ratioPoints).toBe(0)
      })
      test("No counted points", () => {
        newDuel(4)
          .getResult()
          .forEach((r) => expect(r.stats.ratioPoints).toBe(0))
      })
    })

    describe("Remaining matches", () => {
      test("Single elimination right after init", () => {
        newDuel(4)
          .getResult()
          .forEach((r) => expect(r.stats.matchesRemaining).toBe(2))
      })
      test("Eliminated opponent", () => {
        const duel = newDuel(4)
        play(duel, [firstMatchStep])
        expect(stats(duel, "4").matchesRemaining).toBe(0)
        expect(stats(duel, "1").matchesRemaining).toBe(1)
      })

      const remaining = (duel: DuelPhase) =>
        Object.fromEntries(duel.getResult().map((r) => [r.opponentId, r.stats.matchesRemaining]))
      // With 4 opponents: WB R1, then WB R2 for the winners and LB R1 for the losers, then LB R2 and grand final 1
      const doubleSteps: Step[] = [
        { b: W, r: 1, m: 1, p1: "1", p2: "4", sc1: 3, sc2: 1 },
        { b: W, r: 1, m: 2, p1: "2", p2: "3", sc1: 3, sc2: 1 },
        { b: W, r: 2, m: 1, p1: "1", p2: "2", sc1: 3, sc2: 1 },
        { b: L, r: 1, m: 1, p1: "4", p2: "3", sc1: 3, sc2: 1 },
        { b: L, r: 2, m: 1, p1: "2", p2: "4", sc1: 3, sc2: 1 }
      ]
      test.each([false, true])("Double elimination along the bracket (extended finals: %s)", (extended) => {
        const duel = newDuel(4, { elimination: "double", enableExtendedFinals: extended })
        // Grand final 2 adds one match to every opponent still in the bracket
        const gf2 = extended ? 1 : 0
        // Everyone in WB R1: WB R1, WB R2, GF1
        expect(remaining(duel)).toStrictEqual({ "1": 3 + gf2, "2": 3 + gf2, "3": 3 + gf2, "4": 3 + gf2 })
        // 1 and 2 in WB R2 (WB R2, GF1), 3 and 4 in LB R1 (LB R1, LB R2, GF1)
        play(duel, doubleSteps.slice(0, 2))
        expect(remaining(duel)).toStrictEqual({ "1": 2 + gf2, "2": 2 + gf2, "3": 3 + gf2, "4": 3 + gf2 })
        // 1 in GF1, 2 in LB R2 (LB R2, GF1)
        play(duel, doubleSteps.slice(2, 3))
        expect(remaining(duel)).toStrictEqual({ "1": 1 + gf2, "2": 2 + gf2, "3": 3 + gf2, "4": 3 + gf2 })
        // 3 eliminated, 4 in LB R2
        play(duel, doubleSteps.slice(3, 4))
        expect(remaining(duel)).toStrictEqual({ "1": 1 + gf2, "2": 2 + gf2, "3": 0, "4": 2 + gf2 })
        // 4 eliminated, 2 in GF1
        play(duel, doubleSteps.slice(4))
        expect(remaining(duel)).toStrictEqual({ "1": 1 + gf2, "2": 1 + gf2, "3": 0, "4": 0 })
      })
      test("Grand final 2 left to play", () => {
        const duel = newDuel(4, { elimination: "double", enableExtendedFinals: true })
        play(duel, [...doubleSteps, { b: L, r: 3, m: 1, p1: "1", p2: "2", sc1: 1, sc2: 3 }])
        expect(remaining(duel)).toStrictEqual({ "1": 1, "2": 1, "3": 0, "4": 0 })
      })
      test("Grand final 2 skipped when the winner bracket finalist wins grand final 1", () => {
        const duel = newDuel(4, { elimination: "double", enableExtendedFinals: true })
        play(duel, [...doubleSteps, { b: L, r: 3, m: 1, p1: "1", p2: "2", sc1: 3, sc2: 1 }])
        expect(remaining(duel)).toStrictEqual({ "1": 0, "2": 0, "3": 0, "4": 0 })
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
      const duel = newDuel(4, { nbMatchSets: [3] })
      duel.toggleForfeit("1")
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }, { "1": "FF" }, { "1": "FF" }])
    })
    test("A forfeit with inverted scoring", () => {
      const duel = newDuel(4, { invertedScoring: true })
      duel.toggleForfeit("1")
      expect(setScores(duel, firstMatch)).toStrictEqual([{ "1": "FF" }])
      expect(opponentIds(duel, final)).toStrictEqual(["4", undefined])
    })
  })

  describe("No score given to the opponent", () => {
    test("The opponent has no score", () => {
      const duel = newDuel(4, { nbMatchSets: [3] })
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
      const duel = newDuel(4, { nbMatchSets: [3] })
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
      expect(duel.getOpponents(true).find((o) => o.id === "1")?.forfeit).toBe(false)
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
    const stats = (duel: DuelPhase, id: string) => duel.getResult().find((r) => r.opponentId === id)?.stats
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
      const duel = newDuel(4, { nbMatchSets: [3] })
      play(duel, [{ b: W, r: 1, m: 1, s: 1, p1: "1", p2: "4", sc1: 5, sc2: 2 }])
      duel.toggleForfeit("1")
      expect(stats(duel, "1")).toMatchObject(noMatchCounted)
      expect(stats(duel, "4")).toMatchObject(noMatchCounted)
    })
    test("A forfeit after a played set with inverted scoring", () => {
      const duel = newDuel(4, { nbMatchSets: [3], invertedScoring: true })
      play(duel, [{ b: W, r: 1, m: 1, s: 1, p1: "1", p2: "4", sc1: 5, sc2: 2 }])
      duel.toggleForfeit("1")
      expect(stats(duel, "4")?.matchesLost).toBe(0)
      expect(stats(duel, "1")).toMatchObject(noMatchCounted)
      expect(stats(duel, "4")).toMatchObject(noMatchCounted)
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
      const duel = newDuel(8, { elimination: "double" })
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
      const duel = newDuel(4, { enableExtendedFinals: true })
      duel.toggleForfeit("1")
      duel.toggleForfeit("2")
      const match = duel.getMatch(matchId(L, 1, 1))
      expect(match?.opponents.map((o) => o?.id)).toStrictEqual(["1", "2"])
      expect(match?.opponents.map((o) => o?.forfeit)).toStrictEqual([true, true])
      expect(match?.sets.map((s) => s.scores)).toStrictEqual([{ "1": "FF", "2": "FF" }])
      expect(match?.complete).toBe(true)
    })
    test("The next match of the forfeiting opponent who moves on", () => {
      const duel = newDuel(8, { elimination: "double" })
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
      const duel = newDuel(4, { elimination: "double" })
      const [, second] = reachGrandFinal(duel)
      expect(duel.getCompletion()).toBe(5 / 6)
      duel.toggleForfeit(second!)
      expect(setScores(duel, gf1)).toStrictEqual([{ [second!]: "FF" }])
      expect(duel.getCompletion()).toBe(1)
    })
    test("Forfeit of the opponent in position 2 with extended finals", () => {
      const duel = newDuel(4, { elimination: "double", enableExtendedFinals: true })
      const [, second] = reachGrandFinal(duel)
      duel.toggleForfeit(second!)
      expect(duel.getMatch(gf1)?.complete).toBe(true)
      expect(duel.getMatch(gf2)?.complete).toBe(true)
      expect(setScores(duel, gf2)).toStrictEqual([{}])
      expect(duel.getCompletion()).toBe(1)
    })
    test("Forfeit of the opponent in position 1 with extended finals", () => {
      const duel = newDuel(4, { elimination: "double", enableExtendedFinals: true })
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
      const duel = newDuel(6, { elimination: "double" })
      duel.toggleForfeit("5")
      const lbMatch = matchId(L, 1, 1)
      expect(opponentIds(duel, lbMatch)).toStrictEqual(["5", ""])
      expect(duel.getMatch(lbMatch)?.complete).toBe(true)
      expect(setScores(duel, lbMatch)).toStrictEqual([{}])
      expect(opponentIds(duel, matchId(L, 2, 1))).toContain("5")
    })
    test("A parent correction replaces the opponent of a complete walkover match", () => {
      const duel = newDuel(6, { elimination: "double" })
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
      const duel = newDuel(10, { elimination: "double" })
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
  test("newStats returns 12 counters at zero, with a neutral points ratio", () => {
    expect(newStats()).toStrictEqual(initialStats)
    expect(Object.keys(newStats())).toHaveLength(12)
  })
  test("newStats returns a new object on each call", () => {
    expect(newStats()).not.toBe(newStats())
  })
  test("newOpponents creates an opponent", () => {
    expect(newOpponents(["a"])).toStrictEqual([{ id: "a", forfeit: false }])
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

  describe("Opponents created from ids", () => {
    const player = (id: string) => ({ id, forfeit: false })

    test("Initial opponents follow the order of the ids, with only their id and no forfeit", () => {
      const ids = ["3", "1", "4", "2"]
      const duel = new DuelPhase(F)
      duel.init(ids, duelBaseSettings)
      const opponents = duel.getOpponents(true)
      expect(opponents).toStrictEqual(ids.map(player))
      opponents.forEach((o) => expect(Object.keys(o).sort()).toStrictEqual(["forfeit", "id"]))
    })
    test("Only the opponents of a played match have their stats updated", () => {
      const duel = newDuel(4)
      play(duel, [{ b: W, r: 1, m: 1, p1: "1", p2: "4", sc1: 3, sc2: 1 }])
      const stats = (id: string) => duel.getResult().find((r) => r.opponentId === id)?.stats
      expect(stats("1")).toMatchObject({ matchesWon: 1, scoredPoints: 3 })
      expect(stats("4")).toMatchObject({ matchesLost: 1, scoredPoints: 1 })
      expect(stats("2")).toMatchObject(zeroCounters)
      expect(stats("3")).toMatchObject(zeroCounters)
    })
  })

  describe("Non-string ids", () => {
    const nonStringError = "validateOpponentIds: opponent ids must be strings."
    const expectRejected = (opponentIds: unknown[]) => {
      const duel = new DuelPhase(F)
      expect(() => duel.init(opponentIds as OpponentId[], duelBaseSettings)).toThrow(nonStringError)
      expect(duel.getMatches()).toEqual([])
      expect(duel.getOpponents(true)).toEqual([])
      expect(duel.settings).toBeUndefined()
    }

    test("Objects passed instead of ids are rejected", () => {
      expectRejected([{ id: "a" }, { id: "b" }])
    })
    test.each<[string, unknown]>([
      ["a number", 1],
      ["null", null],
      ["undefined", undefined]
    ])("An id that is %s is rejected", (_name, value) => {
      expectRejected(["1", value])
    })
    test("The type is checked before the empty id", () => {
      expectRejected(["", 1])
    })
  })

  describe("Forfeit before the phase starts", () => {
    const final = { phase: F, bracket: W, round: 2, match: 1 }

    test("An opponent's forfeit before any score progresses its match", () => {
      const duel = newDuel(4)
      duel.toggleForfeit("1")
      expect(duel.getOpponents(true).find((o) => o.id === "1")?.forfeit).toBe(true)
      expect(duel.getMatch(firstMatch)?.complete).toBe(true)
      expect(duel.getMatch(final)?.opponents.map((o) => o?.id)).toContain("4")
    })
  })

  describe("Isolation", () => {
    test("Changing the caller's players after init doesn't change the phase", () => {
      const players = createPlayers(4)
      const duel = new DuelPhase(F)
      duel.init(players, duelBaseSettings)
      const before = duel.getOpponents(true)

      players[0] = "replaced"
      players.pop()

      expect(duel.getOpponents(true)).toEqual(before)
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
    test.each<[string, OpponentId[], DuelSettings, string]>([
      [
        "too few opponents",
        createPlayers(1),
        duelBaseSettings,
        "validateOpponentIds: at least 2 opponents are required."
      ],
      ["duplicate ids", ["a", "a"], duelBaseSettings, "validateOpponentIds: opponent ids must be unique."],
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
      ["empty id", ["", ""], duelBaseSettings, "validateOpponentIds: opponent ids must not be empty."],
      [
        "infinite nbMatchSets",
        createPlayers(2),
        { ...duelBaseSettings, nbMatchSets: [Infinity] },
        "validateSettings: all nbMatchSets must be integers."
      ]
    ])("Rejected init leaves the phase empty: %s", (_name, opponentIds, settings, message) => {
      const duel = new DuelPhase(F)
      expect(() => duel.init(opponentIds, settings)).toThrow(message)
      expect(duel.getMatches()).toEqual([])
      expect(duel.getOpponents(true)).toEqual([])
      expect(duel.settings).toBeUndefined()
    })
    test("A valid init succeeds after a rejected one", () => {
      const duel = new DuelPhase(F)
      expect(() => duel.init(createPlayers(1), duelBaseSettings)).toThrow()
      duel.init(createPlayers(4), duelBaseSettings)
      expect(duel.getMatches()).toHaveLength(3)
      expect(duel.getOpponents(true)).toHaveLength(4)
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
      opponents: duel.getOpponents(true),
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
      expect(duel.getOpponents(true)).toEqual([])
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
