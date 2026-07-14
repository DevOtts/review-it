# PRD — mini-formatter (fixture: plan artifact WITH DoDs+goals, WITHOUT a Test Contract)

Authored at plan phase, before the build. There is deliberately NO qa/test-plan*.md in this fixture.

## Goals
- G-1: `titlecase` capitalizes the first letter of every word of an ASCII sentence.
- G-2: `initials` returns the uppercase initials of a full name, dot-separated.

## Definition of Done
1. `titlecase("the quick brown fox")` returns `The Quick Brown Fox`.
2. `initials("ada lovelace")` returns `A.L.`
3. Both functions exported from `src/format.mjs` and callable via plain `node`.
