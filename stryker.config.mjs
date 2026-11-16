// @ts-check

// GitHub Actions always sets CI=true. In CI the report goes to the Stryker
// Dashboard; locally a progress bar replaces it.
const isCI = Boolean(process.env.CI);

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: "jest",
  jest: {
    configFile: "jest.config.cjs",
  },
  coverageAnalysis: "perTest",
  // Stryker adds `// @ts-nocheck` to mutated files, so without a checker a
  // mutant that breaks the types would count as "survived". The checker marks
  // it as a compile error instead, which leaves it out of the score.
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  mutator: {
    excludedMutations: ["StringLiteral"],
  },
  disableBail: true,
  // Everything in src, so new files are picked up. Exclude only code no test
  // runs on purpose: its mutants would all count as "no coverage".
  mutate: [
    "src/**/*.ts",
    "!src/tournament.ts", // stub: its constructor always throws
  ],
  ignorePatterns: ["/.claude", "/openspec", "/coverage", "/reports", "/dist"],
  tempDirName: ".stryker-tmp",

  // Only re-test the mutants affected by changes since the last run. The
  // file is gitignored locally and restored from the cache in CI.
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",

  reporters: [
    "html",
    "json",
    "clear-text",
    ...(isCI ? ["dashboard"] : ["progress"]),
  ],
  htmlReporter: {
    fileName: "reports/mutation/mutation.html",
  },
  jsonReporter: {
    fileName: "reports/mutation/mutation.json",
  },
  // Project and version are detected from the GitHub Actions environment;
  // the API key comes from STRYKER_DASHBOARD_API_KEY.
  dashboard: {
    reportType: "full",
  },

  // Informative only: no `break`, so the score never fails the run.
  thresholds: { high: 80, low: 60, break: null },
};

export default config;
