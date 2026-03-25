# CLAUDE.md — kapso-voice-manager

WhatsApp voice agent platform · Kapso + Pipecat
Default: Gemini Live · Languages: English + Malayalam

## Architecture

```
Kapso Page (Agent Builder GUI)
    ↓ kapso.invokeFunction()
Kapso Functions (serverless KV CRUD on Cloudflare Workers)
    ↓ env.KV
Kapso KV Storage (agent configs)
    ↓ fetched at call start
Pipecat bot.py (single deployment)
    ↓ builds pipeline from config
Gemini Live (default) / Sarvam / OpenAI+ElevenLabs
    ↓
WhatsApp voice caller
```

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

| llm value | Stack | Best for |
|-----------|-------|---------|
| `gemini` | Gemini Live (speech-to-speech) | Default, lowest latency, native Malayalam |
| `sarvam` | Sarvam STT + sarvam-m LLM + Sarvam TTS | Indian languages, natural Malayalam voice |

## Gemini Voice Options

Puck (default), Aoede, Charon, Fenrir, Kore
All voices speak Malayalam natively — no language-specific voice needed.

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
- [x] Kapso Page (Agent Builder GUI — Gemini/Sarvam/OpenAI, EN+ML)
- [x] Pipecat bot.py (Gemini Live default, Malayalam support)
- [ ] Call logs page
- [ ] Outbound calling
- [ ] Knowledge base / RAG
- [ ] Tool config UI (currently hardcoded in bot.py)
