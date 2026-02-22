# rsvr

Reservation system via WhatsApp and Telegram messaging. Supports text messages and voice notes.

## Supported Domains

- Restaurant table reservations
- Doctor appointments
- Salon bookings

## Stack

- **Runtime**: Bun (version locked in `.bun-version`)
- **Language**: TypeScript (run directly via Bun, no compile step)
- **Database**: SQLite (`bun:sqlite`, no ORM)
- **WhatsApp**: Business Cloud API (official Meta)
- **Telegram**: grammY
- **Voice transcription**: OpenAI `gpt-4o-mini-transcribe`
- **Intent parsing**: Claude Haiku 4.5
- **Web framework**: Hono
- **Testing**: Jest
- **Linting/Formatting**: Biome
- **Build system**: Makefile

## Setup

```bash
make setup   # checks Bun version + installs dependencies
```

## Running

Pass environment variables via CLI:

```bash
TELEGRAM_BOT_TOKEN=xxx \
WHATSAPP_VERIFY_TOKEN=xxx \
WHATSAPP_ACCESS_TOKEN=xxx \
WHATSAPP_PHONE_NUMBER_ID=xxx \
ANTHROPIC_API_KEY=xxx \
OPENAI_API_KEY=xxx \
make start
```

### Optional env vars

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `DATABASE_PATH` | `./data/rsvr.db` | SQLite database file path |

## Development

```bash
make help           # show all available commands
make dev            # start with watch mode
make test           # run tests
make lint           # lint check (src/ + tests/)
make format         # auto-format (src/ + tests/)
make check          # lint + test together
make clean          # remove node_modules, *.db, data/, dist/
make clean-all      # clean everything including lockfile
```

### Bun Version Management

The required Bun version is locked in `.bun-version`.

```bash
# check current version matches
make check-version

# update Bun to a specific version
bun upgrade --version <new_version>

# then update the lock file
echo "<new_version>" > .bun-version
```

### Code Conventions

- **snake_case** for all identifiers (variables, functions, parameters, properties, types, interfaces)
- **CONSTANT_CASE** for constants
- **Arrow functions** for all function definitions (no `function` keyword)
- **No semicolons**
- **No .env files** — env vars passed via CLI
- **No ORM** — raw SQL via `bun:sqlite`
- Enforced via Biome (see `biome.json`)

## Architecture

```
User (WhatsApp/Telegram)
  │
  ▼
Channel Adapter (webhook / bot)
  │ normalizes to incoming_message
  ▼
Has voice? ──yes──▶ Voice Transcriber (OpenAI) ──▶ text
  │ no                                               │
  ▼                                                   ▼
Intent Parser (Claude Haiku)
  │ structured intent JSON
  ▼
Reservation Service
  │ business logic + DB queries
  ▼
Reply via same channel
```

## API Costs

| Service | Model/Tier | Cost | Unit | Notes |
|---|---|---|---|---|
| OpenAI | gpt-4o-mini-transcribe | $0.003 | per minute | Voice note transcription. Typical note (10-30s) = $0.0005-$0.0015 |
| Anthropic | Claude Haiku 4.5 | $1.00 / $5.00 | per 1M input/output tokens | Intent parsing. ~$0.0015 per message |
| WhatsApp | Business Cloud API | Free | service replies (24h window) | Customer-initiated replies within 24h are free |
| WhatsApp | Marketing messages | $0.025-$0.14 | per message | Varies by country. Not used in current flow |
| WhatsApp | Utility messages | $0.004-$0.046 | per message | Varies by country |
| Telegram | Bot API | Free | unlimited | No API costs |

### Estimated cost per reservation

| Step | Cost |
|---|---|
| Voice transcription (if voice note) | ~$0.001 |
| Intent parsing (1-2 messages) | ~$0.003 |
| WhatsApp reply (within 24h) | Free |
| **Total per reservation** | **~$0.004** |

## Infrastructure

Deployment via Dokploy (to be configured separately).
