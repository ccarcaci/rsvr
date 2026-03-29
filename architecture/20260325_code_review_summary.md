# Code Review Summary — Full Codebase (32 files)

**Date:** 2026-03-25
**Scope:** Full codebase review (--full flag)
**Files reviewed:** 32
**Review agents:** code-reviewer, code-simplifier, security-reviewer, personal-style-reviewer

---

> **ARCHIVED (2026-03-29):** This document has been superseded by [`20260325_production_readiness.md`](./20260325_production_readiness.md), which consolidates all code review findings into a unified production audit with prioritized gaps, execution order, and resolution tracking. Refer to the production readiness document for the authoritative status of all issues.

---

## Overview

The rsvr reservation system exhibits **above-average security posture** with correct HMAC-SHA256 verification, parameterized SQL, and rate limiting already in place. However, several **critical correctness and security gaps** remain that require immediate attention, primarily around transaction safety, input validation, and PII exposure in logs.

---

## 🔴 Critical Issues (7 total)

### Data Integrity
- **`cancel_reservation` missing transaction** (`src/db/queries.ts:153-172`) — Two separate UPDATE statements without atomic wrapper. Concurrent cancellations could result in negative slot capacity. **Fix:** Wrap in `db.transaction().immediate()`. **Effort:** 10 min.

- **Content-Length comparison uses string length instead of bytes** (`src/channels/whatsapp/webhook.ts:89`) — Non-ASCII webhook payloads rejected incorrectly with 400 errors. `raw_body.length` returns UTF-16 code units, not bytes. **Fix:** Use `Buffer.byteLength(raw_body)`. **Effort:** 5 min.

### Security
- **Unvalidated `tool_input` casting** (`src/agent/agent.ts:87-101`) — Claude tool inputs arrive as `unknown` but cast without runtime type validation. `slot_id`, `reservation_id` flow into SQL without type checks. SQL injection via coercion possible. **Fix:** Implement narrow runtime type guards for each tool input field. **Effort:** 30 min.

- **Transcription length unbounded** (`src/voice/transcribe.ts`, `src/reservations/service.ts`) — OpenAI output injected into agent history with no size limit. Enables prompt injection and cost inflation. **Fix:** Cap transcribed text at 2,000 characters. **Effort:** 10 min.

- **Media downloads lack size validation** (`src/channels/whatsapp/client.ts:48-55`, `src/channels/telegram/media.ts:9-16`) — Both WhatsApp and Telegram voice downloads buffer entire files without Content-Length checks. Memory exhaustion risk if CDN compromised. **Fix:** Check `content-length` header, cap at 10 MB. **Effort:** 15 min.

- **PII logged in agent dispatch** (`src/agent/agent.ts:60`) — Phone numbers exposed at INFO log level on every tool call. `sender_key` contains raw phone/Telegram ID. **Fix:** Hash `sender_key` for logging or remove from log entry. **Effort:** 20 min.

### Code Quality
- **Widespread second-order functions** (6+ files) — `.map()`, `.filter()`, `.forEach()` callbacks violate project style Rule 12 across `agent.ts`, `tool_handlers.ts`, `config/args.ts`, `metrics/registry.ts`, `metrics/routes.ts`, `middleware/debug_request_logger.ts`. **Fix:** Replace with `for...of` loops. **Effort:** 60 min.

---

## ⚠️ High-Priority Concerns (10 total)

| Issue | Location | Impact | Effort |
|-------|----------|--------|--------|
| Telegram bot missing rate limiting | `src/channels/telegram/bot.ts` | User flood attacks possible | 20 min |
| `db_ping` error leaks to public `/status` | `src/metrics/routes.ts:108-110` | Internal details exposed to internet | 10 min |
| `debug_request_logger` logs raw payloads with PII | `src/middleware/debug_request_logger.ts:61-67` | Phone numbers in debug logs if enabled in prod | 15 min |
| `create_user` error includes raw identifier | `src/db/queries.ts:82` | PII in error messages | 5 min |
| Function/method distinction violated | `src/agent/session.ts:20-32` | `get_session` has side effects AND returns value | 15 min |
| Argument order violations in webhook functions | `src/channels/whatsapp/webhook.ts` (4 locations) | Basic types should precede complex types | 10 min |
| Nesting exceeds 2 levels | `webhook.ts:68-118`, `queries.ts:107-147`, `routes.ts:92-165` | Style violation (max 2 nesting levels) | 20 min |
| File length violations (no justification) | `webhook.ts` (272 lines), `tool_handlers.ts` (225 lines) | Exceed 200-line limit without comments | 30 min |
| Function length violations (no justification) | `create_whatsapp_routes` (63), `create_monitoring_routes` (73), `create_reservation` (52) | Exceed 50-line limit without comments | 20 min |
| Comments describe WHAT not WHY | `queries.ts:108-127`, `routes.ts:32-85`, others | Missing reasoning behind code structure | 15 min |

---

## ✅ Positive Security Controls (Well Implemented)

- ✅ **WhatsApp HMAC-SHA256 verification** — Textbook correct with `timingSafeEqual` and hex validation before comparison
- ✅ **Parameterized SQL throughout** — Zero string interpolation in `queries.ts`; SQL injection impossible
- ✅ **`create_reservation` uses IMMEDIATE transactions** — Atomic check-and-insert prevents double-booking TOCTOU races
- ✅ **Sensitive config redaction** — All tokens/keys/passwords automatically redacted in startup logs via `is_sensitive` pattern
- ✅ **Per-sender rate limiting** — 60 messages/min per WhatsApp sender with LRU eviction at 10K entries
- ✅ **Agent loop protection** — `MAX_TOOL_CALLS = 10` caps infinite tool cycles
- ✅ **Session memory bounds** — `MAX_HISTORY = 40` limits per-session conversation footprint
- ✅ **Internal endpoint authentication** — Both IP localhost restriction AND timing-safe API key comparison
- ✅ **No `.env` files** — All secrets passed via CLI args at runtime (git-safe)
- ✅ **Database constraints** — CHECK and FOREIGN KEY constraints provide defense-in-depth below application layer

---

## 📋 Issues by Category

### Security & Privacy (6 issues)
1. Unvalidated tool inputs → implement runtime type guards
2. Unbounded transcription length → cap at 2K characters
3. Media downloads unbounded → validate Content-Length + cap at 10 MB
4. PII in logs (phone numbers) → hash sender_key or exclude from INFO logs
5. Error messages leak identifiers → redact from error logs
6. Missing rate limiting (Telegram) → reuse `check_rate_limit` from WhatsApp

### Correctness (3 issues)
1. `cancel_reservation` not transactional → wrap with `db.transaction().immediate()`
2. Content-Length comparison uses string length → use `Buffer.byteLength()`
3. Unused parameter (`_current_time_ms`) → remove or use for timestamp validation

### Code Quality & Style (12 issues)
1. Second-order functions (6 files) → replace `.map(fn)` with `for...of` loops
2. File length violations (2 files) → add top-level justification comments
3. Function length violations (3 functions) → add justification comments
4. Function/method confusion (`get_session`) → split mutation into separate method
5. Argument order violations (4 functions) → reorder parameters per Rule 7
6. Nesting depth exceeds 2 levels (3 locations) → extract nested logic
7. WHAT comments instead of WHY → replace with reasoning comments
8. `//  --` separators inconsistent → standardize section markers
9. Duplicate mock types → consolidate to single source
10. Lazy-singleton pattern duplicated 3x → extract factory function
11. Validation logic duplicated → extract helpers
12. Magic numbers unhnamed → define constants

---

## 🎯 Top 10 Action Items

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| 1 | Fix `cancel_reservation` transaction safety | Prevent permanent data corruption | 10 min |
| 2 | Add tool input runtime validation | Prevent SQL injection via type coercion | 30 min |
| 3 | Fix Content-Length byte comparison | Fix false-positive webhook rejections | 5 min |
| 4 | Cap transcription length at 2K characters | Prevent prompt injection + cost inflation | 10 min |
| 5 | Validate media download sizes | Prevent memory exhaustion attacks | 15 min |
| 6 | Replace `.map(fn)` with `for...of` loops | Comply with Rule 12 across 6 files | 60 min |
| 7 | Hash phone numbers in agent logs | Prevent PII exposure at INFO level | 20 min |
| 8 | Fix argument order in webhook functions | Comply with Rule 7 (basic types first) | 10 min |
| 9 | Add rate limiting to Telegram bot | Prevent user flooding attacks | 20 min |
| 10 | Add file/function justification comments | Comply with file/function length rules | 30 min |

**Total estimated effort:** ~4 hours

---

## 📊 Code Quality Metrics

| Metric | Status | Notes |
|--------|--------|-------|
| SQL Injection Risk | ✅ Safe | All queries parameterized |
| Hardcoded Secrets | ✅ None | All secrets via CLI args |
| HMAC Verification | ✅ Correct | Uses `timingSafeEqual` with hex validation |
| Test Coverage | ⚠️ Partial | `handle_cancel_booking` untested; missing stubs for `get_booking`/`reschedule_booking` |
| Function Size | ⚠️ 3 violations | `create_whatsapp_routes` (63), `create_monitoring_routes` (73), `create_reservation` (52) |
| File Size | ⚠️ 2 violations | `webhook.ts` (272), `tool_handlers.ts` (225) |
| Nesting Depth | ⚠️ 3 violations | Exceeds 2-level limit in webhook POST, transaction callback, routes factory |
| Naming Convention | ✅ Consistent | snake_case throughout; types use `_type` suffix |
| Arrow Functions | ✅ 100% | No `function` keyword declarations |
| Semicolons | ✅ None | Properly omitted per Biome config |
| Second-order Functions | ❌ 6 violations | Should use `for...of` instead of `.map()`, `.filter()` |
| Rate Limiting | ⚠️ Partial | WhatsApp protected (60 req/min); Telegram unprotected |
| PII in Logs | ❌ Yes | Phone numbers logged at INFO level |

---

## 🚀 Verification Commands

After implementing fixes:

```bash
make lint       # Biome style/naming checks
make test       # Run full test suite (bun test src/)
make check      # Both lint and test
```

---

## File Structure Summary

**32 files reviewed across these modules:**

- `src/agent/` (7 files) — Claude Opus tool-use loop, session management, tool handlers, prompts
- `src/channels/` (6 files) — WhatsApp webhook + Cloud API client, Telegram grammY bot, shared message types
- `src/config/` (1 file) — CLI argument parsing with secret redaction
- `src/db/` (3 files) — SQLite client, schema, raw SQL queries
- `src/middleware/` (2 files) — Internal auth (localhost + API key), debug request logger
- `src/metrics/` (3 files) — Prometheus registry, routes, middleware
- `src/parser/` (4 files) — Legacy intent parser (being replaced by agent)
- `src/reservations/` (3 files) — Message handler service, types, mocks
- `src/voice/` (2 files) — OpenAI voice transcription client, transcription logic
- `src/shared/` (1 file) — Shared logger
- Root (1 file) — Entry point `index.ts`

---

## Next Steps

1. **Address critical security issues** (items 1-5 above) — transaction safety, input validation, media downloads, PII exposure
2. **Refactor second-order functions** (item 6) — large refactoring spanning 6 files but straightforward
3. **Add missing tests** — `handle_cancel_booking` coverage
4. **Code style cleanup** — argument order, nesting, comments, file/function justification
5. **Verify with full test suite** — `make check` after each major change group
