# rsvr

Reservation system via WhatsApp and Telegram messaging. Supports text messages and voice notes.

## Stack

- **Runtime**: Bun (version locked in `.bun-version`)
- **Language**: TypeScript (run directly via Bun, no compile step)
- **Database**: SQLite (`bun:sqlite`, no ORM)
- **WhatsApp**: Business Cloud API (official Meta)
- **Telegram**: grammY
- **Voice transcription**: OpenAI `gpt-4o-mini-transcribe`
- **Agent**: Claude Opus 4.5 (multi-turn `tool_use` loop)
- **Web framework**: Hono
- **Testing**: Bun native test runner
- **Linting/Formatting**: Biome
- **Build system**: Makefile

## Setup

```bash
make setup   # checks Bun version + installs dependencies
```

## Running

All configuration is passed exclusively via CLI arguments (no `.env` files). Required arguments:

```bash
bun run src/index.ts \
  --port 3000 \
  --database_path ./data/rsvr.db \
  --telegram_bot_token xxx \
  --whatsapp_verify_token xxx \
  --whatsapp_access_token xxx \
  --whatsapp_phone_number_id xxx \
  --whatsapp_app_secret xxx \
  --anthropic_api_key xxx \
  --openai_api_key xxx \
  --internal_api_key xxx
```

### Configuration arguments

| Argument | Default | Required | Description |
|----------|---------|----------|-------------|
| `--port` | `3000` | No | HTTP server port |
| `--database_path` | `./data/rsvr.db` | No | SQLite database file path |
| `--telegram_bot_token` | — | Yes | Telegram bot token |
| `--whatsapp_verify_token` | — | Yes | WhatsApp webhook verification token |
| `--whatsapp_access_token` | — | Yes | WhatsApp Cloud API access token |
| `--whatsapp_phone_number_id` | — | Yes | WhatsApp Business phone number ID |
| `--whatsapp_app_secret` | — | Yes | WhatsApp webhook app secret (HMAC-SHA256) |
| `--anthropic_api_key` | — | Yes | Anthropic API key (Claude Opus) |
| `--openai_api_key` | — | Yes | OpenAI API key (voice transcription) |
| `--internal_api_key` | — | Yes | Internal API key (monitoring endpoints) |
| `--log_level` | `info` | No | Log level: `debug`, `info`, `warn`, `error` |
| `--debug` | disabled | No | Enable HTTP request logging |
| `--graph_api_base` | `https://graph.facebook.com/v23.0` | No | WhatsApp Graph API base URL |

## Development

```bash
make help           # show all available commands
make ci_test        # run tests with Bun
make lint           # lint check (src/)
make format         # auto-format (src/)
make check          # lint + test together
make clean          # remove node_modules, *.db, data/, dist/
make clean_all      # clean everything including lockfile

# To run with watch mode:
bun run --watch src/index.ts --port 3000 --telegram_bot_token xxx ...
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

- **snake_case** for all identifiers (variables, functions, parameters, properties, file names)
- **snake_case_type** for all type names (no interfaces; use types only)
- **CONSTANT_CASE** for constants
- **Arrow functions** only (no `function` keyword declarations)
- **No semicolons** (enforced via Biome)
- **No .env files** — all configuration passed via CLI arguments only
- **No ORM** — raw SQL via `bun:sqlite` with parameterized queries
- Max function length: 50 lines (comment required if exceeded)
- Max file length: 200 lines (comment required if exceeded)
- Max 2 levels of code nesting in TypeScript
- Use `//  --` (two spaces before dash) as section separators
- Comments explain WHY, not WHAT
- Enforced via Biome (see `biome.json`)

## Message Flow

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
Claude Opus 4.5 Tool-Use Agent Loop
  │ multi-turn agent with tools
  ├─▶ check_availability (date, time, party_size)
  ├─▶ create_reservation (slot_id, party_size, notes)
  ├─▶ list_reservations (user's reservations)
  ├─▶ find_reservation (reservation details)
  ├─▶ cancel_reservation (user-scoped cancellation)
  └─▶ reschedule_reservation (move to new slot)
  │
  ▼
SQLite Database
  │
  ▼
Natural Language Reply ──▶ Return via same channel
```

For full architecture details, see [architecture/20260302_general_architecture.md](./architecture/20260302_general_architecture.md).

## API Costs

| Service | Model/Tier | Cost | Unit | Notes |
|---|---|---|---|---|
| OpenAI | gpt-4o-mini-transcribe | $0.003 | per minute | Voice note transcription. Typical note (10-30s) = $0.0005-$0.0015 |
| Anthropic | Claude Opus 4.5 | $3.00 / $15.00 | per 1M input/output tokens | Multi-turn agent loop. ~$0.005-$0.010 per message |
| WhatsApp | Business Cloud API | Free | service replies (24h window) | Customer-initiated replies within 24h are free |
| WhatsApp | Marketing messages | $0.025-$0.14 | per message | Varies by country. Not used in current flow |
| WhatsApp | Utility messages | $0.004-$0.046 | per message | Varies by country |
| Telegram | Bot API | Free | unlimited | No API costs |

### Estimated cost per reservation

| Step | Cost |
|---|---|
| Voice transcription (if voice note) | ~$0.001 |
| Agent loop (multi-turn tool_use) | ~$0.005-$0.010 |
| WhatsApp reply (within 24h) | Free |
| **Total per reservation** | **~$0.006-$0.011** |

## Docker & Deployment

### Building the Docker image

```bash
make build_images
```

This builds `rsvr:latest` using the Dockerfile in `local_infra/`. The image includes Bun runtime and source code for debugging support via `--inspect` flag.

### Local development with Docker

```bash
# Build images
make -C local_infra build_images

# Start with docker-compose (includes mock WhatsApp/Telegram servers)
docker compose -f local_infra/dokploy_compose_local.yml up
```

### Remote debugging with Docker

To enable debugging, override the entrypoint in docker-compose:

```yaml
# In docker-compose.yml:
services:
  rsvr:
    entrypoint: ["bun", "--inspect=0.0.0.0:9228"]
    ports:
      - 9228:9228
```

Then connect your IDE debugger to `localhost:9228`.

### Production deployment

Via Dokploy using the compose file in `local_infra/`. Pre-build images locally with `make build_images` before deploying.
