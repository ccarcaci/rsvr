# WhatsApp Business Cloud API -- Implementation Recap

> Generated: 2026-03-08
> Scope: Mapping between the official WhatsApp Business Cloud API documentation and the rsvr codebase implementation.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Configuration and Authentication](#2-configuration-and-authentication)
3. [Webhook Verification (GET)](#3-webhook-verification-get)
4. [Webhook Message Reception (POST)](#4-webhook-message-reception-post)
5. [Sending Messages](#5-sending-messages)
6. [Media Download (Voice Notes)](#6-media-download-voice-notes)
7. [End-to-End Message Flow](#7-end-to-end-message-flow)
8. [Gaps and Deviations](#8-gaps-and-deviations)
9. [Official Documentation Links](#9-official-documentation-links)

---

## 1. Architecture Overview

```mermaid
flowchart LR
    WA[WhatsApp Cloud API]

    subgraph rsvr["rsvr Server (Hono, Bun)"]
        direction TB
        WEBHOOK["/webhook/whatsapp<br>webhook.ts"]
        SERVICE["service.ts"]
        AGENT["agent"]
        CLIENT["client.ts"]
        MEDIA["media.ts"]
        TRANSCRIBE["transcribe.ts<br>(OpenAI STT)"]
    end

    GRAPH["graph.facebook.com"]
    LOOKASIDE["lookaside.fbsbx.com"]

    WA -- "GET (verify challenge)" --> WEBHOOK
    WEBHOOK -- "200 + challenge" --> WA

    WA -- "POST (messages)" --> WEBHOOK
    WEBHOOK -- "parse & route" --> SERVICE

    SERVICE -- "text or transcribed text" --> AGENT
    AGENT -- "reply" --> SERVICE

    SERVICE -- "send reply" --> CLIENT
    CLIENT -- "POST /{PHONE_ID}/messages" --> GRAPH
    GRAPH -- "delivery" --> WA

    WEBHOOK -- "audio message" --> MEDIA
    MEDIA -- "Step 1: GET /{MEDIA_ID}" --> GRAPH
    GRAPH -- "media URL" --> MEDIA
    MEDIA -- "Step 2: GET binary" --> LOOKASIDE
    LOOKASIDE -- "audio binary" --> MEDIA
    MEDIA -- "Uint8Array" --> SERVICE
    SERVICE -- "transcribe" --> TRANSCRIBE
    TRANSCRIBE -- "text" --> SERVICE
```

**Files involved:**

| File                                        | Role                                        |
|---------------------------------------------|---------------------------------------------|
| `src/channels/whatsapp/webhook.ts`          | Hono routes: GET verification, POST handler |
| `src/channels/whatsapp/client.ts`           | Graph API client: send messages, get media  |
| `src/channels/whatsapp/media.ts`            | Voice note download helper                  |
| `src/channels/types.ts`                     | Shared `incoming_message_type` interface     |
| `src/config/env.ts`                         | WhatsApp env var loading and validation      |
| `src/reservations/service.ts`               | Message orchestrator (text/voice routing)    |
| `src/voice/transcribe.ts`                   | OpenAI audio transcription                   |

---

## 2. Configuration and Authentication

### Official API Requirements

The WhatsApp Cloud API requires:
- **Access Token**: A permanent System User token or a temporary token from the Meta App Dashboard. Passed as `Authorization: Bearer <TOKEN>` on every Graph API request.
- **Phone Number ID**: Identifies which WhatsApp business phone number to send from. Used in the URL path: `/{PHONE_NUMBER_ID}/messages`.
- **Verify Token**: An arbitrary string you define, used during webhook registration to prove endpoint ownership.
- **App Secret**: Used to validate `X-Hub-Signature-256` on incoming webhook POSTs (HMAC-SHA256 of the payload body).

### Current Implementation

**File:** `src/config/env.ts` (lines 1-66)

| Config Key                   | Env Var                    | Usage                                  |
|------------------------------|----------------------------|----------------------------------------|
| `whatsapp_verify_token`      | `WHATSAPP_VERIFY_TOKEN`    | Webhook GET verification               |
| `whatsapp_access_token`      | `WHATSAPP_ACCESS_TOKEN`    | Bearer token for all Graph API calls   |
| `whatsapp_phone_number_id`   | `WHATSAPP_PHONE_NUMBER_ID` | URL path segment for send/media APIs   |

All three are required at startup (line 48-50). Missing values cause a hard error.

**Gap:** There is no `WHATSAPP_APP_SECRET` configuration. This means `X-Hub-Signature-256` validation is not implemented. See [Section 8](#8-gaps-and-deviations).

---

## 3. Webhook Verification (GET)

### Official Spec

When you register a webhook URL in the Meta App Dashboard, Meta sends a GET request with three query parameters:

| Parameter           | Description                                    |
|---------------------|------------------------------------------------|
| `hub.mode`          | Always `"subscribe"`                           |
| `hub.verify_token`  | The string you configured in the App Dashboard |
| `hub.challenge`     | An integer you must echo back as the response  |

**Expected behavior:**
1. Verify `hub.mode === "subscribe"`
2. Verify `hub.verify_token` matches your configured token
3. Respond with HTTP 200 and the `hub.challenge` value as the response body (plain text)
4. If verification fails, respond with a non-200 status

### Current Implementation

**File:** `src/channels/whatsapp/webhook.ts` (lines 30-34, 63-74)

```
GET /webhook/whatsapp
```

The `whatsapp_verify_challenge` function (line 63) does:
1. Checks `mode === "subscribe"` -- **matches spec**
2. Checks `token === configs.whatsapp_verify_token` -- **matches spec**
3. Returns `c.text(challenge ?? "", 200)` on success -- **matches spec** (plain text, HTTP 200)
4. Returns `c.text("Forbidden", 403)` on failure -- **matches spec** (non-200)

**Alignment: FULL.** The verification implementation correctly follows the official specification.

---

## 4. Webhook Message Reception (POST)

### Official Spec -- Payload Structure

Meta sends POST requests to the webhook URL with this JSON structure:

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "16505551111",
              "phone_number_id": "123456789"
            },
            "contacts": [
              {
                "profile": { "name": "Sender Name" },
                "wa_id": "16315551181"
              }
            ],
            "messages": [
              {
                "from": "16315551181",
                "id": "wamid.ABGGFlA5Fpa",
                "timestamp": "1504902988",
                "type": "text",
                "text": { "body": "Hello!" }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

For audio/voice messages, the `messages` array contains:

```json
{
  "from": "16315551181",
  "id": "wamid.HBg...",
  "timestamp": "1754849070",
  "type": "audio",
  "audio": {
    "mime_type": "audio/ogg; codecs=opus",
    "sha256": "AxdsE50BYZP5xkoQ2osP3eLq3oejVjNLlu+Kd30NVC8=",
    "id": "2914625362044713",
    "voice": true
  }
}
```

**Official requirements for the POST handler:**
- Respond with HTTP 200 quickly (within a few seconds)
- Process messages asynchronously if needed
- Handle batched entries (multiple entries/changes/messages)
- Validate `X-Hub-Signature-256` header using the app secret
- Be idempotent (Meta retries failed deliveries for up to 7 days)

### Current Implementation

**File:** `src/channels/whatsapp/webhook.ts` (lines 37-56, 76-96)

**Type definitions** (lines 9-25):

```typescript
type whatsapp_webhook_entry_type = {
  changes: {
    value: {
      messages?: whatsapp_message_type[]
      contacts?: whatsapp_contact_type[]
    }
  }[]
}

type whatsapp_message_type = {
  from: string
  type: string
  text?: { body: string }
  audio?: { id: string; mime_type: string }
}

type whatsapp_contact_type = { profile: { name: string } }
```

**POST handler** (lines 37-56):
1. Parses `body.entry` as the entries array
2. If no entries, returns `{ status: "ok" }` immediately
3. Flattens `entries -> changes -> value`, filtering for those with `messages`
4. Extracts contact name from the first value's contacts array
5. Flattens all messages across values
6. Calls `whatsapp_messages_handler` in a try/catch
7. Always returns `{ status: "ok" }` (HTTP 200)

**Message handler** (lines 76-96):
- Iterates messages with `forEach` and an async callback
- For `type === "text"`: extracts `msg.text.body`
- For `type === "audio"`: downloads voice note via `download_voice_note`
- Calls `handle_message` (reservation service) and sends the reply

### Alignment Analysis

| Aspect                           | Official Spec                                      | Implementation                               | Status    |
|----------------------------------|---------------------------------------------------|----------------------------------------------|-----------|
| Respond with HTTP 200            | Must return 200 quickly                           | Always returns `{ status: "ok" }` (200)      | ALIGNED   |
| Parse entry/changes/value        | Nested structure with arrays                      | Correctly flattened (lines 43-48)             | ALIGNED   |
| Text message extraction          | `messages[].text.body`                            | `msg.text.body` (line 86)                     | ALIGNED   |
| Audio message extraction         | `messages[].audio.id` + `audio.mime_type`         | `msg.audio.id` used (line 88)                | ALIGNED   |
| Contact name extraction          | `contacts[].profile.name`                         | `contacts?.[0]?.profile.name` (line 47)       | ALIGNED   |
| `X-Hub-Signature-256` validation | HMAC-SHA256 with app secret                       | **NOT IMPLEMENTED**                          | GAP       |
| `metadata` field                 | Contains `phone_number_id`, `display_phone_number`| **Not typed or used**                        | GAP       |
| `object` field check             | Should be `"whatsapp_business_account"`           | **Not checked**                              | GAP       |
| Message `id` field               | Unique message ID (for idempotency)               | **Not extracted or used**                    | GAP       |
| Message `timestamp` field        | Unix timestamp of message                         | **Not extracted or used**                    | GAP       |
| Audio `sha256` field             | Hash for integrity verification                   | **Not used**                                 | GAP       |
| Audio `voice` boolean            | Distinguishes voice notes from audio files        | **Not checked**                              | MINOR GAP |
| Status notifications             | Sent/delivered/read status updates                | **Not handled** (filtered out by messages check)| GAP   |
| Async processing                 | Process asynchronously, respond fast              | `forEach` with async but no `await`          | PARTIAL   |

---

## 5. Sending Messages

### Official Spec

**Endpoint:**
```
POST https://graph.facebook.com/v{API_VERSION}/{PHONE_NUMBER_ID}/messages
```

**Headers:**
```
Authorization: Bearer {ACCESS_TOKEN}
Content-Type: application/json
```

**Request body (text message):**
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "PHONE_NUMBER",
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "Message content"
  }
}
```

**Success response:**
```json
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "16505555555", "wa_id": "16505555555" }],
  "messages": [{ "id": "wamid.HBgLMTY1MDUwNzY1MjA..." }]
}
```

Note: A successful API response only means Meta accepted the request. It does not confirm delivery. Delivery status arrives via webhook status notifications.

### Current Implementation

**File:** `src/channels/whatsapp/client.ts` (lines 4, 15-36)

**API version:** `v21.0` (line 4: `GRAPH_API_BASE = "https://graph.facebook.com/v21.0"`)

**`send_text_message` function** (lines 15-36):
```typescript
const url = `${GRAPH_API_BASE}/${whatsapp_phone_number_id}/messages`
// POST with:
{
  messaging_product: "whatsapp",
  to,
  type: "text",
  text: { body: text },
}
```

### Alignment Analysis

| Aspect                    | Official Spec                          | Implementation                                | Status    |
|---------------------------|----------------------------------------|-----------------------------------------------|-----------|
| Endpoint URL              | `graph.facebook.com/v{VER}/{ID}/messages` | `graph.facebook.com/v21.0/{ID}/messages`   | ALIGNED   |
| Auth header               | `Bearer {TOKEN}`                       | `Bearer ${whatsapp_access_token}` (line 20)   | ALIGNED   |
| Content-Type              | `application/json`                     | Set explicitly (line 21)                       | ALIGNED   |
| `messaging_product`       | Required, must be `"whatsapp"`         | Included (line 23)                             | ALIGNED   |
| `recipient_type`          | Optional, defaults to `"individual"`   | **Not included** (acceptable, uses default)    | OK        |
| `to` field                | Recipient phone number                 | Included                                       | ALIGNED   |
| `type` field              | Message type identifier                | `"text"` (line 25)                             | ALIGNED   |
| `text.body`               | Message text content                   | Included (line 26)                             | ALIGNED   |
| `text.preview_url`        | Optional, enables link previews        | **Not included** (defaults to false)           | OK        |
| Error handling             | Check HTTP status, parse error JSON   | Checks `response.ok`, logs error text (line 31)| PARTIAL   |
| Response parsing           | Contains message ID for tracking      | **Response body not parsed or used**           | GAP       |

---

## 6. Media Download (Voice Notes)

### Official Spec -- Two-Step Process

**Step 1: Retrieve media metadata**
```
GET https://graph.facebook.com/v{API_VERSION}/{MEDIA_ID}
Authorization: Bearer {ACCESS_TOKEN}
```

Response:
```json
{
  "url": "https://lookaside.fbsbx.com/...",
  "mime_type": "audio/ogg; codecs=opus",
  "sha256": "...",
  "file_size": 12345,
  "id": "MEDIA_ID"
}
```

The `url` field expires after approximately 5 minutes.

**Step 2: Download binary**
```
GET {url from step 1}
Authorization: Bearer {ACCESS_TOKEN}
```

Returns raw binary data of the media file.

### Current Implementation

**File:** `src/channels/whatsapp/client.ts` (lines 38-58)

**`download_media` function:**
1. Step 1 (line 39): `GET ${GRAPH_API_BASE}/${media_id}` with Bearer token -- **matches spec**
2. Parses response as `{ url: string }` (line 48) -- **matches spec** (only extracts `url`, ignores `mime_type`, `sha256`, `file_size`)
3. Step 2 (line 49): `GET meta.url` with Bearer token -- **matches spec**
4. Returns `Uint8Array` of the binary -- **matches spec**

**File:** `src/channels/whatsapp/media.ts` (lines 1-9)

The `download_voice_note` function wraps `download_media` and hardcodes the MIME type to `"audio/ogg"`.

### Alignment Analysis

| Aspect                        | Official Spec                                 | Implementation                            | Status    |
|-------------------------------|----------------------------------------------|-------------------------------------------|-----------|
| Step 1: GET media metadata    | `GET /v{VER}/{MEDIA_ID}` with Bearer token   | Correct (line 39)                         | ALIGNED   |
| Step 1: Parse URL from JSON   | Response has `url` field                      | Parsed as `{ url: string }` (line 48)     | ALIGNED   |
| Step 2: GET binary from URL   | `GET {url}` with Bearer token                | Correct (lines 49-51)                     | ALIGNED   |
| Step 2: Return binary         | Raw binary response                           | Returns `Uint8Array` (line 57)            | ALIGNED   |
| MIME type from metadata       | Available in step 1 response `mime_type`      | **Ignored; hardcoded to `"audio/ogg"`**   | GAP       |
| `sha256` integrity check      | Available for verification                    | **Not used**                              | GAP       |
| URL expiry handling           | URL expires in ~5 minutes                     | Downloaded immediately (no caching)       | OK        |

---

## 7. End-to-End Message Flow

### Incoming Text Message

```mermaid
sequenceDiagram
    participant WA as WhatsApp Cloud API
    participant WH as webhook.ts
    participant SVC as service.ts
    participant DB as SQLite
    participant AGT as agent
    participant CLI as client.ts
    participant GRAPH as graph.facebook.com

    WA->>WH: POST /webhook/whatsapp (JSON payload)
    WH->>WH: Parse entry/changes/value/messages
    WH->>WH: Extract contact name, message text
    WH->>SVC: handle_message({ channel: "whatsapp", sender_id, text })
    SVC->>DB: Create/get user
    DB-->>SVC: user record
    SVC->>AGT: Run agent with text
    AGT-->>SVC: Reply text
    SVC->>CLI: send_text_message(sender_id, reply)
    CLI->>GRAPH: POST /v21.0/{PHONE_ID}/messages
    GRAPH-->>WA: Deliver reply to user
```

### Incoming Voice Note

```mermaid
sequenceDiagram
    participant WA as WhatsApp Cloud API
    participant WH as webhook.ts
    participant MEDIA as media.ts
    participant CLI as client.ts
    participant GRAPH as graph.facebook.com
    participant LOOK as lookaside.fbsbx.com
    participant SVC as service.ts
    participant STT as transcribe.ts (OpenAI)
    participant AGT as agent

    WA->>WH: POST /webhook/whatsapp (audio message)
    WH->>WH: Parse, detect type === "audio"
    WH->>MEDIA: download_voice_note(audio.id)

    rect rgb(240, 240, 255)
        Note over MEDIA, LOOK: Two-step media download
        MEDIA->>CLI: download_media(audio.id)
        CLI->>GRAPH: Step 1: GET /v21.0/{MEDIA_ID}
        GRAPH-->>CLI: { url: "https://lookaside.fbsbx.com/..." }
        CLI->>LOOK: Step 2: GET {media_url}
        LOOK-->>CLI: Audio binary (Uint8Array)
        CLI-->>MEDIA: { buffer, mime_type: "audio/ogg" }
    end

    MEDIA-->>WH: Voice note buffer
    WH->>SVC: handle_message({ voice_buffer, voice_mime_type: "audio/ogg" })
    SVC->>STT: Transcribe audio (gpt-4o-mini-transcribe)
    STT-->>SVC: Transcribed text
    SVC->>AGT: Run agent with transcribed text
    AGT-->>SVC: Reply text
    SVC->>CLI: send_text_message(sender_id, reply)
    CLI->>GRAPH: POST /v21.0/{PHONE_ID}/messages
    GRAPH-->>WA: Deliver reply to user
```

---

## 8. Gaps and Deviations

### CRITICAL -- Security

| #  | Gap                                          | Risk                                              | Recommendation                                                                                     |
|----|----------------------------------------------|----------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| 1  | **No `X-Hub-Signature-256` validation**      | Any party can POST to `/webhook/whatsapp` and      | Add `WHATSAPP_APP_SECRET` to config. Validate HMAC-SHA256 of the raw request body against the       |
|    |                                              | impersonate messages. This is a spoofing vector.   | `X-Hub-Signature-256` header. Reject requests that fail validation with HTTP 401.                   |
| 2  | **No `object` field check**                  | Malformed or unrelated payloads are processed      | Check `body.object === "whatsapp_business_account"` before processing entries.                       |
|    |                                              | without validation.                                |                                                                                                      |

### MODERATE -- Robustness

| #  | Gap                                                | Impact                                         | Recommendation                                                                                   |
|----|----------------------------------------------------|-------------------------------------------------|---------------------------------------------------------------------------------------------------|
| 3  | **`forEach` with async callback** (webhook.ts:77)  | Unhandled promise rejections. Errors inside     | Use `Promise.all(messages.map(...))` or fire-and-forget with explicit `.catch()` per message.     |
|    |                                                    | async callbacks are silently lost.              |                                                                                                    |
| 4  | **No message deduplication**                       | Meta retries for up to 7 days. Duplicate        | Track processed `message.id` values (e.g., in SQLite or in-memory set with TTL) and skip          |
|    |                                                    | messages may produce duplicate replies.         | already-seen IDs.                                                                                  |
| 5  | **Status notifications not handled**               | Sent/delivered/read status webhooks are          | Add a branch for `statuses` in the value object. At minimum, log them. Optionally, update          |
|    |                                                    | silently ignored.                               | a message status in the database.                                                                  |
| 6  | **Send response not parsed**                       | Cannot track outbound message IDs for           | Parse the send response to extract `messages[0].id`. Store for correlation with delivery statuses. |
|    |                                                    | delivery confirmation.                          |                                                                                                    |

### MINOR -- Data Fidelity

| #  | Gap                                                | Impact                                          | Recommendation                                                                                  |
|----|----------------------------------------------------|-------------------------------------------------|-------------------------------------------------------------------------------------------------|
| 7  | **MIME type hardcoded to `"audio/ogg"`**           | If WhatsApp sends audio in a different format    | Use the `mime_type` from the webhook payload (`msg.audio.mime_type`) instead of hardcoding.      |
|    | (media.ts:8)                                       | (e.g., `audio/mpeg`), transcription may fail.   | Alternatively, use the MIME type from the step-1 media metadata response.                       |
| 8  | **Audio `sha256` not verified**                    | Downloaded media integrity is not confirmed.     | Compare the SHA256 of the downloaded buffer against `audio.sha256` from the webhook payload.     |
| 9  | **`timestamp` and `id` not extracted**             | No audit trail of when messages were sent or     | Add `id` and `timestamp` to `whatsapp_message_type`. Pass through to `incoming_message_type`.   |
|    |                                                    | their unique identifiers.                       |                                                                                                  |
| 10 | **`metadata` not typed**                           | `phone_number_id` and `display_phone_number`     | Add `metadata` to `whatsapp_webhook_entry_type`. Useful for multi-number routing.                |
|    |                                                    | are not available for multi-number setups.      |                                                                                                  |
| 11 | **`audio.voice` not checked**                      | Cannot distinguish voice notes from audio file   | Check `audio.voice === true` if different handling is desired.                                   |
|    |                                                    | attachments (sent as regular files).            |                                                                                                  |
| 12 | **API version hardcoded to `v21.0`**               | Will become stale as Meta deprecates old         | Consider making the API version configurable or establishing a version upgrade cadence.          |
|    | (client.ts:4)                                      | versions (typically ~2 year lifecycle).          |                                                                                                  |

---

## 9. Official Documentation Links

| Topic                          | URL                                                                                               |
|--------------------------------|---------------------------------------------------------------------------------------------------|
| Cloud API Overview             | https://developers.facebook.com/docs/whatsapp/cloud-api/get-started                              |
| Webhook Setup                  | https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks                   |
| Webhook Components (payloads)  | https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components                      |
| Messages Reference (send)      | https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages                       |
| Media Reference (download)     | https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media                          |
| Send Text Messages Guide       | https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages                     |
| Graph API Webhooks (general)   | https://developers.facebook.com/docs/graph-api/webhooks/getting-started                          |
| Audio Messages Webhook Ref     | https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/audio |
| Webhook Signature Validation   | https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests    |
