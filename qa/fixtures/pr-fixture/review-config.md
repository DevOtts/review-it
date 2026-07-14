# .claude/review-config.md — project review checklist (fixture; Engine-Core-style)

## Security  [blocking]
- No hardcoded secrets, API keys, or credentials in code
- User input validated before use in queries (no raw string interpolation in SQL)

## Testing  [blocking]
- New endpoints/functions have corresponding test coverage

## Code Quality  [advisory]
- No console.log statements (use the project logger)
- No commented-out code blocks
