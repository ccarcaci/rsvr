# rsvr — General Architecture

**Date:** 2026-02-03
**Status:** Decided — implementation pending

---

## Overview

rsvr is a reservation system that receives text and voice messages from WhatsApp and Telegram, processes them with a Claude Opus agent loop, and manages bookings stored in SQLite. Supported business domains: restaurant, doctor, salon.

---

## Tech Stack

| Layer                | Choice                                           |
|----------------------|--------------------------------------------------|
| Runtime              | Bun (TypeScript, no compile step)                |
| Web framework        | Hono                                             |
| Database             | SQLite via `bun:sqlite` (raw SQL, no ORM)        |
| Channels             | WhatsApp Business Cloud API, Telegram via grammY |
| Voice transcription  | OpenAI `gpt-4o-mini-transcribe`                  |
| Agent                | Claude Opus (`tool_use` loop)                    |
| Linting / Formatting | Biome                                            |
| Testing              | Bun integrated test library                      |
| Deployment           | Dokploy (single instance)                        |

---

## Message Flow

All intents follow the same path from channel to agent to SQLite:

```
User (WhatsApp / Telegram)
  → voice note? → OpenAI STT → text
  → Hono (Bun)
  → run_agent(user_id, sender_key, text)          [src/agent/agent.ts]
      ↓
  Claude Opus tool_use loop
      ├─ check_availability(domain, date, time, party_size?)
      ├─ create_booking(slot_id, domain, party_size?, notes?)
      ├─ list_bookings(domain?, from_date?, to_date?)
      ├─ get_booking(booking_id)
      ├─ cancel_booking(booking_id)
      └─ reschedule_booking(booking_id, new_date, new_time)
            ↓
        tool_handlers.ts → queries.ts → SQLite
      ↓
  natural-language reply → WhatsApp / Telegram
```

The agent does NOT call the REST API over HTTP. Tool handlers call `queries.ts` in-process.

---

## Storage

SQLite is the source of truth for all bookings. No external calendar is required at MVP.

### Schema (no structural changes planned)

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE,
  telegram_id TEXT UNIQUE,
  name TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL CHECK (domain IN ('restaurant', 'doctor', 'salon')),
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  booked INTEGER NOT NULL DEFAULT 0 CHECK (booked >= 0),
  metadata TEXT,
  UNIQUE(domain, date, time)
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  time_slot_id INTEGER NOT NULL REFERENCES time_slots(id),
  domain TEXT NOT NULL CHECK (domain IN ('restaurant', 'doctor', 'salon')),
  party_size INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The `booked >= 0` check constraint on `time_slots` prevents decrement bugs from driving the counter negative.

Two explicit indexes should be created for query performance — they are currently missing:

```sql
CREATE INDEX IF NOT EXISTS idx_reservations_user_id
  ON reservations(user_id);

CREATE INDEX IF NOT EXISTS idx_reservations_user_id_status
  ON reservations(user_id, status);
```

Note: the absence of these indexes means full table scans on every per-user query. They must be added in the schema initialisation alongside the `CREATE TABLE` statements.

---

## Agent Design

### Entry point

`src/agent/agent.ts` exports:

```ts
export const run_agent = async (
  user_id: number,
  sender_key: string,
  text: string,
): Promise<string>
```

`sender_key` is the session key, formatted as `channel:sender_id` (e.g., `whatsapp:+391234567890`, `telegram:12345`).

The function runs the Anthropic `tool_use` loop:

1. Append user message to session history.
2. Call Claude Opus with tools and session history.
3. If `stop_reason === "tool_use"`: execute each tool block via `tool_handlers.ts`, append results, loop.
4. If `stop_reason === "end_turn"`: return the assistant text content.
5. Hard cap: abort after 10 tool calls per `run_agent()` invocation (not per session) to prevent infinite loops.

### Tool definitions — `src/agent/tools.ts`

Six tools exported as `Tool[]` (Anthropic SDK format):

| Tool                 | Parameters                                                    | Purpose                                         |
|----------------------|---------------------------------------------------------------|-------------------------------------------------|
| `check_availability` | `domain`, `date` (YYYY-MM-DD), `time` (HH:MM), `party_size?` | Check slot, return `slot_id` or error           |
| `create_booking`     | `slot_id`, `domain`, `party_size?`, `notes?`                  | Create reservation after confirmed availability |
| `list_bookings`      | `domain?`, `from_date?`, `to_date?`                           | List caller's active reservations               |
| `get_booking`        | `booking_id`                                                  | Get a single booking's full details             |
| `cancel_booking`     | `booking_id`                                                  | Cancel a reservation (user-scoped)              |
| `reschedule_booking` | `booking_id`, `new_date`, `new_time`                          | Move to a new slot (atomic transaction)         |

Notes on specific tools:

- `create_booking`: The handler must re-verify slot capacity before creating the reservation (i.e., re-query `time_slots` inside the same transaction and confirm `booked + party_size <= capacity`). If the slot is no longer available, return an error string to the agent. This guards against the race condition between `check_availability` and `create_booking` being two separate steps.

- `get_booking`: Must include `AND user_id = ?` in the query to prevent reading other users' bookings. The agent may hallucinate a `booking_id`; ownership must always be verified in SQL, not in application logic.

- `reschedule_booking`: After the `UPDATE` on `reservations`, check the affected row count. If 0, the booking does not belong to the caller — ROLLBACK the transaction and return an error string. Do not silently succeed when no row was updated.

### Tool handlers — `src/agent/tool_handlers.ts`

Each handler:
- Accepts the tool input block from the Opus response.
- Scopes every DB read and write to the caller's `user_id`.
- Calls `queries.ts` directly (no HTTP).
- Returns a plain-text or JSON string consumed as `tool_result` in the next Opus turn.

Security invariant: the handler must verify ownership. The agent may hallucinate a `booking_id` belonging to a different user. Every `cancel_booking` and `get_booking` call must include `AND user_id = ?` in the query.

### Session store — `src/agent/session.ts`

In-memory `Map<sender_key, session_entry>` where `session_entry` holds:
- `history: MessageParam[]` — accumulated Anthropic message history
- `last_active: number` — epoch ms

Rules:
- History cap: 20 turns. Oldest turns are dropped when exceeded.
- TTL: 30 minutes of inactivity resets the session.
- No SQLite persistence. Acceptable for a single-instance Dokploy deployment.

Note: if two messages from the same sender arrive concurrently (e.g., rapid double-send), both may read the same session state before either writes back. At current expected volume this is an acceptable trade-off; a per-key mutex or serialised queue would be needed to eliminate it.

### System prompt — `src/agent/prompts.ts`

The system prompt includes:
- Today's date (injected at runtime).
- Supported domains: `restaurant`, `doctor`, `salon`.
- Instruction to ask for missing information rather than guess.
- Instruction to always call `check_availability` before `create_booking`.
- Instruction to confirm cancellations explicitly before calling `cancel_booking`.

---

## Why Claude Opus (not Haiku) for the Agent Loop

The existing pipeline used Haiku for single-turn structured JSON extraction. That task is well-defined and Haiku is well-calibrated for it.

The agent loop is a different workload:
- Multi-step: invoke tool, read result, decide next tool, produce natural-language summary.
- Requires correct tool input construction on every turn.
- A wrong tool input in step 1 produces a cascading failure.

Haiku failure modes in agentic loops (documented): hallucinated tool inputs, premature `end_turn`, infinite tool call cycles. Opus has significantly lower tool_use failure rate and produces better summaries. Cost trade-off is acceptable at low-to-moderate volume (dozens of conversations per day per business).

---

## CRUD REST API

A separate Hono sub-app at `src/api/bookings.ts` exposes a REST interface for external consumers (dashboards, admin tools).

| Method   | Path            | Description                                                       |
|----------|-----------------|-------------------------------------------------------------------|
| `GET`    | `/bookings`     | List bookings (filters: `domain`, `from_date`, `to_date`, `status`) |
| `GET`    | `/bookings/:id` | Single booking                                                    |
| `POST`   | `/bookings`     | Create booking                                                    |
| `PUT`    | `/bookings/:id` | Update / reschedule                                               |
| `DELETE` | `/bookings/:id` | Cancel                                                            |

Authentication: static API key via `x-api-key` header. Middleware in `src/api/middleware/auth.ts` checks the key against the `INTERNAL_API_KEY` env var.

The Claude Opus agent does NOT call this HTTP API. It calls `queries.ts` in-process. The REST API is only for external consumers.

---

## Security

| Surface                                | Mechanism                                                                                  |
|----------------------------------------|--------------------------------------------------------------------------------------------|
| CRUD REST API (`/bookings/*`)          | Static `INTERNAL_API_KEY` via `x-api-key` header                                          |
| WhatsApp webhook (`/webhook/whatsapp`) | Public, validated by WhatsApp verify token (existing)                                      |
| Telegram webhook                       | grammY handles Telegram secret internally                                                  |
| Agent tool handlers                    | Every DB query scoped by `user_id`. Never trust Opus-provided IDs without ownership check. |
| Agent loop                             | Hard cap of 10 tool calls per `run_agent()` invocation to prevent infinite loops           |

---

## Why MCP Was Rejected

Three alternatives were evaluated:

### Option A: Cal.com MCP (`@calcom/cal-mcp`)

- No availability-checking tool in the default toolset.
- The underlying `/v2/slots` endpoint has documented reliability issues (open GitHub issues as of evaluation date).
- stdio transport spawns a Node.js child process: ~1.2 s cold start per invocation.
- A 3-step agentic loop adds 3–10 seconds of latency per message.
- Haiku-class models in agentic loops produce compounding errors: hallucinated slot IDs, premature termination, documented infinite loops.

### Option B: Google Calendar MCP (community, `nspady/google-calendar-mcp`)

- Server-to-server OAuth requires a service account with domain-wide delegation, which only works on Google Workspace organisations.
- Community-maintained, no official support.

### Option C: Full agentic loop with Opus for availability browsing

- Not needed. The user message already contains a specific date and time.
- Adds ~20x cost per agentic step versus Haiku with no reliability gain.
- Cal.com API availability data is the unreliable bottleneck, not model reasoning.

**Conclusion:** Agentic MCP adds latency and unreliability for no benefit when user intent already includes a specific date/time. Two direct in-process calls (`check_availability` + `create_booking`) are deterministic and latency-bounded.

---

## Multi-Calendar Integration: Phased Approach

### Phase 1 (MVP — current)

SQLite is the source of truth. No external calendar integration. Stub hooks are placed in `src/calendar/sync.ts` so that later phases do not require touching tool handler code.

After every successful write in `tool_handlers.ts`:

```ts
// no-op at Phase 1
await sync_booking_created(reservation)
await sync_booking_cancelled(reservation_id)
await sync_booking_rescheduled(old_reservation, new_reservation)
```

The stubs carry explicit type signatures so that Phase 2 can implement them without changing call sites:

```ts
export const sync_booking_created = async (
  reservation: reservation_row & { date: string; time: string },
): Promise<void> => {}

export const sync_booking_cancelled = async (
  reservation_id: number,
): Promise<void> => {}

export const sync_booking_rescheduled = async (
  old_reservation: reservation_row & { date: string; time: string },
  new_reservation: reservation_row & { date: string; time: string },
): Promise<void> => {}
```

The `date` and `time` fields come from the JOIN on `time_slots` (see Bug #1). Phase 2 receives them without needing to re-query.

### Phase 2: Cal.com as multi-calendar proxy

Use Cal.com Cloud REST API v2 directly (not via MCP):
- `GET /v2/slots` — check availability
- `POST /v2/bookings` — create booking

Cal.com allows each client to connect their Google Calendar, Outlook, or Apple Calendar. rsvr speaks to one REST API; Cal.com handles provider dispatch.

New env vars needed: `CALCOM_API_KEY`, `CALCOM_RESTAURANT_EVENT_TYPE_ID`, `CALCOM_DOCTOR_EVENT_TYPE_ID`, `CALCOM_SALON_EVENT_TYPE_ID`.

Phase 2 is implemented by replacing the no-op stubs in `src/calendar/sync.ts`. Tool handler code does not change.

### Phase 3: Native adapters (on demand)

Only if clients refuse Cal.com:

| Provider                              | Protocol                                        | Library                             |
|---------------------------------------|-------------------------------------------------|-------------------------------------|
| Google Calendar                       | OAuth 2.0 + REST v3 (`/freeBusy`, `/events`)    | `googleapis`                        |
| Microsoft 365                         | Microsoft Graph API (`/getSchedule`, `/events`) | `@microsoft/microsoft-graph-client` |
| Apple iCloud / CalDAV                 | CalDAV (PROPFIND, PUT, iCal)                    | `tsdav`                             |
| Self-hosted CalDAV (Radicale, Baikal) | CalDAV                                          | `tsdav`                             |

Phase 3 is a significant effort: OAuth callback handlers, token storage, refresh logic, per-tenant credential encryption. Estimated 3–5 weeks. Not justified until clients with external calendars onboard.

---

## File Structure (target state after implementation)

```
src/
  index.ts                    # Hono app, route registration
  config/env.ts               # Env var validation (add INTERNAL_API_KEY)
  db/
    schema.sql                # SQLite schema (unchanged)
    client.ts                 # bun:sqlite connection
    queries.ts                # Raw SQL — add JOIN on time_slots, reschedule tx, user-scoped cancel
  channels/
    types.ts                  # incoming_message_type, outgoing_message_type
    whatsapp/                 # Webhook handler + Cloud API client
    telegram/                 # grammY bot
  voice/
    transcribe.ts             # OpenAI STT
  agent/                      # NEW
    agent.ts                  # run_agent() — Opus tool_use loop
    agent.test.ts             # Agent integration tests
    tools.ts                  # Tool[] definitions (Anthropic SDK format)
    tool_handlers.ts          # In-process tool implementations
    session.ts                # In-memory session store (Map + TTL)
    prompts.ts                # System prompt builder
    types.ts                  # session_entry_type, tool name union, handler return types
  api/                        # NEW
    bookings.ts               # CRUD REST Hono sub-app
    middleware/
      auth.ts                 # x-api-key middleware (checks INTERNAL_API_KEY)
  reservations/
    service.ts                # MODIFY: replace Haiku dispatch with run_agent()
  calendar/                   # NEW (stubs for Phase 2/3)
    sync.ts                   # No-op sync hooks
    adapters/
      google.ts               # Phase 3
      m365.ts                 # Phase 3
  shared/
    logger.ts
```

Agent tests live alongside their source files in `src/agent/` following the Bun co-location convention. There is no separate top-level `tests/agent/` directory.

Note: when agent tests are added, `bunfig.toml` will need a preload entry pointing to the agent mock file (e.g., `src/agent/mocks.ts`) so that SDK client mocks are registered before any test file's import graph is resolved.

---

## Known Bugs to Fix During Implementation

These defects exist in the current codebase and must be corrected when implementing the agent layer:

### Bug #1 — `list_reservations`: missing JOIN on `time_slots`

`queries.ts`: the query selects from `reservations` only. The returned row type has no `date` or `time` fields. The agent's `list_bookings` handler needs the actual appointment date/time, not just `created_at`.

Fix: add a JOIN on `time_slots` and return `time_slots.date` and `time_slots.time` in the result set.

### Bug #2 — `service.ts`: wrong date in reservation list

`service.ts`: formats the reservation list using `r.created_at` (row creation timestamp) as the appointment date. This is wrong; `created_at` is when the row was inserted, not when the appointment is.

Fix: use `date` and `time` from the `time_slots` JOIN (depends on Bug #1).

### Bug #3 — `cancel_reservation`: no `user_id` scoping

`queries.ts`: `cancel_reservation(reservation_id)` fetches the reservation by ID only. Any caller can cancel any reservation by guessing an ID.

Fix: add `AND user_id = ?` to the query and pass `user_id` as a parameter. The tool handler must supply the authenticated `user_id`, not trust the Opus-provided `booking_id` alone.

### Bug #4 — No `reschedule_reservation` query

No reschedule logic exists. It must be implemented as a SQLite transaction:

```sql
BEGIN;
  -- verify new slot exists and has capacity
  UPDATE time_slots SET booked = booked - party_size WHERE id = old_slot_id;
  UPDATE time_slots SET booked = booked + party_size WHERE id = new_slot_id;
  UPDATE reservations
    SET time_slot_id = new_slot_id, updated_at = datetime('now')
    WHERE id = reservation_id AND user_id = ?;
COMMIT;
```

If any step fails, roll back the entire transaction.

### Bug #5 — `create_reservation`: no transactional capacity re-check

`create_reservation` (or the equivalent insert path) does not re-verify slot capacity inside the same transaction. The typical sequence — `check_availability` followed by `create_booking` — is two separate steps, so a concurrent booking can fill the slot between the check and the insert.

Fix options (pick one):
- **Transaction with re-check**: open a transaction, re-query `booked + party_size <= capacity`, then insert and increment `booked` in one atomic block. Abort if the check fails.
- **Database trigger**: add a `BEFORE INSERT` trigger on `reservations` that verifies capacity and raises an error if the slot is full.
- **WHERE guard on the UPDATE**: update `booked` with `WHERE id = slot_id AND booked + party_size <= capacity` and check affected row count; if 0, abort and return an error.

### Bug #6 — `service.ts`: `cancel_reservation` called without `user_id` scoping

`service.ts` currently calls `cancel_reservation` with only the reservation ID and no `user_id` parameter. This is the same unscoped-cancel defect as Bug #3 but at the service layer. This call will be removed when `service.ts` is replaced by `run_agent()`. Until that replacement lands, the unscoped call is a live privilege-escalation risk.

---

## Environment Variables

| Variable                          | Phase | Purpose              |
|-----------------------------------|-------|----------------------|
| `ANTHROPIC_API_KEY`               | 1     | Claude Opus agent    |
| `OPENAI_API_KEY`                  | 1     | Voice transcription  |
| `TELEGRAM_BOT_TOKEN`              | 1     | grammY               |
| `WHATSAPP_VERIFY_TOKEN`           | 1     | Webhook verification |
| `WHATSAPP_ACCESS_TOKEN`           | 1     | Cloud API            |
| `WHATSAPP_PHONE_NUMBER_ID`        | 1     | Cloud API sender     |
| `INTERNAL_API_KEY`                | 1     | CRUD REST API auth   |
| `CALCOM_API_KEY`                  | 2     | Cal.com REST v2      |
| `CALCOM_RESTAURANT_EVENT_TYPE_ID` | 2     | Cal.com event type   |
| `CALCOM_DOCTOR_EVENT_TYPE_ID`     | 2     | Cal.com event type   |
| `CALCOM_SALON_EVENT_TYPE_ID`      | 2     | Cal.com event type   |

All variables are passed via CLI at startup, not via `.env` files.

`INTERNAL_API_KEY` must be added to the `config_type` in `src/config/env.ts`. Implementors should add:

```ts
export type config_type = {
  // ... existing fields ...
  internal_api_key: string
}

export const configs: config_type = {
  // ... existing fields ...
  internal_api_key: load_required("INTERNAL_API_KEY"),
}
```

The `auth.ts` middleware then reads `configs.internal_api_key` and compares it against the `x-api-key` request header.
