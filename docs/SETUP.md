# Setup Guide

Complete step-by-step to get your voice agent platform running.

---

## Prerequisites

- Kapso account with a WhatsApp number (calls_enabled = true)
- Pipecat Cloud account (pipecat.daily.co)
- At least one AI API key (Google for Gemini, OpenAI, etc.)
- Node.js >= 20 (for Kapso CLI)
- Python >= 3.12 + uv (for Pipecat)

---

## Step 1 — Install CLIs

```bash
# Kapso CLI
npm install -g @kapso/cli

# Authenticate
kapso login

# Pipecat CLI
uv tool install pipecat-ai-cli
uv run pcc auth login
```

---

## Step 2 — Deploy Kapso Functions

These are your backend — they store and retrieve agent configs.

```bash
# Set your API key
export KAPSO_API_KEY=your_kapso_api_key

# Deploy agent-config function (GET + POST)
cd kapso-functions/agent-config
kapso functions push index.js --name agent-config

# Deploy agent-list function
cd ../agent-list
kapso functions push index.js --name agent-list

# Deploy agent-delete function
cd ../agent-delete
kapso functions push index.js --name agent-delete
```

After deploying, get the function URLs:
```bash
kapso functions list
```

Copy the URL for `agent-config` — you'll need it for the Pipecat `.env`.

---

## Step 3 — Create Your First Kapso Page (Agent Builder UI)

1. Go to **app.kapso.ai → Your Project → Pages**
2. Click **New page**
3. Set:
   - Name: `Agent Builder`
   - Slug: `agent-builder`
4. Open `kapso-pages/agent-builder/page.tsx` from this repo
5. Paste the entire file content into the page editor
6. Click **Save** (it will compile and preview)
7. Optionally enable **Inbox mount** to show the agent panel in the conversation sidebar

---

## Step 4 — Deploy Pipecat Agent

```bash
cd pipecat-agent

# Copy and fill in env vars
cp config/.env.example .env
nano .env
# Fill in: KAPSO_AGENT_CONFIG_URL, GOOGLE_API_KEY, WHATSAPP_TOKEN, etc.

# Install dependencies
uv sync

# Build Docker image and push to Pipecat Cloud registry
uv run pcc docker build-push

# Deploy
uv run pcc deploy voice-agent-platform IMAGE_TAG \
  --credentials your_docker_secret_name
```

Set secrets in Pipecat Cloud (do NOT put real keys in .env for production):
```bash
pcc secrets set GOOGLE_API_KEY=your_key
pcc secrets set WHATSAPP_TOKEN=your_token
pcc secrets set WHATSAPP_PHONE_NUMBER_ID=your_number_id
pcc secrets set WHATSAPP_APP_SECRET=your_secret
pcc secrets set KAPSO_AGENT_CONFIG_URL=https://agent-config.your-fn.workers.dev
pcc secrets set OPENAI_API_KEY=your_key        # if using OpenAI
pcc secrets set ELEVENLABS_API_KEY=your_key    # if using ElevenLabs
pcc secrets set SARVAM_API_KEY=your_key        # if using Sarvam
```

---

## Step 5 — Register Voice Agent in Kapso

1. Go to **app.kapso.ai → Voice Agents → New voice agent**
2. Fill in:
   - Name: `Voice Agent Platform`
   - Provider: `Pipecat`
   - Agent name: `voice-agent-platform`
   - Public API key: your Pipecat public key (from pipecat.daily.co)
3. Click **Save**
4. Copy the **Voice Agent ID** — you'll need it when creating agents in the GUI

---

## Step 6 — Assign Your WhatsApp Number

In Kapso Voice Agents:
1. Open the voice agent you just created
2. Click **Assign number**
3. Select your WhatsApp number
4. Set as **Primary** and enable
5. Save

Or via API:
```bash
curl -X POST https://app.kapso.ai/platform/v1/voice_agents/VA_ID/whatsapp/phone_numbers \
  -H "X-API-Key: YOUR_KAPSO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "voice_agent_whatsapp_config": {
      "phone_number_id": "YOUR_PHONE_NUMBER_ID",
      "is_primary": true,
      "enabled": true
    }
  }'
```

---

## Step 7 — Create Your First Agent in the GUI

1. Go to **app.kapso.ai → Pages → Agent Builder**
2. Click **New Agent**
3. Fill in:
   - Name: e.g. "Support Agent"
   - Model: Gemini Live (recommended for lowest latency)
   - Language: English
   - Prompt: your system prompt
   - Kapso Voice Agent ID: paste from Step 5
   - WhatsApp Number ID: your Meta phone number ID
4. Click **Create Agent**

---

## Step 8 — Test

Call your WhatsApp number from your phone. The flow:
```
Your call → WhatsApp → Kapso webhook → Pipecat Cloud
→ bot.py fetches your agent config from Kapso KV
→ builds pipeline (Gemini/Sarvam/ElevenLabs)
→ you hear the greeting → conversation starts
```

---

## Changing Agent Behavior (No Redeploy!)

1. Go to **Kapso Pages → Agent Builder**
2. Edit the agent (change prompt, model, voice, etc.)
3. Click **Save Changes**
4. Next call will use the new config immediately ✅

---

## Adding New Tools

Edit `pipecat-agent/bot.py` → `build_tools()` function.
Add your tool, redeploy once, then the tool is available for all agents.

```python
elif name == "check_crm":
    async def check_crm(customer_phone: str):
        # Your CRM API call
        return {"name": "John", "tier": "VIP"}

    tool_schemas.append(FunctionSchema(
        name="check_crm",
        description="Look up customer in CRM by phone number",
        properties={"customer_phone": {"type": "string"}},
        required=["customer_phone"],
        handler=check_crm,
    ))
```

Then in the Agent Builder GUI, add `{"name": "check_crm"}` to the tools list for the agent.

---

## Troubleshooting

**Bot not answering calls:**
- Check Kapso → Voice Agents → the agent is enabled and number is assigned as Primary
- Check `pcc logs voice-agent-platform` for errors

**Config not loading:**
- Verify `KAPSO_AGENT_CONFIG_URL` is correct in Pipecat secrets
- Test the function directly: `curl "https://your-fn.workers.dev?agent_id=xxx"`

**Wrong agent answering:**
- Each Pipecat deployment maps to one Kapso Voice Agent record
- The `agent_id` in the call body comes from the Kapso Voice Agent — verify it's set correctly

**Audio issues:**
- For Gemini: check `GOOGLE_API_KEY` is valid and has Gemini Live access
- For Sarvam: check language code format (e.g. `hi-IN` not `hi`)
