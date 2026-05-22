# Security

## Secrets

- **Never** hardcode secrets, API keys, passwords, or tokens in source code
- **Never** commit `.env` files — use `.env.example` for templates
- **Never** log sensitive data (passwords, tokens, PII)

## Input Validation

- Validate input at system boundaries (MCP tool args, external API responses) — zod or equivalent
- For any DB or shell call, use parameterized/escaped APIs — never string-concatenate user input

## Cryptography

- For timing-safe secret comparison, use `crypto.timingSafeEqual` (Node/Bun) instead of `===`
- Hash credentials before storage; never return raw tokens after creation

## Dependencies

- Don't add new dependencies without justification — vet supply chain before adding
