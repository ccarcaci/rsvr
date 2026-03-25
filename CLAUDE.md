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
- **Intent parsing & agent**: Claude Opus (multi-step tool_use agent loop for reservations)
- **Linting/Formatting**: Biome
- **Testing**: Bun native test runner (`bun test`) — tests co-located with source in `src/`
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

Types and interfaces also use snake_case with `_type` suffix: `incoming_message_type`, `user_row_type`, `session_entry_type`.

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

### No .env files — CLI arguments only

All configuration is passed as `--flag value` CLI arguments. No environment
variables are read by the application; no `.env` files are used.

```bash
bun run src/index.ts \
  --port 3000 \
  --database_path ./data/rsvr.db \
  --telegram_bot_token xxx \
  --anthropic_api_key xxx \
  ...
```

For production, pass real values directly on the command line or via Docker Compose variable substitution in the `command:` block.

### No ORM

Use raw SQL via `bun:sqlite`. Queries live in `src/db/queries.ts`.

### Function Parameter Order

Parameters must be ordered by type specificity, from most specific to most general:

1. **Primitive booleans** — `debug: boolean`
2. **Integer numbers** — `user_id: number`, `port: number`
3. **Floating point numbers** — `timeout_ms: number` (if explicitly floating point)
4. **Strings** — `domain: string`, `name: string`
5. **Complex types (project-defined)** — `message: incoming_message_type`, `config: config_type`
6. **Complex types (standard library)** — `date: Date`, `error: Error`
7. **Complex types (external libraries)** — `client: Api`, `context: Context`
8. **Optional parameters** — Following the same order as required parameters

**Example:**
```ts
// correct: debug, integers, strings, project types, optional
export const create_session = (
  debug: boolean,
  user_id: number,
  current_time_ms: number,
  domain: string,
  sender_key: string,
  session: session_entry_type,
  metadata?: unknown,
): session_entry_type => { ... }

// incorrect: mixed order
export const create_session = (
  session: session_entry_type,  // ✗ complex type before primitives
  user_id: number,
  debug: boolean,               // ✗ boolean after number
  domain: string,
): session_entry_type => { ... }
```

### Minimal dependencies

Only add dependencies when absolutely necessary. Prefer built-in Bun APIs and standard library.

## Project Structure

```
src/
  index.ts              # Entry point
  config/args.ts        # CLI argument parsing and config
  db/                   # SQLite schema, client, queries
  channels/             # WhatsApp and Telegram adapters
    types.ts            # Shared message interfaces
    whatsapp/           # Webhook + Cloud API client
    telegram/           # grammY bot
  voice/transcribe.ts   # OpenAI STT
  parser/               # Intent extraction (legacy, not in use)
    prompts.ts          # Intent extraction prompts
    types.ts            # Intent types
    client/
      anthropic.ts      # Shared Anthropic SDK client
  agent/                # Claude Opus tool_use loop
    agent.ts            # Agent entry point
    agent.test.ts       # Agent tests
    tools.ts            # 6 tool definitions
    tool_handlers.ts    # Tool implementations
    session.ts          # Session store (in-memory, TTL)
    types.ts            # Type definitions
    prompts.ts          # System prompt
    mock.ts             # Test mocks
  metrics/              # Monitoring (added during implementation)
    registry.ts         # In-memory counters + histogram
    middleware.ts       # Request metrics middleware
    routes.ts           # /status, /health, /metrics endpoints
  reservations/         # Business logic
    service.ts          # Message handling + agent invocation
    types.ts            # Reservation types
    mock.ts             # Service test mocks
  shared/logger.ts      # Structured JSON logger
```

**Planned but not yet created:**
- `src/api/` — CRUD REST API (status: not implemented)
- `src/calendar/` — Calendar sync stubs (status: not implemented)

**Test co-location**: Tests live in the same directory as their implementations (e.g., `src/agent/agent.test.ts` alongside `src/agent/agent.ts`). Makefile runs `bun test $(SRC_DIR)/` to discover all `*.test.ts` files.

## Commands (Makefile)

All commands are in the Makefile. Run `make help` to see all targets.

```bash
make setup              # Full setup: check Bun version + install deps
make install            # Install dependencies
make check_version      # Verify Bun version matches .bun-version
make ci_test            # Run Bun tests (bun test src/)
make test_debug         # Run tests with debugger (--inspect-brk)
make lint               # Biome lint check (src/)
make format             # Biome auto-format (src/)
make check              # Run lint + test together
make ci_check           # CI mode: check formatting + imports + lint (read-only)
make ci_sec             # Security audit (bun audit --prod)
make ci_fast            # Full CI: check_version + ci_check + ci_test + ci_sec
make updates            # Check for dependency and Bun version updates
make updates_changelog  # Updates with changelogs for outdated packages
make clean              # Remove node_modules, *.db, data/, dist/
make clean_all          # Clean everything including bun.lockb
```

**Testing**: Uses Bun's native test runner. Tests are co-located with source files in `src/` (e.g., `src/agent/agent.test.ts`). Mocks are registered using `mock.module()` calls inside the `describe` block, with dynamic `await import()` in `beforeAll` blocks.

## Bun Version

Locked in `.bun-version`. Check with `make check_version`.
Update: `bun upgrade --version <new_version>` then update `.bun-version`.

## Architecture: Multi-Calendar Integration Phased Approach

The system uses a phased rollout for external calendar support to minimize MVP complexity:

- **Phase 1 (MVP)**: SQLite is the source of truth. No external calendar integration. Stub hooks in `src/calendar/sync.ts` for later phases.
- **Phase 2**: Cal.com Cloud REST API as a multi-calendar proxy. Clients connect their Google Calendar, Outlook, or Apple Calendar to Cal.com; rsvr speaks to one REST API.
- **Phase 3**: Native adapters for Google Calendar, Microsoft 365, and CalDAV (Apple, Nextcloud, Radicale) for clients who refuse Cal.com.

See `architecture/20260302_general_architecture.md` for full architectural design, including the 6 Claude Opus agent tools, CRUD REST API, session management, and security model.

## Infrastructure

Deployment via Dokploy (to be configured separately).
