---
description: "Create a Conventional Commits commit from staged changes (or files the user specifies)"
argument-hint: "[files or paths to stage before committing]"
disable-model-invocation: true
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*)
---

Create one git commit using the [Conventional Commits](https://www.conventionalcommits.org/) format.

**Conventional Commits format**

A commit message MUST be structured as follows:

```
<type>[(<scope>)][!]: <description>

[body]

[footer(s)]
```

- **type** (required): a noun describing the kind of change, e.g. `feat`, `fix`. Any noun is allowed as a
  type (e.g. `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `perf`, `style`), but:
  - `feat` MUST be used when the commit adds a new feature.
  - `fix` MUST be used when the commit is a bug fix.
- **scope** (optional): a noun describing a section of the codebase, in parentheses immediately after the
  type, e.g. `fix(parser):`.
- **!** (optional): placed immediately before the final colon to flag a breaking change, e.g.
  `feat(api)!:`. When `!` is used, the description itself must explain the breaking change, and the
  `BREAKING CHANGE:` footer may be omitted.
- **terminal colon and space** (required): immediately follows the type/scope/`!` prefix.
- **description** (required): a short summary of the change, immediately after the colon and space, e.g.
  `fix: array parsing issue when multiple spaces were contained in string`.
- **body** (optional): free-form prose giving additional context, separated from the description by one
  blank line. It may contain any number of newline-separated paragraphs.
- **footer(s)** (optional): one or more, separated from the body (or description, if there is no body) by
  one blank line. Each footer is `<token>: <value>` or `<token> #<value>`, where the token uses `-` instead
  of spaces (e.g. `Acked-by:`), except `BREAKING CHANGE` / `BREAKING-CHANGE`, which stay as written. A
  footer's value may itself span multiple lines/paragraphs; it ends at the next valid `token:`/`token #`
  pair.
  - A breaking change not already flagged with `!` in the prefix MUST be recorded as a footer: uppercase
    `BREAKING CHANGE: <description>` (or `BREAKING-CHANGE:`, which is a synonym).
- Everything above is case-insensitive except the literal `BREAKING CHANGE` token, which MUST stay
  uppercase.

**Staging**

- If no arguments are given: commit exactly what is already staged in git. Do not run `git add -A` or
  stage anything yourself — if nothing is staged, stop and tell the user there is nothing to commit.
- If arguments are given (`$ARGUMENTS`): treat them as the files/paths the user wants added, e.g.
  `/commit src/formats/duel.ts tests/duel.spec.ts`. Stage exactly those paths (`git add <path>...`), then
  proceed with whatever ends up staged. Never stage files the user didn't name.

**Steps**

1. Run `git status` and `git diff --staged` to see exactly what will be committed.
2. Review the staged diff for anything that looks like a secret or credential before committing, even if
   the filename looks innocuous.
3. Run `git log --oneline -10` to match this repo's existing message style (plain `type: subject`, no
   scope so far, e.g. `refactor: introduce isTeamOpponent type guard to replace unsafe casts`).
4. Write a message following the **Conventional Commits format** above:
   - Imperative description, no trailing period, under ~72 chars.
   - Pick `type` from: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`.
     Only use `scope` if it adds real clarity (this repo hasn't used one yet).
   - Add a body only when the description alone doesn't explain the _why_.
   - Only mark the commit as breaking (`!` or `BREAKING CHANGE:` footer) if the staged change actually
     breaks the public API.
5. Create the commit with `git commit -m "$(cat <<'EOF' ... EOF)"` so multi-line messages are formatted
   correctly
6. Run `git status` after committing to confirm success, and report the resulting commit (hash + subject)
   to the user.

**Guardrails**

- Exactly one commit per invocation. If the staged changes clearly mix unrelated concerns, say so and ask
  whether to split them instead of silently bundling them into one message.
- Never use `git commit -a`, `git add -A`, or `git add .`.
- Never amend, rebase, or force-push.
- Never skip hooks (`--no-verify`) or bypass signing.
