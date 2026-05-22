# Clean Code

## Naming

- Use meaningful, pronounceable names — no abbreviations (`userProfile`, not `usrPrf`)
- No magic numbers — extract to named constants (`const MAX_RETRY = 3`)
- Same vocabulary for same concept — pick one term and stick with it

## Functions

- Single responsibility — one function does one thing
- Max 3 parameters — use an options object for more
- Early returns over nested if/else — reduce indentation depth
- Keep functions short — if it needs a comment to explain a section, extract that section

## Types

- No `any` — use `unknown` with type narrowing or proper generics
- Prefer `const` over `let`, never `var`
- Use discriminated unions over optional fields when states are mutually exclusive

## Expressions

- Avoid nested ternaries — use if/else or extract to a variable
- Prefer `??` (nullish coalescing) over `||` for defaults

## Design

- Prefer composition over inheritance
- SOLID: single responsibility, open-closed, Liskov substitution, interface segregation, dependency inversion
- Don't over-abstract — three similar lines is better than a premature abstraction

## Comments

- Explain WHY, not WHAT — the code shows what, comments explain reasoning
- No commented-out code — use git history instead
- No obvious comments (`// increment counter` above `counter++`)
