# kapso-voice-manager

WhatsApp voice agent management system built on Kapso + Pipecat.
Default: Gemini Live · Languages: English + Malayalam

## Architecture

```
Kapso Project Pages (GUI)
        ↓
Kapso Functions (serverless backend — Cloudflare Workers)
        ↓
Kapso KV (agent config storage — no external DB needed)
        ↓
Pipecat Cloud (single bot.py, reads config at call time)
        ↓
Gemini Live / Sarvam / ElevenLabs (swapped at runtime)
```

## Project Structure

```
voice-agent-platform/
├── pipecat-agent/          # Pipecat Cloud deployment
│   ├── bot.py              # Main agent — reads config from Kapso KV
│   ├── tools.py            # Tool definitions (CRM, calendar, etc.)
│   ├── pipeline.py         # Pipeline builder (Gemini/Sarvam/ElevenLabs)
│   ├── prompts/            # Default prompt templates
│   ├── config/             # pcc-deploy.toml, .env.example
│   └── requirements.txt
├── kapso-functions/        # Serverless JS functions deployed to Kapso
│   ├── agent-config/       # GET + POST agent config (reads/writes KV)
│   ├── agent-list/         # List all agents
│   └── agent-delete/       # Delete agent
├── kapso-pages/            # React TSX pages hosted inside Kapso
│   ├── agent-builder/      # Create/edit agents UI
│   └── call-logs/          # Call history UI
└── docs/
    └── SETUP.md            # Step-by-step setup guide
```

## What Each Layer Does

### Kapso Functions (your backend)
- Store/retrieve agent configs in Kapso KV
- No external database needed
- Deploy with: `kapso functions push`

### Kapso Pages (your GUI)
- React TSX pages inside Kapso dashboard
- Create/edit agents, assign numbers, view logs
- Calls Kapso Functions via `kapso.invokeFunction()`

### Pipecat bot.py (voice engine)
- Single deployment handles ALL agents
- On every call: fetches agent config from Kapso KV
- Builds pipeline dynamically (no redeploy needed when config changes)
- Supports: Gemini Live, Sarvam STT+TTS, ElevenLabs TTS

## Quick Start

See `docs/SETUP.md` for full step-by-step instructions.

### 1. Deploy Kapso Functions
```bash
cd kapso-functions/agent-config
kapso functions push index.js --name agent-config

cd ../agent-list  
kapso functions push index.js --name agent-list

cd ../agent-delete
kapso functions push index.js --name agent-delete
```

### 2. Deploy Kapso Pages
- Go to app.kapso.ai → Project → Pages → New page
- Copy contents of `kapso-pages/agent-builder/page.tsx`
- Enable "Inbox mount" for the sidebar panel

### 3. Deploy Pipecat Agent
```bash
cd pipecat-agent
cp config/.env.example .env
# Fill in your API keys
uv sync
uv run pcc auth login
uv run pcc docker build-push
uv run pcc deploy kapso-voice-manager IMAGE_TAG
```

### 4. Register in Kapso
- Go to app.kapso.ai → Voice agents → New voice agent
- Provider: Pipecat
- Agent name: `voice-agent-platform`
- API key: your Pipecat public key

### 5. Create Your First Agent
- Go to Kapso Pages → Agent Builder
- Fill in name, prompt, model, voice
- Assign a WhatsApp number
- Make a test call!
