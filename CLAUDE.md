# CLAUDE.md — kapso-voice-manager

WhatsApp voice agent platform · Kapso + Pipecat
Default: Gemini Live · Languages: English + Malayalam

## Architecture

```
WhatsApp caller (inbound)
    ↓ WebRTC call
Pipecat Cloud (webhook: api.pipecat.daily.co/v1/public/webhooks/$ORG/$AGENT/whatsapp)
    ↓ runner_args.body (agent_id, caller context)
Pipecat bot.py — bot(runner_args: RunnerArguments)
    ↓ fetch config
Kapso KV Storage (via kapso-functions/agent-config)
    ↓ builds pipeline
Gemini Live (speech-to-speech, default) / Sarvam (planned)
    ↓ audio
WhatsApp caller
```

## Call flow (inbound only — outbound requires user opt-in per WhatsApp policy)

1. User calls your WhatsApp Business number
2. Pipecat Cloud receives webhook, starts bot session
3. bot() fetches agent config from Kapso KV
4. Gemini Live pipeline starts, greets caller
5. Bidirectional audio streams until hangup

## Key Files

| File | Purpose |
|------|---------|
| `kapso-functions/agent-config/index.js` | GET/POST agent configs — Kapso KV |
| `kapso-functions/agent-list/index.js` | List all agents |
| `kapso-functions/agent-delete/index.js` | Delete agent |
| `kapso-pages/agent-builder/page.tsx` | React GUI — paste into Kapso Pages |
| `pipecat-agent/bot.py` | Voice agent — fetches config, builds pipeline |
| `pipecat-agent/config/.env.example` | All env vars |
| `docs/SETUP.md` | Full setup guide |

## Agent Config Schema

```json
{
  "id": "uuid",
  "name": "Kerala Support Agent",
  "prompt": "System prompt text...",
  "llm": "gemini",
  "tts": "gemini",
  "tts_voice": "Puck",
  "language": "en | ml | hi | ta | te | kn | bn | mr",
  "greeting": "ഹലോ, ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?",
  "tools": [{"name": "check_order_status"}, {"name": "book_appointment"}],
  "kapso_voice_agent_id": "va_xxx",
  "whatsapp_number_id": "12345678",
  "is_active": true,
  "type": "inbound | outbound",
  "created_at": "ISO",
  "updated_at": "ISO"
}
```

## Supported Pipelines

| llm value | Stack | Status |
|-----------|-------|--------|
| `gemini` | GeminiLiveLLMService (s2s) — `gemini-2.5-flash-native-audio-preview-12-2025` | ✅ Active |
| `sarvam` | SarvamSTT + sarvam-m + SarvamTTS | 🚧 Planned |

Pipecat service class: `pipecat.services.google.gemini_live.GeminiLiveLLMService`
Settings API: `GeminiLiveLLMService.Settings(model=..., voice=..., language=...)`

## Gemini Voice Options

Puck (default), Aoede, Charon, Fenrir, Kore
All voices speak Malayalam natively — no language-specific voice needed.

## Pipecat Cloud Bot Entrypoint

```python
async def bot(runner_args: RunnerArguments):
    # runner_args.webrtc_connection → SmallWebRTCConnection
    # runner_args.body → {"agent_id": "...", "context": {...}}
    # runner_args.handle_sigint → bool
```

## Deploy Commands

```bash
# Kapso Functions
kapso functions push kapso-functions/agent-config/index.js --name agent-config
kapso functions push kapso-functions/agent-list/index.js --name agent-list
kapso functions push kapso-functions/agent-delete/index.js --name agent-delete

# Pipecat
cd pipecat-agent
uv run pcc docker build-push
uv run pcc deploy kapso-voice-manager IMAGE_TAG

# Logs
pcc logs kapso-voice-manager
```

## Adding a New Tool

1. Add handler in `pipecat-agent/bot.py` → `build_tools()` function
2. Redeploy Pipecat once
3. Add `{"name": "your_tool"}` to agent tools list in the GUI

## Adding a New Language

Already supported — just select from the language dropdown in Agent Builder.
For Gemini Live: all Indian languages work natively.
For Sarvam: add language code to `SARVAM_LANG_CODES` in `bot.py` if needed.

## Status

- [x] Kapso Functions (agent CRUD via KV)
- [x] Kapso Page (Agent Builder GUI — Gemini/Sarvam, EN+ML)
- [x] Pipecat bot.py (Gemini Live, correct Pipecat Cloud API, Krisp filter)
- [x] Inbound WhatsApp calls via Pipecat Cloud webhook
- [ ] Sarvam full stack pipeline (STT + sarvam-m + TTS)
- [ ] Call logs page
- [ ] Outbound calling (Note: WhatsApp outbound calls require user opt-in)
- [ ] Knowledge base / RAG
- [ ] Tool config UI (currently hardcoded in bot.py)
