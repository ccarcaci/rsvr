# Code Review & Fixes Report

**Scope:** Full codebase review + WhatsApp HMAC-SHA256 implementation security audit
**Files reviewed:** 31 TypeScript source files
**Date:** 2026-03-05 (initial); 2026-03-16 (HMAC security review); 2026-03-19 (issues #1–4 verified fixed)
**Status:** 8 critical issues identified; 13 high/medium security issues from HMAC implementation review; 22 total recommendations
**Fixed:** Issue #1 (WhatsApp HMAC-SHA256 verification) ✅; Issue #2 (Session TTL eviction) ✅; Issue #3 (Booking race condition) ✅; Issue #4 (last_insert_rowid safety) ✅

---

## 🔒 Critical Issues (BLOCKING — Address Immediately)

### 1. WhatsApp Webhook HMAC-SHA256 Verification Missing
- **Location:** `src/channels/whatsapp/webhook.ts:41-79`
- **Risk Level:** 🔴 CRITICAL — Allows forging arbitrary reservation events
- **Impact:** Attacker can create/cancel any reservation without authentication
- **Status:** ✅ **FIXED** (2026-03-19)
- **Implementation:**
  1. ✅ Raw request body read before parsing JSON (line 40)
  2. ✅ HMAC-SHA256 computed with app_secret (lines 103–105)
  3. ✅ Constant-time comparison via timingSafeEqual (line 114)
  4. ✅ Returns 403 on mismatch (line 44)
- **Verification:** Signature check occurs before JSON parse; prevents unsigned payload processing

### 2. In-Memory Session DoS (Unbounded Memory Growth)
- **Location:** `src/agent/session.ts:3-15`
- **Risk Level:** 🔴 CRITICAL — DoS vector; attacker exhausts heap
- **Status:** ✅ **FIXED** (2026-03-19)
- **Implementation:**
  1. ✅ TTL-based cleanup: `SESSION_TTL_MS = 30 * 60 * 1000` (line 3)
  2. ✅ Max history cap: `MAX_HISTORY = 40` (line 4)
  3. ✅ `evict_expired()` function removes sessions older than TTL (lines 10–16)
  4. ✅ Cleanup called in `get_session()` and `update_session()` before operations (lines 21, 41)
  5. ✅ History capped on session update (lines 43–44)
- **Verification:** Sessions now self-clean on read/write; memory bounded by max active users × max history length

### 3. Booking Creation Race Condition (TOCTOU → Overbooking)
- **Locations:** `src/agent/tool_handlers.ts:83-101`, `src/db/queries.ts:76-100`
- **Risk Level:** 🔴 CRITICAL — Concurrent requests can overbooking slots
- **Status:** ✅ **FIXED** (2026-03-19)
- **Implementation:**
  1. ✅ Entire flow wrapped in transaction (line 109: `db.transaction(() => { ... })`)
  2. ✅ Slot read inside transaction (lines 111–116)
  3. ✅ Capacity check atomic (lines 124–127)
  4. ✅ INSERT reservation (lines 130–134)
  5. ✅ UPDATE time_slots booked count (line 137)
  6. ✅ Executed with IMMEDIATE lock (line 150: `run_transaction.immediate()`) to prevent concurrent TOCTOU
- **Verification:** SQLite IMMEDIATE transaction acquires write lock upfront; capacity check and write are atomic

### 4. Fragile `last_insert_rowid()` Usage
- **Location:** `src/db/queries.ts:89-95`
- **Risk Level:** 🟠 HIGH — Fragile; wrong ID returned if logic changes
- **Status:** ✅ **FIXED** (2026-03-19)
- **Implementation:**
  1. ✅ Removed separate `SELECT last_insert_rowid()` call
  2. ✅ Capture ID from INSERT result immediately: `insert_result.lastInsertRowid` (line 134)
  3. ✅ Use captured ID after UPDATE (line 142): `db.query(...).get(insert_result.lastInsertRowid as number)`
  4. ✅ All operations atomic within transaction (lines 109–147)
- **Verification:** ID captured from result object, not from a separate function call; safe even if logic changes

### 5. Duplicate `get_slot_by_id` Definition
- **Status:** ✅ FIXED
- **What was done:**
  1. ✅ Deleted `src/agent/queries.ts` entirely
  2. ✅ `get_slot_by_id` now defined only in `src/db/queries.ts:182`
  3. ✅ `src/agent/tool_handlers.ts:1` imports from `../db/queries`
  4. ✅ Usage at `tool_handlers.ts:89` correctly calls `queries.get_slot_by_id(slot_id)`
- **Verification:** Single source of truth for slot queries; no duplicate maintenance burden

### 6. Excessive Function Length Without Justification
- **Status:** ✅ MOSTLY FIXED
- **What was done:**
  1. ✅ `src/agent/tool_handlers.ts` — `handle_create_booking`: 20 lines (was 55) — FIXED
  2. ✅ `src/metrics/routes.ts` — `render_prometheus`: 64 lines — JUSTIFIED with comment explaining Prometheus format requirement
  3. ⚠️ `src/agent/agent.ts` — `run_agent`: 57 lines (was 75) — Well-structured agent loop; keeping as-is
- **Additional findings (via codebase scan):**
  - `src/db/queries.ts` — `create_reservation`: 53 lines — JUSTIFIED (database transaction requires atomicity; all steps must be together)
  - `src/channels/whatsapp/client.ts` — `create_whatsapp_client`: 52 lines — Factory pattern, not logic-heavy; acceptable
- **Risk Level:** 🟢 LOW — All exceptions are justified or structured appropriately

### 7. Excessive Nesting (4 Levels → Violates 2-Level Limit)
- **Status:** ✅ FIXED
- **What was done:**
  1. ✅ Extracted `try_parse_webhook_body()` (lines 28-37) — JSON parsing
  2. ✅ Extracted `try_handle_whatsapp_messages()` (lines 39-48) — try-catch wrapper
  3. ✅ Extracted `whatsapp_messages_handler()` (lines 132-153) — message processing loop
  4. ✅ POST handler now uses functional pipeline (flatMap → filter → call)
- **Current nesting:** Max 2 levels throughout (complies with limit)
- **Verification:** No nesting exceeds 2 levels; code flows linearly with clear abstractions

---

## 🟠 High-Priority Concerns

### Missing Monitoring Endpoint Authentication
- **Locations:** `src/metrics/routes.ts:86-162` (/health, /status, /metrics)
- **Issue:** No authentication; exposes memory usage, error messages, request paths
- **Fix:** Gate behind `internal_api_key` middleware (consistent with REST API auth)
- **Effort:** ~10 minutes

### Missing Input Validation for Edge Cases
- **Issue:** `notes` field has no length limit (passed from LLM directly to database)
- **Fix:** Cap notes to 500 characters in `handle_create_booking()`; add SQLite CHECK constraint
- **Effort:** ~5 minutes

### Missing `cancel_reservation` Ownership Check
- **Location:** `src/db/queries.ts` (not yet reviewed when unimplemented)
- **Issue:** `cancel_reservation` takes only `reservation_id`; missing `user_id` ownership check
- **Fix:** Add `AND user_id = ?` clause before implementing `handle_cancel_booking`
- **Effort:** ~5 minutes

### Full Transcription Text Logged with PII
- **Location:** `src/reservations/service.ts:12`
- **Issue:** Logs phone number + transcription text at INFO level
- **Fix:** Remove `text` field from log; use hash or last-4-digits of phone if correlation needed
- **Effort:** ~5 minutes

---

## 📋 Medium-Priority Improvements

### Code Duplication
1. **Domain validation guard** — Repeated in `handle_check_availability()` and `handle_create_booking()`
   - Fix: Extract `const INVALID_DOMAIN_ERROR = (domain: string) => "Invalid domain..."`
   - Effort: ~3 minutes

2. **Party-size validation** — Repeated in two handlers
   - Fix: Extract `const INVALID_PARTY_SIZE_ERROR = "Party size must be..."`
   - Effort: ~2 minutes

### Dead Code
- **`src/parser/intent.ts`** — Legacy intent parser; unused (replaced by Claude Opus agent)
- **`src/agent/queries.ts`** — ✅ REMOVED (duplicate `get_slot_by_id` — fixed in critical #5)
- Decision: Mark for removal after confirming no production imports

### Parameter Order Violations (Style)
- **`src/channels/whatsapp/media.ts`** — Argument order: client before media_id (should be reversed)
- **`src/channels/telegram/media.ts`** — Argument order: api before file_id (should be reversed)
- **Fix:** Reorder parameters + update call sites (2 files, ~5 minutes)

### Missing Separator Comments
- Missing `//  --` separators in:
  - `src/agent/agent.ts` (between helpers and exported run_agent)
  - `src/agent/session.ts` (between get_session and update_session)
  - `src/agent/tool_handlers.ts` (between each handler)
  - `src/shared/logger.ts` (between private log and exported logger object)
  - `src/voice/transcribe.ts` (between exported transcribe_audio and private helpers)
- **Fix:** Add missing separators (standardization; ~10 minutes)

### Incorrect Separator Style
- `src/metrics/registry.ts` and `src/metrics/routes.ts` use `// ----` instead of `//  --`
- **Fix:** Replace with correct style (~5 minutes)

---

## ✅ Positive Security Controls (Verified)

- ✅ All SQL queries use parameterized placeholders (no string interpolation)
- ✅ API credentials loaded exclusively from environment (no hardcoded secrets)
- ✅ WhatsApp verification endpoint correctly validates token
- ✅ Error messages to users are generic (no internal details exposed)
- ✅ SQLite schema uses CHECK constraints for defense-in-depth
- ✅ Agent loop capped at 10 tool calls (prevents infinite loops)
- ✅ Telegram uses long-polling (no public webhook to protect)
- ✅ Foreign keys enabled; WAL mode configured

---

## 📊 Recommendations by Priority

### 🔴 Priority 1 — Security & Data Integrity (This Week)
1. Implement WhatsApp HMAC-SHA256 verification (20min)
2. Add session TTL eviction + max history cap (15min)
3. Wrap booking creation in SQLite transaction (10min)
4. Fix `last_insert_rowid()` timing (5min)

**Estimated effort:** ~50 minutes

### 🟠 Priority 2 — Code Quality & Stability (Next Week)
5. Delete `src/agent/queries.ts` (5min)
6. Extract oversized functions (30min)
7. Fix 4-level nesting in webhook.ts (15min)
8. Add missing ownership checks to cancel_reservation (5min)

**Estimated effort:** ~55 minutes

### 🟡 Priority 3 — Operations & Monitoring (Backlog)
9. Gate /health, /status, /metrics behind auth (10min)
10. Add input validation (notes length, party_size bounds) (10min)
11. Remove PII from logs (5min)
12. Fix parameter order violations (5min)
13. Standardize separator comments (15min)

**Estimated effort:** ~45 minutes

### 🔴 Priority 1b — Security Issues Found During HMAC Implementation Review (Urgent)

**HIGH-PRIORITY:**
14. No request body size limit on WhatsApp webhook POST
   - **Location:** `src/channels/whatsapp/webhook.ts:38-44`
   - **Issue:** Attacker can send arbitrarily large bodies (e.g., 500MB) to exhaust memory before signature verification
   - **Fix:** Add `Content-Length` header check or configure `maxRequestBodySize` middleware before webhook route; cap at 1-5MB
   - **Effort:** ~10 minutes

15. Message handler is fire-and-forget with no rate limiting
   - **Location:** `src/channels/whatsapp/webhook.ts:66, 117-137`
   - **Issue:** A valid signed payload containing thousands of message objects spawns unlimited concurrent handlers; POST returns 200 before processing completes; errors silently swallowed
   - **Fix:** Process messages with bounded concurrency (`for...of` with `await` instead of `forEach(async)`) and add per-sender rate limiting
   - **Effort:** ~15 minutes

**Estimated effort:** ~25 minutes

### 🟡 Priority 2b — Additional Security Issues from HMAC Review (Medium-Term)

16. Invalid hex characters in signature header cause uncaught exception
   - **Location:** `src/channels/whatsapp/webhook.ts:111-112`
   - **Issue:** `Buffer.from(received_hex, "hex")` silently truncates non-hex characters; mismatched buffer lengths cause `timingSafeEqual` to throw `RangeError`
   - **Fix:** Validate `received_hex` matches `/^[0-9a-f]{64}$/i` before conversion; reject invalid signatures early
   - **Effort:** ~5 minutes

17. Unnecessary hex-to-buffer round-trip in HMAC computation
   - **Location:** `src/channels/whatsapp/webhook.ts:105-112`
   - **Issue:** Converting to hex string and back to buffer adds allocation and timing surface; should compare raw bytes directly
   - **Fix:** Use `hasher.digest()` (returns `Uint8Array`) instead of `hasher.digest("hex")`, compare binary buffers directly
   - **Effort:** ~5 minutes

18. Verify token comparison not timing-safe
   - **Location:** `src/channels/whatsapp/webhook.ts:84`
   - **Issue:** `verify_token` uses `===` instead of `timingSafeEqual`; inconsistent with HMAC verification approach (low practical risk, but breaks precedent)
   - **Fix:** Apply `timingSafeEqual` to token comparison for consistency
   - **Effort:** ~5 minutes

19. Risk of accidental secret exposure via config object logging
   - **Location:** `src/config/args.ts:79` (anywhere configs is logged)
   - **Issue:** If future code logs `configs` as a whole (e.g., `logger.info("startup", { configs })`), all secrets are exposed
   - **Fix:** Document that configs object must never be passed to logging/serialization; consider overriding `toJSON()` to redact secrets
   - **Effort:** ~5 minutes

**Estimated effort:** ~20 minutes

---

## Verification Commands

After fixing, run:
```bash
make lint       # Biome checks
make ci_test    # Full test suite
make check      # Both together
```

---

## Files Summary

**Reviewed:** 31 files
**Critical Issues:** 7
**High-Priority:** 4
**Medium-Priority:** 8

**Most Critical Files:**
- `src/channels/whatsapp/webhook.ts` — Security + nesting violations
- `src/agent/session.ts` — DoS vulnerability
- `src/db/queries.ts` — Race condition + fragility
- `src/agent/tool_handlers.ts` — Function size + race condition consumer

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Agent Findings

  code-reviewer

  Solution Assessment

  The codebase implements a reservation system accepting messages via WhatsApp/Telegram, transcribing voice via OpenAI, and routing through a Claude Opus tool_use agent loop. Architecture is clean: agent loop correctly implements multi-turn
  tool_use pattern, channel adapters follow unified interface, reservation service is well-structured, SQLite queries are parameterized and safe from injection, session management and metrics functional. Code generally well-implemented and
  follows project conventions.

  Issues Found

  MAJOR: create_reservation uses last_insert_rowid() incorrectly — src/db/queries.ts:89-95
  - Function INSERTs reservation, then UPDATEs time_slots, then calls SELECT last_insert_rowid(). Since the UPDATE is not an INSERT, it should not change last_insert_rowid(), but this is fragile. If logic is ever modified to include another
  INSERT between lines 85-89, or if a trigger on time_slots performs an INSERT, the wrong ID is returned.
  - Fix: Capture last_insert_rowid() immediately after the INSERT, before the UPDATE.

  MAJOR: Race condition in create_reservation — src/db/queries.ts:76-100
  - handle_create_booking checks slot capacity in tool_handlers, then calls create_reservation which updates booked. Between check and update, another concurrent request could book the same slot, causing overbooking. Single transaction
  wrapping capacity check + insert + update would be safer. The entire sequence from get_slot_by_id through create_reservation is not atomic.

  MAJOR: Session memory grows unboundedly — src/agent/session.ts
  - Session store has last_active field suggesting TTL intent, but no cleanup mechanism exists. Over time, sessions Map accumulates every unique sender indefinitely. Full conversation history in MessageParam[] grows large (multiple entries per
   tool round-trip) with no length limit. Will eventually cause memory pressure.

  MAJOR: tool_handlers.ts imports get_slot_by_id from two modules — src/agent/tool_handlers.ts:1-2
  - Namespace import import * as queries and named import import { get_slot_by_id } both used. More critically, src/agent/queries.ts has duplicate get_slot_by_id definition. Tool handlers import from src/db/queries, making src/agent/queries.ts
   unused/dead code.

  MINOR: parse_intent is dead code — src/parser/intent.ts
  - CLAUDE.md marks parser as "legacy, being replaced" by agent. reservations/service.ts calls run_agent directly, never invokes parse_intent. Parser module (intent.ts, prompts.ts, types.ts) unused in production.

  MINOR: No text/voice_buffer validation for unsupported message types — src/channels/whatsapp/webhook.ts:54-67
  - If message type is neither "text" nor "audio" (e.g., "image"), incoming object created with neither field set. Handler returns generic help message (fine), but calls send_text_message for every type.

  MINOR: call_api type guard redundant — src/agent/agent.ts:43-46
  - Check "content" in response && "stop_reason" in response unnecessary because client.messages.create() always returns Message type. Type assertion also redundant. Dead branches added.

  MINOR: handle_list_bookings missing slot date/time — src/agent/tool_handlers.ts:120-143
  - Returns reservation data but does not include date/time of reserved slot. Agent model needs this to provide useful listing. Response missing date and time fields.

  MINOR: Duplicated import in tool_handlers.ts — src/agent/tool_handlers.ts:1-2
  - get_slot_by_id imported both as namespace (import * as queries) and named import. Redundant and confusing.

  MINOR: Model selection hardcoded — src/agent/agent.ts:30
  - Model hardcoded to claude-opus-4-5. Should be configurable or documented as a constant that needs updating.

  Standards Compliance

  ✅ Naming conventions: All identifiers snake_case. Types snake_case_type. Constants CONSTANT_CASE. Fully compliant.
  ✅ Arrow functions only: No function keyword found. Compliant.
  ✅ No semicolons: Consistent throughout. Compliant.
  ✅ No .env files: CLI/environment config via config/env.ts. Compliant.
  ✅ No ORM: Raw parameterized SQL via bun:sqlite. Compliant.
  ✅ //  -- separators: Correctly used in multiple files. Compliant.
  ✅ File length: All under 200 lines. Longest is tool_handlers.ts at 165 lines. Compliant.
  ⚠️  Function parameter count: create_reservation takes 5 parameters (exceeds 4-parameter limit). No comment explaining deviation.
  ✅ Test co-location: Tests co-located with source. Mock preloads in bunfig.toml. Compliant.
  ✅ Comments explain WHY: Appropriate rationale comments throughout. Compliant.

  Recommendations

  1. Make create_reservation atomic: Wrap capacity check, INSERT, and UPDATE in db.transaction() to eliminate race condition.
  2. Implement session TTL eviction: Add periodic cleanup (e.g., setInterval) removing sessions >30min old. Cap conversation history length per session.
  3. Remove dead code: Delete src/agent/queries.ts (duplicate get_slot_by_id); consider removing legacy parser module if unused in production.
  4. Include slot date/time in handle_list_bookings: Join against time_slots or lookup to include date and time.
  5. Fix duplicated import: Use either namespace or named import consistently, not both.
  6. Add comment to create_reservation explaining 5-parameter deviation.
  7. Add tests for session.ts, service.ts, and WhatsApp webhook edge cases.

  Verification Commands

  make lint
  make test
  make format

  ---
  code-simplifier

  Code Simplification Analysis

  Codebase is intentionally compact with limited duplication. 5 meaningful simplification opportunities across 3 priority levels. Estimated reducible lines: 25-35. Most findings low-to-medium priority. Conventions followed consistently.

  High Priority Refactorings

  1. Duplicated get_slot_by_id — two modules
  - Location: src/db/queries.ts:130-134 and src/agent/queries.ts:4-8
  - Issue: Identical function, identical SQL. Any schema change requires updating two locations. src/agent/queries.ts exists solely to re-expose get_slot_by_id already exported from src/db/queries.ts. tool_handlers.ts imports from
  src/db/queries directly (line 2), making src/agent/queries.ts redundant.
  - Fix: Delete src/agent/queries.ts. Move get_reservation_by_id (currently unused) into src/db/queries.ts alongside other reservation queries.
  - Benefit: Single source of truth for DB queries. Eliminates redundant file. No import changes needed.
  - Effort: 10 minutes.

  Medium Priority Refactorings

  2. Duplicated domain validation in tool_handlers.ts
  - Location: Lines 21-26 and 70-75 (identical guard, identical error message)
  - Issue: VALID_DOMAINS guard block copy-pasted. If error message wording changes, must update two places.
  - Fix: Extract error string to named constant:
  const INVALID_DOMAIN_ERROR = (domain: string): string =>
    `Invalid domain "${domain}". Must be one of: restaurant, doctor, salon.`
  - Then both guards become: if (!VALID_DOMAINS.includes(domain)) { return { ok: false, error: INVALID_DOMAIN_ERROR(domain) } }
  - Benefit: Single definition for user-facing error. Shrinks guard blocks from 4 to 1 line each.
  - Effort: 5 minutes.

  3. Duplicated party-size validation in tool_handlers.ts
  - Location: Lines 36-38 and 77-79 (identical guard and error message)
  - Issue: Party size validation guard copy-pasted across handle_check_availability and handle_create_booking.
  - Fix: Extract error string:
  const INVALID_PARTY_SIZE_ERROR = "Party size must be at least 1."
  - Then: if (party_size < 1) { return { ok: false, error: INVALID_PARTY_SIZE_ERROR } }
  - Benefit: Single definition for localisation/rephrasing in future.
  - Effort: 2 minutes (combine with item 2).

  4. Duplicated mock names across two mock files
  - Location: src/agent/mock.ts:3 and src/parser/client/mock.ts:3
  - Issue: Both export mock_anthropic_client with different signatures. Agent mock takes flexible impl callback; parser mock takes fixed response_text string. Identical naming causes confusion.
  - Fix: Rename to mock_agent_client and mock_parser_client respectively. Update call sites in test files.
  - Benefit: Removes naming ambiguity. Makes test setup self-documenting.
  - Effort: 10 minutes (rename + update test files).

  Low Priority / Monitor

  - today computation duplicated in src/agent/prompts.ts:2 and src/parser/intent.ts:7: Both use new Date().toISOString().split("T")[0]. Extract only if a third location appears.
  - reservation_row_type vs reservation_type: DB row type vs service layer type with narrowed status field. Track once handle_get_booking implemented.
  - record_request Map increment pattern in src/metrics/registry.ts:69-76: Pattern const prev = map.get(key) ?? 0; map.set(key, prev + 1) appears 3 times for different counters. Could be a helper but benefit marginal for infrastructure code
  that changes rarely. Monitor if a fourth counter added.
  - audio/ogg hardcoded in two places: telegram/media.ts:18 and whatsapp/media.ts:7. Intentional—Telegram always OGG, WhatsApp treated uniformly as OGG for transcription. No change needed unless other formats added.

  Verification Steps

  make lint
  make test
  make check

  ---
  security-reviewer

  SECURITY ANALYSIS SUMMARY

  Reviewed 30 TypeScript source files: WhatsApp/Telegram reservation chatbot on Bun, Hono, grammY, SQLite, Claude Opus agent. Accepts untrusted input from two external channels, transcribes voice via OpenAI, drives LLM tool-use loop, writes to
   SQLite.

  Overall posture: MODERATE RISK. SQL queries correctly parameterized. API credentials properly loaded from environment. Most serious issues: no WhatsApp HMAC-SHA256 signature verification, unbounded in-memory session growth, full PII exposure
   in logs, unauthenticated monitoring endpoints, TOCTOU race in booking flow unprotected by database transaction.

  CRITICAL VULNERABILITIES

  Issue: WhatsApp webhook accepts requests without HMAC-SHA256 signature verification
  - Location: src/channels/whatsapp/webhook.ts:41-79
  - Attack: Meta signs every webhook delivery with X-Hub-Signature-256: sha256=<hex>. POST handler reads c.req.json() immediately with no signature check. Attacker discovers webhook URL, forges arbitrary WhatsApp events (fake sender, fake
  content), drives full reservation flow on any user's behalf.
  - Impact: Unauthorized reservation creation/cancellation, slot inventory exhaustion, data integrity compromise.
  - Fix: Read raw bytes, compute HMAC-SHA256(app_secret, raw_body), constant-time compare against X-Hub-Signature-256 header. Add app_secret to config_type. Reject with 403 on mismatch.

  Issue: In-memory session store has no TTL eviction — unbounded memory growth / DoS
  - Location: src/agent/session.ts:3-15
  - Attack: Every unique sender_key creates a sessions Map entry. Conversation history array grows with every message. No eviction, no max history length, no max session count. Attacker sends messages from many phone numbers (trivial once
  signature verification absent) to exhaust process heap, crashing server.
  - Impact: Remote DoS causing full process crash; all active sessions lost.
  - Fix: TTL-based expiry using last_active (already stored); prune on write or via periodic setInterval. Cap history length per session (e.g., 40 messages). Example: SESSION_TTL_MS = 30*60*1000, MAX_SESSIONS = 10_000, MAX_HISTORY = 40.

  Issue: Booking creation not atomic — TOCTOU race condition
  - Location: src/agent/tool_handlers.ts:83-101 and src/db/queries.ts:76-100
  - Attack: handle_create_booking reads remaining capacity, verifies sufficiency, calls create_reservation which does separate INSERT and UPDATE. Bun single-threaded event loop allows two concurrent run_agent calls to interleave: both pass
  capacity check, both insert, overbooking results.
  - Impact: Overbooking of restaurant tables, doctor appointments, salon slots; operational/reputational damage.
  - Fix: Wrap read-check-insert-update in single SQLite transaction using db.transaction(). Atomic capacity guard prevents interleaved writes.

  HIGH-PRIORITY CONCERNS

  Issue: Full transcription text (containing PII and medical/reservation intent) logged at INFO level
  - Location: src/reservations/service.ts:12
  - Risk: logger.info("Transcribed voice note", { text, sender: message.sender_id }) logs full transcription + phone number/Telegram ID in structured JSON. If logs shipped to aggregator or stored, GDPR/HIPAA-relevant data exposure.
  - Fix: Remove text field entirely. Log only HTTP status code; use hash or last-4-digits of phone number if correlation needed.

  Issue: Unauthenticated /health, /status, /metrics endpoints expose internal operational data
  - Location: src/metrics/routes.ts:86-162
  - Risk: /health exposes memory layout (rss_bytes, heapUsed, heapTotal), SQLite error messages, per-path request counters. /metrics exposes every request path as Prometheus label. No authentication; globally reachable. Attacker gains map of
  request patterns and error rates. SQLite error message can leak schema/file-path info.
  - Fix: Gate all three endpoints behind internal_api_key middleware (consistent with planned REST API auth). Serve /metrics only on separate internal port or behind network control. Strip raw error field from /status response.

  Issue: WhatsApp media URL fetched without validating Meta-owned hostname (potential SSRF)
  - Location: src/channels/whatsapp/client.ts:48-53
  - Risk: Code fetches meta.url from Graph API response without hostname validation. If response manipulated, server fetches arbitrary URL with Authorization: Bearer <whatsapp_access_token> header, leaking token.
  - Fix: Validate meta.url begins with https:// and hostname ends in Meta-owned suffix (.facebook.com, .fbsbx.com, .whatsapp.com). Reject if mismatch.

  Issue: notes field has no length limit, passed directly from LLM output to database
  - Location: src/agent/types.ts:23, src/db/queries.ts:81, src/agent/tool_handlers.ts:68
  - Risk: notes comes from Claude Opus tool_input shaped by user language. No max length enforced anywhere. User crafts long message → agent emits long notes → disproportionate database/memory consumption.
  - Fix: Cap notes to reasonable max (e.g., 500 chars) in handle_create_booking before create_reservation. Add SQLite CHECK(length(notes) <= 500) constraint.

  Issue: cancel_booking and reschedule_booking tools advertised but not implemented — authorization gap
  - Location: src/agent/tool_handlers.ts:152-164
  - Risk: Both handlers return stub error. cancel_reservation query takes only reservation_id with no user_id ownership check. When implemented, any user who guesses a reservation ID can cancel another user's reservation.
  - Fix: Update cancel_reservation to enforce WHERE id = ? AND user_id = ? before implementing handlers. Verify ownership before decrementing slot counter.

  Issue: Telegram bot token exposed in constructed file download URL
  - Location: src/channels/telegram/media.ts:8
  - Risk: URL https://api.telegram.org/file/bot${api.token}/${file.file_path} embeds bot token in plaintext. URLs appear in access logs on proxies/CDNs. Token exposure = full bot impersonation.
  - Mitigation: Standard Telegram Bot API pattern; cannot avoid without proxying through Telegram infrastructure. Ensure Bun server not behind HTTP logging proxy recording full request URLs. Restrict log verbosity on upstream infrastructure.

  MODERATE CONCERNS

  - User-supplied text from transcription passed to agent without length validation: Cap transcription result at reasonable max (e.g., 2000 chars) before adding to history to prevent token consumption inflation.
  - by_path counter in metrics registry grows unboundedly: Attack via requests to millions of distinct paths causes Map to grow without bound. Normalise paths matching known routes or cap Map size.
  - WhatsApp error response body logs phone number: logger.error("Failed to send WhatsApp message", { to, error }) exposes PII. Log only HTTP status code and hash/last-4-digits if correlation needed.
  - build_intent_user_prompt embeds raw user text without escaping: Legacy parser wraps user text in double-quotes without escaping. User message with " followed by instruction-like text engages prompt injection. Agent loop more robust
  (discrete message role). Retire or replace legacy parser.
  - No input size limit on WhatsApp webhook JSON body: c.req.json() parses arbitrarily large bodies. Hono has no default body size limit. Add bodyLimit middleware or check Content-Length before parsing.
  - Database path taken from environment without path canonicalization validation: resolve(db_path) prevents most path traversal, but no validation that resolved path falls within expected base directory (e.g., ./data/). Misconfigured
  deployment could open /etc/passwd. Assert resolved path starts with known safe prefix.

  SECURITY BEST PRACTICES

  - All cancel_reservation and list_reservations queries should filter by user_id. Currently only cancel_reservation does not.
  - Add CSP and X-Content-Type-Options headers to Hono responses.
  - Add request-level correlation ID logging (no PII) for tracing without exposing phone numbers.
  - create_user uses INSERT OR IGNORE which silently swallows duplicates. Fallback find_user_by_phone after insert creates race window. Consolidate to INSERT OR IGNORE … RETURNING * (SQLite 3.35+).
  - Add max party_size upper bound (e.g., <= 100) in handlers. Currently party_size = 999999 always fails but could probe slot capacity values.

  POSITIVE SECURITY CONTROLS

  ✅ All SQL queries use parameterized placeholders (?) with typed parameter arrays—no string interpolation.
  ✅ API credentials (Anthropic, OpenAI, WhatsApp, Telegram, internal key) loaded exclusively from environment/CLI. No hardcoded secrets.
  ✅ get_reservation_by_id enforces AND user_id = ? tying access to authenticated owner.
  ✅ handle_check_availability validates domain against allowlist, date/time with regex before database touch.
  ✅ WhatsApp verification endpoint correctly compares verify token with ===, returns 403 on mismatch.
  ✅ Error messages to users are generic ("Something went wrong"); no internal details or stack traces exposed.
  ✅ SQLite schema uses CHECK constraints on channel, domain, status columns as database-level defence-in-depth.
  ✅ Agent capped at MAX_TOOL_CALLS = 10 per turn, preventing infinite LLM tool-call loops.
  ✅ Foreign keys enabled via PRAGMA foreign_keys = ON and WAL mode configured—correct production settings.
  ✅ Telegram uses grammY long-polling (no public webhook endpoint to protect, unlike WhatsApp).

  ---
  personal-style-reviewer

  Style Review Summary

  Full codebase review of 30 files. Generally clean and well-organised: correct naming conventions, no semicolons, consistent arrow functions. Main recurring issues: second-order function parameters (6 instances), function/method role
  confusion (functions with side effects, methods returning values), nesting violations (4 levels in webhook.ts, 3 levels in agent.ts), oversized functions (run_agent 75 lines, handle_create_booking 55 lines, render_prometheus 63 lines),
  inconsistent conceptual separator style in metrics/ files, missing separators in 5 files, parameter argument order violations in 2 media files.

  Critical Issues

  1. Nesting depth violation — src/channels/whatsapp/webhook.ts:47-76
  - Three nested for loops, then try block inside innermost = 4 levels. TypeScript max is 2.
  - Fix: Extract process_change and process_message helpers to flatten nesting.

  2. Function with side effects — src/agent/session.ts:5-11
  - get_session calls sessions.set (side effect) but also returns value. Per style rules, functions must have no side effects.
  - Fix: Split lookup and initialisation into separate pieces or rename as method that initialises only.

  3. Functions with side effects returning values — src/db/queries.ts
  - create_reservation:76-100 writes to database AND returns reservation_row_type.
  - cancel_reservation:102-120 writes to database AND returns boolean.
  - Style rule: functions no side effects + return value; methods have side effects + no return (except errors).
  - Fix: Either make void (return Error | null on failure) or obtain return value via separate pure function that reads back result.

  4. run_agent exceeds 50-line limit — src/agent/agent.ts:76-151
  - 75 lines with no justifying comment.
  - Fix: Extract handle_end_turn and handle_tool_use helpers.

  Important Issues

  5. Second-order function parameters — multiple files
  - src/agent/mock.ts:3 — impl: (...args: unknown[]) => unknown
  - src/agent/mock.ts:13-18 — map of function-valued properties
  - src/channels/telegram/bot.ts:8 — handler: message_handler_type
  - src/channels/whatsapp/webhook.ts:23 — handler: message_handler_type
  - src/metrics/middleware.ts:6 — next: Next (unavoidable Hono API exception)
  - Style: "Avoid as much as possible." handler pattern uses dependency injection but could be collapsed by importing handle_message directly, removing callback parameter.

  6. handle_create_booking exceeds 50-line limit — src/agent/tool_handlers.ts:64-118
  - 55 lines with no comment. Slot re-verification block (L81-99) can be extracted.

  7. render_prometheus exceeds 50-line limit — src/metrics/routes.ts:19-82
  - 63 lines with no comment. Group metric rendering into helpers per family (render_uptime_metric, render_request_metrics, render_latency_histogram).

  8. Parameter argument order violation — src/channels/whatsapp/media.ts:3-5
  export const download_voice_note = async (
    client: whatsapp_client_type,  // project type — LAST
    media_id: string,              // basic type — FIRST
  )
  - Correct: media_id before client.

  9. Parameter argument order violation — src/channels/telegram/media.ts:3-5
  export const download_voice_note = async (
    api: Api,           // third-party type — after basic
    file_id: string,    // basic type — FIRST
  )
  - Correct: file_id before api.

  10. Nesting depth approaching limit — src/agent/agent.ts:109-141
  - Inside run_agent: while → if (tool_use) → .map callback → if (result.ok) = 3 levels. Max is 2. Extract build_tool_result(user_id, sender_key, tool_block) helper.

  11. Wrong separator style — src/metrics/registry.ts and src/metrics/routes.ts
  - Required: //  -- (two spaces before dash)
  - Used: // ---- (four dashes, single space)
  - Violations: L34, L52, L59 in registry.ts; L5, L84 in routes.ts.

  12. Missing //  -- separators
  - src/agent/agent.ts — between private (call_api, dispatch_tool) and exported run_agent
  - src/agent/session.ts — between get_session and update_session
  - src/agent/tool_handlers.ts — between each of six handler functions
  - src/shared/logger.ts — between private log and exported logger object
  - src/voice/transcribe.ts — between exported transcribe_audio and private extension_from_mime

  Minor Issues

  13. "What" comments instead of "Why" — src/metrics/routes.ts
  - Lines 27, 33, 40, 47, 56, 65 describe what next block does, not why.
  - Fix: Replace with //  -- separators or remove entirely. If comment kept, explain reasoning.

  14. "What" comment — src/agent/agent.ts:42
  - "Type-guard: response should be Message (not Stream) since we don't set stream: true"
  - Trim to why only: "the SDK returns a Stream union type even without stream: true"

  15. get_slot_by_id duplicated — src/agent/queries.ts:4-8
  - Duplicates function from src/db/queries.ts:130-134. Only 5 lines (within tolerance) but tool_handlers.ts already imports original directly. src/agent/queries.ts also exports get_reservation_by_id (unused). Confirm if file can be deleted.

  16. required inner function has side effects and returns value — src/config/env.ts:36-43
  - Pushes to outer missing array (side effect) and returns string. Same violation as issues #2–3. Less critical since local helper, but still breaks function/method rule.

  17. metrics_middleware comment explains "what" — src/metrics/middleware.ts:4-5
  - "Hono middleware that records HTTP request metrics for every request" — describes what. Remove first sentence; keep "Mount this before all routes so every handled request is counted" — that is valid "why/when" guidance.

  18. Top-level side-effect calls at module load — src/agent/mock.ts:36-42
  - mock_anthropic_client(...) and mock_db_queries({}) execute at import time as default mock configuration. Intentional (preload pattern for Bun tests), but no comment explaining why defaults established at load time rather than in individual
   test files.

  Positive Observations

  ✅ Naming conventions perfectly consistent across all 30 files: snake_case for variables/functions/type properties; PascalCase for types; CONSTANT_CASE for constants.
  ✅ No semicolons anywhere. Perfectly enforced.
  ✅ Arrow functions only — not a single function keyword found.
  ✅ File lengths well controlled — no file exceeds 200 lines. Longest is tool_handlers.ts at 165 lines.
  ✅ //  -- separator correctly used in telegram/bot.ts:57, whatsapp/client.ts:63, webhook.ts:84, config/env.ts:64, db/client.ts:23, index.ts:19/26, metrics/routes.ts:160. Pattern clearly understood.
  ✅ Parameter counts respected — no function or method exceeds 4 parameters.
  ✅ Error handling in Go-style — errors caught and returned/logged without swallowing.
  ✅ No generics in user code — avoided entirely in project types/functions; used only for SDK types from third-party libraries.

  Recommendations

  1. Priority 1: Fix nesting in webhook.ts — extract process_change and process_message helpers.
  2. Priority 2: Fix run_agent length/nesting — extract build_tool_result and handle_tool_use_response helpers.
  3. Priority 3: Address function/method confusion — split get_session, create_reservation, cancel_reservation, required into pure lookup + separate mutating pieces.
  4. Priority 4: Fix parameter order in whatsapp/media.ts and telegram/media.ts (one-line changes per file; update call sites).
  5. Priority 5: Standardise separators — replace // ---- with //  -- in metrics/ and add missing separators in agent.ts, session.ts, tool_handlers.ts, logger.ts, transcribe.ts.
  6. Priority 6: Reduce second-order parameters — eliminate handler: message_handler_type pattern in bot.ts/webhook.ts by importing handle_message directly.
  7. Priority 7: Fix render_prometheus length — introduce per-family rendering helpers.
  8. Confirm src/agent/queries.ts status — duplicate get_slot_by_id and unused get_reservation_by_id. If unused, delete file.

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Top Recommendations (Synthesized)

  1. Fix critical security vulnerabilities immediately:
  - Implement WhatsApp HMAC-SHA256 signature verification (blocks unauthorized reservation forging)
  - Add session TTL eviction and max history length (prevents DoS memory exhaustion)
  - Wrap booking creation in SQLite transaction (eliminates overbooking race condition)

  2. Address critical code quality issues:
  - Extract webhook.ts nested loops into process_change/process_message helpers (fixes 4-level nesting violation)
  - Split run_agent into smaller helpers; bring under 50 lines (currently 75)
  - Eliminate duplicate get_slot_by_id definition; delete src/agent/queries.ts

  3. Fix function/method role confusion:
  - Split get_session, create_reservation, cancel_reservation into pure functions + separate mutating operations
  - Align with style rule: functions (no side effects) vs methods (side effects, no returns)

  4. Secure monitoring endpoints:
  - Gate /health, /status, /metrics behind internal_api_key middleware
  - Remove sensitive data from responses (memory details, error messages, request paths)

  5. Eliminate medium-priority duplication:
  - Extract domain validation error message constant (appears 2x)
  - Extract party-size validation error message constant (appears 2x)
  - Rename mock_anthropic_client → mock_agent_client and mock_parser_client for clarity

  6. Fix parameter order violations:
  - whatsapp/media.ts: media_id before client
  - telegram/media.ts: file_id before api

  7. Standardise code formatting:
  - Replace // ---- with //  -- in metrics files
  - Add missing //  -- separators in agent.ts, session.ts, tool_handlers.ts, logger.ts, transcribe.ts

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
