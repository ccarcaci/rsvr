# rsvr — WhatsApp Message Flow: whap to rsvr Interaction Overview

**Date:** 2026-03-11
**Status:** Current (reflects actual implementation state)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Responsibilities](#2-component-responsibilities)
3. [High-Level Architecture Diagram](#3-high-level-architecture-diagram)
4. [Flow 1: Text Message (End-to-End)](#4-flow-1-text-message-end-to-end)
5. [Flow 2: Voice Note (End-to-End)](#5-flow-2-voice-note-end-to-end)
6. [Data Transformations at Each Step](#6-data-transformations-at-each-step)
7. [Agent Processing Loop Detail](#7-agent-processing-loop-detail)
8. [Concrete Example: Booking a Restaurant Table](#8-concrete-example-booking-a-restaurant-table)
9. [Testing with whap: Simulating Messages](#9-testing-with-whap-simulating-messages)
10. [whap Endpoint Roles](#10-whap-endpoint-roles)
11. [Known Limitations and Solutions](#11-known-limitations-and-solutions)
12. [Error Handling and Failure Modes](#12-error-handling-and-failure-modes)
13. [Related Documents](#13-related-documents)

---

## 1. System Overview

When a WhatsApp user sends a message, two services are involved:

- **whap** — A WhatsApp Business Cloud API mock (https://github.com/fdarian/whap). In production, Meta's Cloud API fills this role. whap emulates the Meta webhook delivery and Graph API endpoints for local development.
- **rsvr** — The reservation service. Receives webhook POSTs, processes messages through a Claude Opus 4.5 agent loop, and sends replies back via the Graph API (or whap mock).

Both services run as containers on the `dokploy-network` bridge network, managed by Dokploy. Traefik sits in front for external HTTP routing, but service-to-service communication bypasses Traefik entirely using Docker DNS.

---

## 2. Component Responsibilities

### whap (WhatsApp Cloud API mock, port 3010)

| Responsibility                  | Description                                                                                      |
|---------------------------------|--------------------------------------------------------------------------------------------------|
| Emulate Meta Cloud API          | Provides the same webhook delivery format and Graph API endpoints as the real WhatsApp Cloud API  |
| Forward message events          | POSTs webhook payloads to `WEBHOOK_URL` (configured via environment variable)                    |
| Serve Graph API endpoints       | Responds to send-message and media-download requests from rsvr                                   |
| Health check                    | Exposes `/health` for container orchestration                                                    |

### rsvr (Reservation service, port 3000)

| Responsibility                       | File                                      | Description                                                                |
|--------------------------------------|--------------------------------------------|----------------------------------------------------------------------------|
| Webhook reception                    | `src/channels/whatsapp/webhook.ts`         | GET verification + POST message handler                                    |
| WhatsApp API client                  | `src/channels/whatsapp/client.ts`          | Send text messages + download media via Graph API v21.0                    |
| Voice note download                  | `src/channels/whatsapp/media.ts`           | Two-step media download, returns buffer + MIME type                        |
| Message type normalization           | `src/channels/types.ts`                    | Converts WhatsApp-specific payload to `incoming_message_type`              |
| Voice transcription                  | `src/voice/transcribe.ts`                  | OpenAI `gpt-4o-mini-transcribe` speech-to-text                            |
| Message orchestration                | `src/reservations/service.ts`              | Routes text/voice, upserts user, delegates to agent                       |
| Agent loop                           | `src/agent/agent.ts`                       | Claude Opus 4.5 multi-turn tool_use loop (max 10 tool calls)              |
| Session management                   | `src/agent/session.ts`                     | In-memory conversation history keyed by `channel:sender_id`               |
| Tool dispatch                        | `src/agent/tool_handlers.ts`               | In-process SQL queries for availability, booking, listing                  |
| Database                             | `src/db/queries.ts`                        | Raw SQLite via `bun:sqlite` (users, time_slots, reservations)             |

---

## 3. High-Level Architecture Diagram

```
                     LOCAL DEVELOPMENT                              PRODUCTION
                     -----------------                              ----------

 User (WhatsApp app)                                    User (WhatsApp app)
       |                                                       |
       |  sends message                                        |  sends message
       v                                                       v
 +-----------+                                         +-------------------+
 |   whap    |  (mock, port 3010)                      |  Meta Cloud API   |
 |           |  emulates Cloud API                     |  (WhatsApp infra) |
 +-----+-----+                                         +--------+----------+
       |                                                        |
       |  POST /webhook/whatsapp                                |  POST /webhook/whatsapp
       |  (Docker DNS: http://rsvr:3000)                        |  (public URL via Traefik)
       |                                                        |
       v                                                        v
 +----------------------------------------------------------------------+
 |                          rsvr (port 3000)                            |
 |                                                                      |
 |  webhook.ts --> service.ts --> agent.ts --> Claude Opus 4.5          |
 |       |              |             |              |                  |
 |       |              |             |         tool_handlers.ts        |
 |       |              |             |              |                  |
 |       |              |             |          queries.ts             |
 |       |              |             |              |                  |
 |       |         transcribe.ts      |          SQLite DB              |
 |       |         (OpenAI STT)       |                                 |
 |       |              |             |                                 |
 |       |              v             v                                 |
 |       |         <--------- reply text ---------->                    |
 |       |                                                              |
 |  client.ts --> POST /v21.0/{PHONE_ID}/messages                       |
 +----------+-----------------------------------------------------------+
            |
            |  send reply
            v
      whap / Meta Cloud API
            |
            v
      User (WhatsApp app)
```

---

## 4. Flow 1: Text Message (End-to-End)

```
 Step  Who              Action
 ----  ---              ------
  1    User             Sends text "Book a table for 2 tomorrow at 7pm" via WhatsApp
  2    whap / Meta      Wraps message in webhook payload, POSTs to rsvr
  3    webhook.ts       Parses entry/changes/value/messages, extracts text + sender phone
  4    webhook.ts       Builds incoming_message_type { channel, sender_id, text }
  5    webhook.ts       Calls handle_message(incoming) -- fire-and-forget (forEach + async)
  6    webhook.ts       Returns HTTP 200 { status: "ok" } immediately to whap/Meta
  7    service.ts       Receives incoming_message_type, sees text is present (no voice)
  8    service.ts       Upserts user: INSERT OR IGNORE into users table, returns user.id
  9    service.ts       Builds sender_key: "whatsapp:+391234567890"
 10    service.ts       Calls run_agent(user_id, sender_key, text)
 11    agent.ts         Loads session history from in-memory Map (or creates fresh)
 12    agent.ts         Appends { role: "user", content: text } to history
 13    agent.ts         Calls Claude Opus 4.5 with system prompt + tools + history
 14    Claude           Returns response (may include tool_use blocks or end_turn)
 15    agent.ts         If tool_use: dispatches each tool, appends results, loops to 13
 16    agent.ts         If end_turn: extracts text reply, saves session, returns string
 17    service.ts       Receives reply string from run_agent()
 18    webhook.ts       Calls whatsapp_client.send_text_message(sender_id, reply)
 19    client.ts        POSTs to Graph API: /v21.0/{PHONE_ID}/messages
 20    whap / Meta      Delivers reply to user's WhatsApp app
```

**Timing note:** Steps 5-20 happen asynchronously after the HTTP 200 is returned in step 6. The webhook handler uses `forEach` with an async callback (fire-and-forget), so the response to whap/Meta is immediate.

---

## 5. Flow 2: Voice Note (End-to-End)

```
 Step  Who              Action
 ----  ---              ------
  1    User             Records and sends a voice note via WhatsApp
  2    whap / Meta      Wraps audio message in webhook payload, POSTs to rsvr
  3    webhook.ts       Parses payload, detects msg.type === "audio"
  4    webhook.ts       Calls download_voice_note(whatsapp_client, audio.id)
  5    media.ts         Calls client.download_media(media_id)
  6    client.ts        Step 1: GET /v21.0/{MEDIA_ID} -- retrieves media URL
  7    Graph API        Returns { url: "https://lookaside.fbsbx.com/..." }
  8    client.ts        Step 2: GET {media_url} -- downloads binary audio
  9    lookaside.fbsbx  Returns raw audio bytes (Uint8Array)
 10    media.ts         Returns { buffer: Uint8Array, mime_type: "audio/ogg" }
 11    webhook.ts       Sets incoming.voice_buffer and incoming.voice_mime_type
 12    webhook.ts       Calls handle_message(incoming)
 13    service.ts       Detects voice_buffer present, no text
 14    service.ts       Calls transcribe_audio(buffer, "audio/ogg")
 15    transcribe.ts    Creates File object, sends to OpenAI gpt-4o-mini-transcribe
 16    OpenAI           Returns transcribed text string
 17    service.ts       Upserts user, builds sender_key, calls run_agent()
 18    agent.ts         (Same agent loop as text flow: steps 11-16 from Flow 1)
 19    service.ts       Receives reply string
 20    webhook.ts       Sends reply via whatsapp_client.send_text_message()
 21    client.ts        POSTs to Graph API
 22    whap / Meta      Delivers text reply to user
```

**Voice note adds three external calls** compared to text:
1. GET media metadata (Graph API)
2. GET media binary (lookaside.fbsbx.com)
3. POST transcription (OpenAI)

The MIME type is hardcoded to `"audio/ogg"` in `media.ts` regardless of the actual audio format reported by WhatsApp.

---

## 6. Data Transformations at Each Step

### Step A: Webhook payload (from whap/Meta)

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "contacts": [{ "profile": { "name": "Mario Rossi" } }],
        "messages": [{
          "from": "391234567890",
          "type": "text",
          "text": { "body": "Book a table for 2 tomorrow at 7pm" }
        }]
      }
    }]
  }]
}
```

### Step B: After webhook.ts parsing (incoming_message_type)

```typescript
{
  channel: "whatsapp",
  sender_id: "391234567890",
  sender_name: "Mario Rossi",       // from contacts[0].profile.name
  text: "Book a table for 2 tomorrow at 7pm",
  raw_payload: { from: "391234567890", type: "text", text: { body: "..." } }
}
```

Fields `voice_buffer` and `voice_mime_type` are undefined for text messages.

### Step C: After service.ts processing

```typescript
// User upserted in SQLite:
{
  id: 42,
  phone: "391234567890",
  channel: "whatsapp",
  name: "Mario Rossi"
}

// Agent invocation:
run_agent(
  42,                                    // user_id
  "whatsapp:391234567890",               // sender_key
  "Book a table for 2 tomorrow at 7pm"  // text
)
```

### Step D: Agent session history (sent to Claude)

```typescript
// System prompt includes today's date
// Messages array:
[
  { role: "user", content: "Book a table for 2 tomorrow at 7pm" }
]
```

### Step E: Claude response (tool_use)

```typescript
// stop_reason: "tool_use"
// content: [
//   { type: "text", text: "Let me check availability..." },
//   {
//     type: "tool_use", id: "toolu_01...", name: "check_availability",
//     input: { date: "2026-03-12", time: "19:00", party_size: 2 }
//   }
// ]
```

### Step F: Tool result appended to history

```typescript
// After dispatching check_availability:
{
  type: "tool_result",
  tool_use_id: "toolu_01...",
  content: '{"slot_id":7,"date":"2026-03-12","time":"19:00","available_capacity":4}'
}
```

### Step G: Final reply (end_turn)

```typescript
// Claude responds with stop_reason: "end_turn"
// content: [{ type: "text", text: "Great news! A table for 2 is available..." }]
```

### Step H: Send message payload (to Graph API)

```json
{
  "messaging_product": "whatsapp",
  "to": "391234567890",
  "type": "text",
  "text": { "body": "Great news! A table for 2 is available..." }
}
```

---

## 7. Agent Processing Loop Detail

```
                    +----------------------------+
                    |     run_agent() entry      |
                    |                            |
                    |  1. Load session history   |
                    |  2. Append user message    |
                    |  3. tool_call_count = 0    |
                    +-------------+--------------+
                                  |
                    +-------------v---------------+
                    |   tool_call_count >= 10 ?   |---- YES --> "Something went wrong"
                    +-------------+---------------+
                                  | NO
                    +-------------v---------------+
                    |  Call Claude Opus 4.5       |
                    |  (system prompt + tools     |
                    |   + full message history)   |
                    +-------------+---------------+
                                  |
                    +-------------v---------------+
                    |  API call failed ?          |---- YES --> "Having trouble connecting"
                    +-------------+---------------+
                                  | NO
                    +-------------v---------------+
                    |  Append assistant response  |
                    |  to history                 |
                    +-------------+---------------+
                                  |
               +------------------+-------------------+
               |                  |                   |
          end_turn           tool_use           other stop_reason
               |                  |                   |
               v                  v                   v
        Extract text       For each tool_use     "Something went
        from response       block:                wrong"
               |             |
               |             +-- dispatch_tool()
               |             +-- Execute SQL query
               |             +-- Build tool_result
               |             +-- Increment count
               |                  |
        Save session        Append tool_results
        Return reply        to history as "user"
                                  |
                            Loop back to top
                            (check count)
```

The agent loop has these key properties:

- **Max 10 tool calls** per `run_agent()` invocation (not per session). Prevents infinite loops.
- **Session persists** across messages from the same sender. History accumulates in the in-memory Map (no TTL enforcement, no history cap).
- **Tool dispatch is synchronous** (in-process SQL, no HTTP). Each tool handler returns immediately.
- **All DB queries are user-scoped** via `user_id` parameter to prevent cross-user data access.

---

## 8. Concrete Example: Booking a Restaurant Table

User sends: **"I'd like to book a table for 2 people tomorrow at 19:00"**

```
User --> whap --> POST /webhook/whatsapp --> rsvr
                                              |
                                         webhook.ts
                                         Parse: text = "I'd like to book..."
                                         sender_id = "391234567890"
                                              |
                                         service.ts
                                         Upsert user (id=42)
                                         sender_key = "whatsapp:391234567890"
                                              |
                                         agent.ts
                                         Load/create session
                                              |
                                   +----------+-----------+
                                   |   Turn 1: Claude     |
                                   |   -> tool_use:       |
                                   |     check_           |
                                   |     availability     |
                                   |   { date:            |
                                   |     "2026-03-12",    |
                                   |     time: "19:00",   |
                                   |     party_size: 2 }  |
                                   +----------+-----------+
                                              |
                                   tool_handlers.ts
                                   -> queries.check_availability()
                                   -> SQLite: SELECT from time_slots
                                     WHERE date='2026-03-12'
                                     AND time='19:00'
                                     AND (capacity - booked) >= 2
                                   -> Returns slot_id=7
                                              |
                                   +----------+-----------+
                                   |   Turn 2: Claude     |
                                   |   -> tool_use:       |
                                   |     create_booking   |
                                   |   { slot_id: 7,      |
                                   |     party_size: 2 }  |
                                   +----------+-----------+
                                              |
                                   tool_handlers.ts
                                   -> Re-verify capacity (get_slot_by_id)
                                   -> queries.create_reservation()
                                   -> INSERT into reservations
                                   -> UPDATE time_slots SET booked += 2
                                   -> Returns reservation_id=15
                                              |
                                   +----------+-----------+
                                   |   Turn 3: Claude     |
                                   |   -> end_turn        |
                                   |   "Your table for    |
                                   |    2 at the          |
                                   |    restaurant is     |
                                   |    confirmed for     |
                                   |    March 12 at       |
                                   |    19:00.            |
                                   |    Reservation #15." |
                                   +----------+-----------+
                                              |
                                         service.ts <-- reply text
                                              |
                                         webhook.ts
                                         -> client.send_text_message()
                                         -> POST Graph API /messages
                                              |
                                         whap / Meta
                                              |
                                         User receives reply
```

Total Claude API calls for this booking: **3** (check, create, summarize).
Total tool calls: **2** (check_availability, create_booking).

---

## 9. Testing with whap: Simulating Messages

### Method 1: Simulate a message via whap's `/mock` endpoint

`/mock/simulate-message` is whap-only developer tooling. It is **not present in the production Meta Cloud API**. When whap receives this request, it constructs a full webhook payload (identical to what Meta would send) and POSTs it to rsvr's `/webhook/whatsapp` endpoint via Docker DNS.

#### Via `podman exec` (recommended, bypasses Traefik)

```bash
podman exec whap curl --silent --show-error \
  --request POST \
  --header "Content-Type: application/json" \
  --data '{
    "from": "391234567890",
    "to": "15551234567",
    "message": {
      "id": "wamid.test_001",
      "timestamp": "1741689600",
      "text": { "body": "I would like to book a table for 2 people tomorrow at 19:00" }
    }
  }' \
  http://localhost:3010/mock/simulate-message
```

#### Required payload fields

| Field               | Type   | Description                                               |
|---------------------|--------|-----------------------------------------------------------|
| `from`              | string | Sender phone number (e.g. "391234567890")                 |
| `to`                | string | Recipient phone number (the business number)              |
| `message.id`        | string | Unique message ID (e.g. "wamid.test_001")                 |
| `message.timestamp` | string | Unix timestamp as string                                  |
| `message.text.body` | string | The message text content                                  |

#### Makefile shortcuts

Quick testing targets are available in `local_infra/Makefile`:

```bash
make -C local_infra curl_whap_simulate_message   # Send a generic text message
make -C local_infra curl_whap_simulate_booking    # Send a booking request
make -C local_infra test_webhook_flow             # Full E2E: simulate + wait + tail logs
```

---

## 10. whap Endpoint Roles

whap serves two distinct sets of endpoints with different purposes:

### `/mock/*` endpoints — Developer simulation control plane

These endpoints exist **only in whap** and are not present in the production Meta Cloud API. They allow developers to simulate incoming messages and trigger events.

| Endpoint                    | Purpose                                                      |
|-----------------------------|--------------------------------------------------------------|
| `/mock/simulate-message`    | Simulate an incoming WhatsApp message (triggers webhook POST) |

**When to use:** Testing the full inbound message flow. whap constructs a webhook payload and POSTs it to rsvr, triggering webhook parsing, agent processing, and reply generation end-to-end.

### `/v23.0` endpoints — Cloud API emulation

These endpoints are **drop-in replacements for Meta's Graph API**. rsvr uses them to send messages and download media, treating whap exactly as it would treat `graph.facebook.com`.

| Endpoint                                  | Purpose                                                |
|-------------------------------------------|--------------------------------------------------------|
| `/v23.0/{PHONE_ID}/messages`              | Send a text message (same as Meta Graph API)           |
| `/v23.0/{MEDIA_ID}`                       | Get media metadata URL (same as Meta Graph API)        |

**When to use:** rsvr calls these automatically when `--graph_api_base` is set to `http://whap:3010/v23.0`. No manual intervention needed — outbound messages from rsvr flow through whap instead of the real Meta API.

### Summary

```
Inbound (simulation):   Developer --> /mock/simulate-message --> whap --> POST /webhook/whatsapp --> rsvr
Outbound (reply):       rsvr --> POST /v23.0/{PHONE_ID}/messages --> whap (captures the reply)
```

With `--graph_api_base http://whap:3010/v23.0`, both directions flow through whap, creating a fully closed local development loop.

---

## 11. Known Limitations and Solutions

### Integration gap: Reply delivery (RESOLVED)

**Problem:** rsvr previously hardcoded `GRAPH_API_BASE = "https://graph.facebook.com/v21.0"`, meaning outbound replies always went to the real Meta API — even when running locally with whap.

**Solution:** The `--graph_api_base` CLI argument (added to `src/config/args.ts`) makes the Graph API base URL configurable. Set it to `http://whap:3010/v23.0` for local development:

```bash
# In local_infra/dokploy_compose_local.yml, the rsvr command block includes:
--graph_api_base ${GRAPH_API_BASE:-http://whap:3010/v23.0}
```

This is already configured in the compose file. For standalone `make dev` without compose, pass it manually or update `MOCK_ARGS` in the root Makefile.

### API version alignment

| Component | API version used              |
|-----------|-------------------------------|
| rsvr      | v23.0 (configurable)          |
| whap      | v22.0 and v23.0 (both mocked) |

The default `--graph_api_base` is `https://graph.facebook.com/v23.0` (updated from v21.0). whap supports both `/v22.0` and `/v23.0` endpoints. Version alignment is no longer an issue.

---

## 12. Error Handling and Failure Modes

### At the webhook layer (webhook.ts)

| Scenario                         | Behavior                                                                           |
|----------------------------------|------------------------------------------------------------------------------------|
| No `entry` in payload            | Returns HTTP 200 `{ status: "ok" }` immediately                                   |
| No `messages` in any change      | Filtered out; no processing occurs; returns 200                                    |
| Exception in message handler     | Caught by try/catch, logged; HTTP 200 still returned                               |
| Async errors inside forEach      | **Silently lost** -- `forEach` with async callback does not await promises         |

The webhook always returns HTTP 200 to prevent Meta/whap from retrying. This is correct per the WhatsApp Cloud API spec, but the `forEach` async pattern means individual message processing failures are not caught.

### At the service layer (service.ts)

| Scenario                        | Behavior                                                    |
|---------------------------------|-------------------------------------------------------------|
| No text and no voice_buffer     | Returns static help message                                 |
| Voice transcription fails       | Exception propagates up (no explicit catch)                 |
| User creation fails             | Exception propagates up (throws if INSERT + SELECT fails)   |
| Agent returns error string      | Error message is sent as the reply to the user              |

### At the agent layer (agent.ts)

| Scenario                        | Behavior                                                                      |
|---------------------------------|-------------------------------------------------------------------------------|
| Anthropic API call fails        | Returns "I'm having trouble connecting. Please try again in a moment."        |
| Max 10 tool calls exceeded      | Returns "Something went wrong, please try again."                             |
| Unexpected stop_reason          | Returns "Something went wrong, please try again."                             |
| Tool dispatch returns error     | Error sent back to Claude as `is_error: true` tool_result; Claude explains it |
| Unknown tool name               | Returns `{ ok: false, error: "Unknown tool: ..." }` to Claude                |

### At the tool handler layer (tool_handlers.ts)

| Scenario                        | Behavior                                                         |
|---------------------------------|------------------------------------------------------------------|
| Invalid date/time format        | Returns error string with format guidance                        |
| No availability for slot        | Returns descriptive error string                                 |
| SQL query throws                | Caught, logged, returns generic error string                     |
| Stub tools called               | Returns "X is not yet implemented."                              |

### At the WhatsApp client layer (client.ts)

| Scenario                        | Behavior                                                    |
|---------------------------------|-------------------------------------------------------------|
| Send message fails (non-200)    | Logs error, throws Error (not caught by webhook forEach)    |
| Media metadata fetch fails      | Throws Error                                                |
| Media binary download fails     | Throws Error                                                |

### Retry behavior

- **Meta retries webhook delivery** for up to 7 days if it does not receive HTTP 200. Since rsvr always returns 200, retries should not occur under normal circumstances.
- **No message deduplication** exists. If a retry does occur (e.g., network timeout before 200 is received), the same message will be processed twice.
- **No retry logic in rsvr** for outbound API calls (Claude, OpenAI, Graph API). A single failure results in an error response to the user.

---

## 13. Related Documents

| Document                                                             | Description                                                        |
|----------------------------------------------------------------------|--------------------------------------------------------------------|
| [General Architecture](./20260302_general_architecture.md)           | Full system design, agent loop, tools, schema, known bugs          |
| [WhatsApp Cloud API Recap](./20260308_whatsapp_cloud_api_recap.md)   | Official API mapping, gaps, payload structures                     |
| [Traefik HTTP Routing](./20260311_traefik_http_routing.md)           | Traefik config, port mappings, routing scenarios, service-to-service|

### Source Files Referenced

| File                                       | Purpose                                         |
|--------------------------------------------|--------------------------------------------------|
| `src/index.ts`                             | Hono app, route registration                     |
| `src/channels/whatsapp/webhook.ts`         | WhatsApp webhook GET/POST handlers               |
| `src/channels/whatsapp/client.ts`          | Graph API client (send + download)               |
| `src/channels/whatsapp/media.ts`           | Voice note download wrapper                      |
| `src/channels/types.ts`                    | `incoming_message_type` definition               |
| `src/reservations/service.ts`              | `handle_message` orchestrator                    |
| `src/voice/transcribe.ts`                  | OpenAI speech-to-text                            |
| `src/agent/agent.ts`                       | `run_agent` tool_use loop                        |
| `src/agent/session.ts`                     | In-memory session store                          |
| `src/agent/tools.ts`                       | 6 tool definitions (Anthropic SDK format)        |
| `src/agent/tool_handlers.ts`               | Tool implementations (3 complete, 3 stubs)       |
| `src/agent/prompts.ts`                     | System prompt with runtime date injection        |
| `src/db/queries.ts`                        | Core SQL queries (user, slot, reservation CRUD)  |
| `src/config/args.ts`                       | CLI argument parsing                             |
| `local_infra/dokploy_compose_local.yml`    | Docker Compose for Dokploy deployment            |
| `local_infra/Dockerfile_whap`              | whap mock server build                           |
