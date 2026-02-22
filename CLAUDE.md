# rsvr - Project Guidelines

## Overview

Reservation system via WhatsApp and Telegram messaging. Handles text messages and voice notes. Domains: restaurant, doctor, salon.

## Tech Stack

- **Runtime**: Bun (version locked in `.bun-version`)
- **Language**: TypeScript (run directly, no compile step)
- **Database**: SQLite via `bun:sqlite` (no ORM, raw SQL)
- **Web framework**: Hono
- **Telegram**: grammY
- **WhatsApp**: Business Cloud API (official Meta)
- **Voice transcription**: OpenAI `gpt-4o-mini-transcribe`
- **Intent parsing**: Claude Haiku 4.5
- **Linting/Formatting**: Biome
- **Testing**: Jest with ts-jest
- **Build system**: Makefile (all commands live here, not in package.json)

## Code Conventions

### snake_case everywhere

All identifiers use `snake_case`:
- Variables: `const user_id = ...`
- Functions: `const handle_message = ...`
- Interface properties: `{ sender_id: string }`
- File names: use snake_case if multi-word

Exceptions:
- **Constants**: CONSTANT_CASE allowed (`INTENT_SYSTEM_PROMPT`)
- **External API properties**: camelCase allowed when matching third-party APIs (e.g. WhatsApp API `messaging_product`, Hono `c.req.query`)

Types and interfaces also use snake_case: `incoming_message`, `user_row`, `reserve_intent`.

Enforced via Biome `useNamingConvention` rule.

### Arrow functions only

Use arrow functions for all function declarations:
```ts
// correct
export const handle_message = async (msg: incoming_message): Promise<string> => { ... }

// wrong
export async function handleMessage(msg: incoming_message): Promise<string> { ... }
```

Enforced via Biome `useArrowFunction` rule for function expressions. Function declarations must be manually written as arrow functions assigned to variables.

### No semicolons

Semicolons are omitted. Enforced via Biome `javascript.formatter.semicolons: "asNeeded"`.

### No .env files

Environment variables are passed via CLI:
```bash
TELEGRAM_BOT_TOKEN=xxx ANTHROPIC_API_KEY=xxx make start
```

### No ORM

Use raw SQL via `bun:sqlite`. Queries live in `src/db/queries.ts`.

### Minimal dependencies

Only add dependencies when absolutely necessary. Prefer built-in Bun APIs and standard library.

## Project Structure

```
src/
  index.ts              # Entry point
  config/env.ts         # Env var validation
  db/                   # SQLite schema, client, queries
  channels/             # WhatsApp and Telegram adapters
    types.ts            # Shared message interfaces
    whatsapp/           # Webhook + Cloud API client
    telegram/           # grammY bot
  voice/transcribe.ts   # OpenAI STT
  parser/               # Claude Haiku intent extraction
  reservations/         # Business logic
  shared/logger.ts      # Logger
tests/
  parser/intent.test.ts
```

## Commands (Makefile)

All commands are in the Makefile. Run `make help` to see all targets.

```bash
make setup          # Full setup: check Bun version + install deps
make install        # Install dependencies
make check-version  # Verify Bun version matches .bun-version
make start          # Start server
make dev            # Start with watch mode
make test           # Run Jest tests
make lint           # Biome lint check (src/ + tests/)
make format         # Biome auto-format (src/ + tests/)
make check          # Run lint + test together
make clean          # Remove node_modules, *.db, data/, dist/
make clean-all      # Clean everything including lockfile
```

## Bun Version

Locked in `.bun-version`. Check with `make check-version`.
Update: `bun upgrade --version <new_version>` then update `.bun-version`.

## Infrastructure

Deployment via Dokploy (to be configured separately).
