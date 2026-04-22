<!--
=== MAINTENANCE PROCESS ===

This document is actively maintained throughout the development lifecycle.
Do NOT treat it as a static snapshot.

CADENCE:
  - WEEKLY: Scan recent PRs and code reviews for new gaps. Update CHANGELOG.
  - AFTER EACH FIX: Move resolved gap from its priority section to RESOLVED.
    Update dependencies, effort actuals, and CHANGELOG.
  - AFTER MILESTONES: Re-prioritize remaining gaps. Update Executive Summary.
  - BEFORE PRODUCTION PUSH: Full sign-off checklist (see RESOLVED section).

WHEN RESOLVING A GAP:
  1. Cut the gap entry from CRITICAL/IMPORTANT/MINOR section
  2. Paste it into the RESOLVED section with:
     - Resolution date
     - Commit hash or PR link
     - Actual effort vs estimated effort
     - Any follow-up items
  3. Update Gap Summary table counts
  4. Update dependencies that referenced the resolved gap
  5. Add a CHANGELOG entry

SIGN-OFF CRITERIA:
  - All 8 CRITICAL gaps: RESOLVED
  - All 14 IMPORTANT gaps: RESOLVED or explicitly deferred with written approval
  - At least 80% of MINOR gaps (15 of 18): RESOLVED
  - Status line updated to "READY FOR PRODUCTION"

QUARTERLY REVIEW:
  - Confirm CRITICAL gaps are still blocking
  - Check if MINOR items have become IMPORTANT
  - Verify file paths and line numbers are still accurate
  - Update effort estimates based on actuals

Owner: Engineering Manager
Last Updated: 2026-03-25
-->

# rsvr — Production Readiness Audit

**Date:** 2026-03-25
**Status:** NOT READY for production
**Auditor:** Engineering Manager (automated audit)
**Scope:** Full codebase (32 source files), 5 architecture documents, deployment configs, test suite

---

## CHANGELOG

### 2026-03-25 — Initial Audit

- Reviewed all 32 source files in `src/`
- Reviewed all 5 architecture documents in `architecture/`
- Cross-referenced code review summary (`20260325_code_review_summary.md`)
- Reviewed deployment configs (`local_infra/Dockerfile`, `dokploy_compose_local.yml`)
- Reviewed test suite (6 test files, ~81 test cases)
- Identified 8 critical blockers, 14 important gaps, 18 minor improvements

---

## Executive Summary

The rsvr reservation system is **not ready for production deployment**. The core message-to-reservation flow works end-to-end for WhatsApp and Telegram (text and voice), the agent loop with Claude Opus is functional, and the security posture is above average (HMAC-SHA256 verification, parameterized SQL, rate limiting, timing-safe comparisons).

However, eight critical blockers must be resolved before production launch:

1. Two of six agent tools are stubs (`find_reservation`, `reschedule_reservation`) — the system prompt advertises capabilities that do not work
2. `cancel_reservation` query lacks transaction wrapping — concurrent cancellations can corrupt slot capacity
3. No timeouts on any external API call (Anthropic, OpenAI, WhatsApp Graph API) — a slow upstream hangs the request indefinitely
4. No graceful shutdown — the process ignores SIGTERM, risking data corruption on container restart
5. `list_reservations` returns `created_at` instead of appointment `date`/`time` — users see wrong information
6. Unvalidated tool input casting — Claude outputs are cast without runtime type checks
7. No message deduplication — Meta retries produce duplicate bookings
8. Debug mode and remote inspector are enabled in the production compose file

The system also lacks a CRUD REST API (planned but directory does not exist), database indexes, database backup procedures, and has no retry logic for any external API call.

**Estimated total effort to reach production readiness:** 5-8 engineering days for critical + important gaps.

---

## Gap Summary by Priority

| Priority | Count | Description                                              |
|----------|-------|----------------------------------------------------------|
| CRITICAL | 8     | Prevent production deployment; data loss or security risk |
| IMPORTANT| 14    | Should be addressed before launch; operational risk       |
| MINOR    | 18    | Nice-to-have improvements; low risk if deferred           |

---

## CRITICAL BLOCKERS

These issues **must** be resolved before any production deployment. Each one can cause data corruption, security vulnerabilities, or broken user-facing functionality.

### C-01: Stub tool handlers advertised as functional

**Category:** Reliability
**Files:** `src/agent/tool_handlers.ts:181-186`, `src/agent/tool_handlers.ts:219-224`, `src/agent/prompts.ts`
**Description:** `find_reservation` and `reschedule_reservation` tool handlers return hardcoded error strings ("not yet implemented"). However, the system prompt in `prompts.ts` tells Claude it can "Retrieve details for a specific reservation" and "Reschedule a confirmed reservation." Claude will attempt to use these tools and report failures to users.
**Impact:** Users who ask to view reservation details or reschedule will hit dead ends. The agent wastes tool calls on stubs, consuming the 10-call budget.
**Recommended Fix:** Either implement both handlers with proper SQL queries and user_id scoping, or remove them from `AGENT_TOOLS` in `tools.ts` and update the system prompt to not advertise these capabilities.
**Effort:** 2-4 hours (implement) or 30 min (remove)
**Dependencies:** C-02 (reschedule needs transaction support)
**Owner:** Backend engineer

### C-02: `cancel_reservation` missing transaction wrapper

**Category:** Data Integrity
**Files:** `src/db/queries.ts:153-172`
**Description:** The `cancel_reservation` function performs three separate operations (SELECT, UPDATE reservations, UPDATE time_slots) without an atomic transaction. If the process crashes between the reservation status update and the time_slots decrement, the slot capacity counter becomes permanently wrong.
**Impact:** Concurrent cancellations can drive `time_slots.reserved` negative or leave it inflated, silently corrupting availability data.
**Recommended Fix:** Wrap in `db.transaction().immediate()` like `create_reservation` already does.
**Effort:** 15 min
**Dependencies:** None
**Owner:** Backend engineer

### C-03: No timeouts on external API calls

**Category:** Reliability
**Files:** `src/agent/agent.ts:36` (Anthropic), `src/voice/transcribe.ts:11` (OpenAI), `src/channels/whatsapp/client.ts:16,39,48` (Graph API), `src/channels/telegram/media.ts:9` (Telegram File API)
**Description:** All `fetch()` and SDK calls lack timeout/abort configuration. If Anthropic, OpenAI, or the WhatsApp Graph API becomes slow or unresponsive, the request handler hangs indefinitely. The Hono server has no global request timeout.
**Impact:** A single slow upstream response blocks the handler forever. Under load, this accumulates hanging connections and eventually exhausts memory or file descriptors.
**Recommended Fix:** Add `AbortSignal.timeout(ms)` to all `fetch()` calls. Configure SDK clients with timeout options. Suggested timeouts: Anthropic 30s, OpenAI 15s, Graph API 10s.
**Effort:** 1 hour
**Dependencies:** None
**Owner:** Backend engineer

### C-04: No graceful shutdown

**Category:** Operations
**Files:** `src/index.ts`
**Description:** The process does not handle SIGTERM or SIGINT signals. When Docker/Podman sends SIGTERM during container restart or deployment, the process is killed immediately. In-flight agent loops, database writes, and outbound API calls are interrupted without cleanup.
**Impact:** Active reservations being written to SQLite may be left in an inconsistent state (though WAL mode provides crash recovery for the journal, in-flight multi-step operations like create_reservation's transaction can be interrupted between the COMMIT and the response to the user). The Telegram bot `bot.stop()` is never called, which can cause duplicate message delivery on restart.
**Recommended Fix:** Register `process.on("SIGTERM", ...)` and `process.on("SIGINT", ...)` handlers that: (1) stop accepting new connections, (2) call `telegram_bot.stop()`, (3) wait for in-flight requests to complete (with a deadline), (4) close the SQLite connection.
**Effort:** 1.5 hours
**Dependencies:** None
**Owner:** Backend engineer

### C-05: `list_reservations` returns wrong date information (Bug #1)

**Category:** Data Integrity
**Files:** `src/db/queries.ts:174-180`, `src/agent/tool_handlers.ts:154-177`
**Description:** `list_reservations()` queries `SELECT * FROM reservations` without joining `time_slots`. The result has no `date` or `time` fields. The tool handler returns `created_at` (when the reservation was made) instead of the actual appointment date and time.
**Impact:** Users see incorrect information when listing their reservations. The agent tells users their appointment is on the creation date rather than the reserved date.
**Recommended Fix:** Add `JOIN time_slots ON time_slots.id = reservations.time_slot_id` and include `time_slots.date` and `time_slots.time` in the SELECT and response.
**Effort:** 30 min
**Dependencies:** None
**Owner:** Backend engineer

### C-06: Unvalidated tool input casting

**Category:** Security
**Files:** `src/agent/agent.ts:87-101`
**Description:** Claude's tool inputs arrive as `unknown` but are immediately cast with `as check_availability_input_type`, `as create_reservation_input_type`, etc. No runtime type validation occurs. If Claude sends unexpected types (e.g., `slot_id` as a string, `reservation_id` as an object), these values flow directly into SQL queries via parameterized bindings. While parameterized SQL prevents injection, type coercion bugs in SQLite can cause incorrect query behavior.
**Impact:** Potential for incorrect query results (e.g., string "7" vs number 7 in SQLite comparisons), application crashes on undefined property access, or unexpected behavior when Claude hallucinates malformed tool inputs.
**Recommended Fix:** Add runtime type guard functions for each tool input type that validate field presence and types before dispatching. Return `{ ok: false, error: "..." }` for malformed inputs.
**Effort:** 45 min
**Dependencies:** None
**Owner:** Backend engineer

### C-07: No message deduplication

**Category:** Data Integrity
**Files:** `src/channels/whatsapp/webhook.ts`
**Description:** The WhatsApp webhook handler does not track processed message IDs. Per the official WhatsApp Cloud API documentation, Meta retries webhook delivery for up to 7 days if the initial delivery times out (even if rsvr processes the message and returns 200, a network-level timeout could cause Meta to retry). Each retry triggers a new reservation flow.
**Impact:** Duplicate reservations created from a single user message. Slot capacity consumed multiple times for the same request.
**Recommended Fix:** Extract `message.id` from the webhook payload. Store processed IDs in an in-memory Set with TTL (24h) or in a SQLite table. Skip messages whose ID has already been processed.
**Effort:** 1 hour
**Dependencies:** None
**Owner:** Backend engineer

### C-08: Production compose file has debug mode and remote inspector enabled

**Category:** Operations / Security
**Files:** `local_infra/dokploy_compose_local.yml:66-67,97`
**Description:** The compose file enables `--inspect=0.0.0.0:9228` (remote debugger) and passes `--debug` (full request body logging). Both are appropriate for development but create security and performance risks in production. The inspector port (9228) is published and allows remote code execution by anyone who can reach it. Debug logging writes full webhook payloads (including user phone numbers) to logs.
**Impact:** Remote code execution via the V8 inspector protocol. PII exposure in logs. Performance overhead from debug logging.
**Recommended Fix:** Create a separate `docker-compose.production.yml` (or use environment variable overrides) that: (1) removes `--inspect`, (2) removes `--debug`, (3) removes port 9228 mapping, (4) sets `--log_level info`.
**Effort:** 30 min
**Dependencies:** None
**Owner:** DevOps / Backend engineer

---

## IMPORTANT GAPS

These issues should be addressed before launch. They represent operational risk, missing defense-in-depth, or significant quality concerns.

### I-01: Missing database indexes

**Category:** Performance
**Files:** `src/db/schema.sql`
**Description:** No indexes exist on the `reservations` table. Every per-user query (`list_reservations`, `cancel_reservation`) performs a full table scan. The architecture document specifies indexes on `reservations(user_id)` and `reservations(user_id, status)` but they are not in the schema.
**Impact:** Query performance degrades linearly with reservation count. Acceptable at low volume but will become noticeable at thousands of reservations.
**Recommended Fix:** Add `CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id)` and `CREATE INDEX IF NOT EXISTS idx_reservations_user_id_status ON reservations(user_id, status)` to `schema.sql`.
**Effort:** 10 min
**Dependencies:** None

### I-02: Missing `CHECK (reserved >= 0)` constraint on `time_slots`

**Category:** Data Integrity
**Files:** `src/db/schema.sql:10-19`
**Description:** The architecture document specifies a `CHECK (reserved >= 0)` constraint on `time_slots.reserved` to prevent decrement bugs from driving the counter negative. This constraint is not present in the actual schema.
**Impact:** If a bug in the cancel or reschedule logic decrements `reserved` past zero, the database silently allows it. This creates phantom capacity that leads to over-reserving.
**Recommended Fix:** Add `CHECK (reserved >= 0)` to the `reserved` column definition.
**Effort:** 5 min
**Dependencies:** C-02

### I-03: Telegram channel missing rate limiting

**Category:** Security
**Files:** `src/channels/telegram/bot.ts`
**Description:** The WhatsApp webhook has per-sender rate limiting (60 msgs/min with LRU eviction). The Telegram bot handler has no rate limiting at all.
**Impact:** A malicious Telegram user can flood the bot with messages, triggering unlimited Anthropic API calls (expensive) and potentially exhausting server resources.
**Recommended Fix:** Extract the `check_rate_limit` function from `webhook.ts` into a shared module and apply it in `bot.ts` before calling `handle_message`.
**Effort:** 30 min
**Dependencies:** None

### I-04: No retry logic for external API calls

**Category:** Reliability
**Files:** `src/agent/agent.ts`, `src/voice/transcribe.ts`, `src/channels/whatsapp/client.ts`
**Description:** No retry logic exists for any external API call (Anthropic, OpenAI, WhatsApp Graph API). A single transient failure (429 rate limit, 503 service unavailable, network blip) results in an error response to the user.
**Impact:** Users experience unnecessary failures during temporary upstream issues. The Anthropic API in particular can return 429 or 529 under load.
**Recommended Fix:** Add exponential backoff retry (1-2 retries, 1s/2s delays) for transient errors (429, 500, 502, 503, 529) on Anthropic and OpenAI calls. Graph API send failures could retry once.
**Effort:** 2 hours
**Dependencies:** C-03 (timeouts should be in place before adding retries)

### I-05: Media downloads lack size validation

**Category:** Security
**Files:** `src/channels/whatsapp/client.ts:48-56`, `src/channels/telegram/media.ts:9-16`
**Description:** Both WhatsApp and Telegram voice note downloads buffer the entire file into memory without checking `Content-Length` or capping the download size. A compromised CDN or malicious file could send arbitrarily large data.
**Impact:** Memory exhaustion and potential OOM kill of the process.
**Recommended Fix:** Check `Content-Length` header before downloading. Cap at 10 MB (WhatsApp voice notes are typically under 1 MB). Abort the download if the response exceeds the limit.
**Effort:** 20 min
**Dependencies:** None

### I-06: Transcription output unbounded

**Category:** Security
**Files:** `src/voice/transcribe.ts`, `src/reservations/service.ts`
**Description:** The OpenAI transcription response text is passed directly to `run_agent()` without any length limit. A very long transcription (from a long voice note) becomes a large user message that is sent to Anthropic, increasing cost and potentially enabling prompt injection.
**Impact:** Cost inflation via long voice notes. Potential prompt injection via specially crafted audio.
**Recommended Fix:** Cap the transcribed text at 2,000 characters before passing to the agent. Log a warning if truncation occurs.
**Effort:** 10 min
**Dependencies:** None

### I-07: PII logged at INFO level

**Category:** Security / Privacy
**Files:** `src/agent/agent.ts:60`, `src/channels/whatsapp/webhook.ts:245,261`
**Description:** Phone numbers and Telegram IDs are logged at INFO level in multiple locations: `sender_key` (contains raw phone number) in agent dispatch logs, `msg.from` in WhatsApp error logs.
**Impact:** PII stored in log files. Potential GDPR/privacy compliance issue depending on deployment jurisdiction.
**Recommended Fix:** Hash `sender_key` for logging purposes (e.g., `sha256(sender_key).slice(0, 12)`). Replace `msg.from` with a hashed identifier in log messages.
**Effort:** 30 min
**Dependencies:** None

### I-08: `db_ping` error leaks internal details on public `/status` endpoint

**Category:** Security
**Files:** `src/metrics/routes.ts:108-111`
**Description:** When the database is unhealthy, the `/status` endpoint returns the raw error message from the SQLite driver in the JSON response body. The `/status` endpoint is public (no auth required).
**Impact:** Internal implementation details (file paths, SQLite error messages) exposed to anyone who can reach the `/status` endpoint.
**Recommended Fix:** Return only `{ database: "error" }` in the public `/status` response. Move the detailed error to the authenticated `/monitor` endpoint.
**Effort:** 10 min
**Dependencies:** None

### I-09: Content-Length comparison uses string length instead of byte length

**Category:** Reliability
**Files:** `src/channels/whatsapp/webhook.ts:89`
**Description:** The webhook body size validation compares `raw_body.length` (UTF-16 code units) against the `Content-Length` header (byte count). For non-ASCII payloads (e.g., user names with accented characters, Arabic, Chinese), the string length differs from the byte length, causing legitimate webhooks to be rejected with HTTP 400.
**Impact:** Webhooks containing non-ASCII content are silently rejected. Users who send messages with non-ASCII names or text may not receive responses.
**Recommended Fix:** Use `Buffer.byteLength(raw_body)` instead of `raw_body.length`.
**Effort:** 5 min
**Dependencies:** None

### I-10: No database backup mechanism

**Category:** Operations
**Description:** SQLite is the sole source of truth for all reservation data. No backup script, cron job, or volume snapshot mechanism exists. The compose file documents a manual backup command in a comment but provides no automation.
**Impact:** A disk failure, accidental volume deletion, or database corruption results in total data loss with no recovery path.
**Recommended Fix:** Create a periodic backup script that copies the SQLite file (using `.backup` API or `sqlite3 .dump`) to a separate volume or remote storage. Run via cron or a sidecar container. Minimum: daily backups with 7-day retention.
**Effort:** 2 hours
**Dependencies:** None

### I-11: Missing `object` field validation in webhook POST handler

**Category:** Security
**Files:** `src/channels/whatsapp/webhook.ts:101-107`
**Description:** The webhook POST handler does not verify that `body.object === "whatsapp_business_account"`. Any JSON payload with an `entry` array will be processed.
**Impact:** Non-WhatsApp webhook payloads (if routing is misconfigured) could be processed, potentially causing unexpected behavior.
**Recommended Fix:** Add `if (body.object !== "whatsapp_business_account") return c.json({ status: "ok" })` before processing entries.
**Effort:** 5 min
**Dependencies:** None

### I-12: Compose file missing top-level `networks` declaration

**Category:** Operations
**Files:** `local_infra/dokploy_compose_local.yml`
**Description:** Both services reference `dokploy-network` in their `networks:` block, but the compose file has no top-level `networks:` section declaring `dokploy-network` as `external: true`. Docker Compose will attempt to create a new network named `rsvr_dokploy-network` instead of joining the existing Dokploy network.
**Impact:** Services cannot communicate with Traefik or each other if the network name does not match the existing Dokploy bridge network.
**Recommended Fix:** Add a top-level `networks:` section: `networks: { dokploy-network: { external: true } }`.
**Effort:** 5 min
**Dependencies:** None

### I-13: CRUD REST API not implemented

**Category:** Reliability
**Files:** Not created (planned: `src/api/bookings.ts`)
**Description:** The architecture document specifies a full CRUD REST API for external consumers (dashboards, admin tools) at `/bookings`. The `src/api/` directory does not exist.
**Impact:** No administrative interface for viewing, managing, or modifying bookings outside of the chat channels. Business operators have no dashboard or management tool.
**Recommended Fix:** Determine if the CRUD API is required for launch. If not, update the architecture document to mark it as post-launch. If required, implement the 5 endpoints with the existing `internal_auth` middleware.
**Effort:** 4-8 hours (if required)
**Dependencies:** None

### I-14: Calendar sync stubs not created

**Category:** Reliability
**Files:** Not created (planned: `src/calendar/sync.ts`)
**Description:** The architecture document specifies no-op stub functions in `src/calendar/sync.ts` for Phase 2 calendar integration. The `src/calendar/` directory does not exist. While this does not affect Phase 1 functionality, the missing stubs mean Phase 2 will require changes to tool handler call sites.
**Impact:** Phase 2 calendar integration will require more refactoring than planned. No impact on Phase 1 MVP.
**Recommended Fix:** Create the stub file with no-op exports matching the type signatures in the architecture document.
**Effort:** 15 min
**Dependencies:** None

---

## MINOR IMPROVEMENTS

These are quality improvements that reduce technical debt but are not required for production launch.

| ID    | Category        | Description                                                                                   | Effort  |
|-------|-----------------|-----------------------------------------------------------------------------------------------|---------|
| M-01  | Data Fidelity   | MIME type hardcoded to `audio/ogg` in both WhatsApp and Telegram media handlers               | 15 min  |
| M-02  | Data Fidelity   | Audio `sha256` from webhook payload not verified against downloaded bytes                      | 20 min  |
| M-03  | Data Fidelity   | WhatsApp message `id` and `timestamp` not extracted or stored (no audit trail)                 | 20 min  |
| M-04  | Data Fidelity   | WhatsApp send response not parsed (outbound message ID not tracked)                           | 15 min  |
| M-05  | Data Fidelity   | WhatsApp `audio.voice` boolean not checked (cannot distinguish voice notes from audio files)   | 5 min   |
| M-06  | Data Fidelity   | WhatsApp `metadata` field not typed (no multi-phone-number routing support)                    | 15 min  |
| M-07  | Data Fidelity   | WhatsApp status notifications silently ignored (sent/delivered/read not tracked)               | 30 min  |
| M-08  | Code Quality    | Second-order functions (`.map()`, `.filter()`, `.forEach()`) in 6+ files violate Rule 12      | 60 min  |
| M-09  | Code Quality    | File length violations: `webhook.ts` (272 lines), `tool_handlers.ts` (225 lines)              | 30 min  |
| M-10  | Code Quality    | Function length violations: 3 functions exceed 50-line limit without justification             | 20 min  |
| M-11  | Code Quality    | Argument order violations in webhook functions (basic types should precede complex types)      | 10 min  |
| M-12  | Code Quality    | Nesting exceeds 2 levels in `webhook.ts`, `queries.ts`, `routes.ts`                           | 20 min  |
| M-13  | Code Quality    | `get_session` has side effects (creates and stores new session) while also returning a value   | 15 min  |
| M-14  | Code Quality    | Unused parameter `_current_time_ms` in `create_reservation`                                   | 5 min   |
| M-15  | Code Quality    | Legacy parser code (`src/parser/`) still in codebase, no longer called from service.ts        | 15 min  |
| M-16  | Testing         | `handle_cancel_reservation` lacks test coverage                                               | 30 min  |
| M-17  | Testing         | No integration/E2E tests for the full message-to-reply flow                                   | 4 hours |
| M-18  | Documentation   | CLAUDE.md references `make start` and `make dev` targets that do not exist in the Makefile    | 10 min  |

---

## RESOLVED

_No gaps have been resolved yet. As fixes are implemented, move entries here with resolution details._

**Template for resolved entries:**

```
### [ID]: [Title]

**Resolved:** YYYY-MM-DD
**Commit/PR:** [link or hash]
**Actual Effort:** X hours (estimated: Y hours)
**Resolution:** [Brief description of what was done]
**Follow-up:** [Any remaining items, or "None"]
```

---

## Positive Controls Already in Place

The following security and reliability measures are correctly implemented and represent strong engineering:

- WhatsApp HMAC-SHA256 webhook signature verification with `timingSafeEqual` and hex format validation
- All SQL queries use parameterized bindings (zero string interpolation)
- `create_reservation` uses SQLite IMMEDIATE transactions for atomic check-and-insert
- Per-sender rate limiting on WhatsApp (60 msgs/min, LRU eviction at 10K entries)
- Agent loop hard cap (10 tool calls per invocation)
- Session memory bounds (40 message history cap, 30 min TTL)
- Internal endpoint dual authentication (localhost restriction + timing-safe API key)
- Sensitive config values redacted in startup logs
- All secrets passed via CLI arguments (no `.env` files, no environment variables)
- Database CHECK constraints on `status`, `channel`, and `notes` length
- Non-root container user (UID 1001) with `nologin` shell
- Container health checks on `/status` endpoint
- Structured JSON logging with configurable log levels

---

## Recommended Execution Order

### Phase 1: Critical Fixes (Days 1-2)

| Order | Gap  | Task                                                    | Effort   |
|-------|------|---------------------------------------------------------|----------|
| 1     | C-08 | Create production compose file (remove debug/inspector) | 30 min   |
| 2     | C-02 | Wrap `cancel_reservation` in IMMEDIATE transaction      | 15 min   |
| 3     | I-02 | Add `CHECK (reserved >= 0)` to schema                   | 5 min    |
| 4     | C-05 | Fix `list_reservations` JOIN and tool handler response   | 30 min   |
| 5     | C-06 | Add runtime type guards for tool inputs                 | 45 min   |
| 6     | C-03 | Add timeouts to all external API calls                  | 1 hour   |
| 7     | C-04 | Implement graceful shutdown handler                     | 1.5 hours|
| 8     | C-07 | Add message deduplication (in-memory Set with TTL)      | 1 hour   |
| 9     | I-09 | Fix Content-Length byte comparison                      | 5 min    |

### Phase 2: Important Gaps (Days 3-4)

| Order | Gap  | Task                                                    | Effort   |
|-------|------|---------------------------------------------------------|----------|
| 10    | I-01 | Add database indexes                                    | 10 min   |
| 11    | I-03 | Add rate limiting to Telegram bot                       | 30 min   |
| 12    | I-05 | Add media download size validation                      | 20 min   |
| 13    | I-06 | Cap transcription output length                         | 10 min   |
| 14    | I-07 | Hash PII in log messages                                | 30 min   |
| 15    | I-08 | Redact error details from public `/status`              | 10 min   |
| 16    | I-11 | Add `object` field validation in webhook                | 5 min    |
| 17    | I-12 | Fix compose networks declaration                        | 5 min    |
| 18    | I-10 | Create database backup script                           | 2 hours  |
| 19    | I-04 | Add retry logic for external API calls                  | 2 hours  |

### Phase 3: Stub Resolution (Days 4-5)

| Order | Gap  | Task                                                    | Effort   |
|-------|------|---------------------------------------------------------|----------|
| 20    | C-01 | Implement `find_reservation` handler with user_id scoping    | 1 hour   |
| 21    | C-01 | Implement `reschedule_reservation` handler with transaction  | 2 hours  |

### Phase 4: Optional Pre-Launch (Days 5-8)

| Order | Gap  | Task                                                    | Effort   |
|-------|------|---------------------------------------------------------|----------|
| 22    | I-13 | Implement CRUD REST API (if required for launch)        | 4-8 hours|
| 23    | I-14 | Create calendar sync stubs                              | 15 min   |
| 24    | M-16 | Add cancel_reservation test coverage                    | 30 min   |
| 25    | M-08 | Replace second-order functions with for...of loops      | 60 min   |

---

## Related Documents

| Document                                                                    | Relationship                                             |
|-----------------------------------------------------------------------------|----------------------------------------------------------|
| [General Architecture](./20260302_general_architecture.md)                   | Source of truth for planned features, schema, and bugs   |
| [WhatsApp Cloud API Recap](./20260308_whatsapp_cloud_api_recap.md)           | Detailed gap analysis for WhatsApp integration           |
| [Traefik HTTP Routing](./20260311_traefik_http_routing.md)                   | Deployment and routing configuration                     |
| [WhatsApp Message Flow](./20260311_whatsapp_message_flow.md)                 | End-to-end flow documentation and error handling matrix   |
| [Code Review Summary](./20260325_code_review_summary.md)                     | Code-level findings (overlaps with this audit)           |
