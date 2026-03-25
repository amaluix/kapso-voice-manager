"""
kapso-voice-manager — Pipecat Voice Agent
==========================================
Pipeline: Gemini Live (speech-to-speech, lowest latency, native multilingual)
Model: gemini-2.5-flash-native-audio-preview-12-2025

Single deployment handles ALL agents.
Fetches config from Kapso KV on every call — no redeploy needed.

Entrypoint: async def bot(runner_args: RunnerArguments)
  Pipecat Cloud routes WhatsApp inbound calls here automatically.
  Webhook URL: https://api.pipecat.daily.co/v1/public/webhooks/$ORG/$AGENT/whatsapp

References:
  https://docs.pipecat.ai/server/services/s2s/gemini-live.md
  https://docs.pipecat.ai/deployment/pipecat-cloud/guides/whatsapp.md
"""

import os
import httpx
from loguru import logger
from dotenv import load_dotenv

load_dotenv()

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.runner.types import RunnerArguments
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport


# ── Constants ──────────────────────────────────────────────────────────────

# Recommended Gemini Live model (older models deprecated Dec 2025)
# https://docs.pipecat.ai/server/services/s2s/gemini-live.md
GEMINI_MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025"

GEMINI_VOICES = {
    "default": "Puck",
    "female":  "Aoede",
    "male":    "Charon",
    "upbeat":  "Fenrir",
    "soft":    "Kore",
}

# BCP-47 language codes supported by Gemini Live
GEMINI_LANG_CODES = {
    "en": "en-US",
    "ml": "ml-IN",
    "hi": "hi-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "kn": "kn-IN",
    "bn": "bn-IN",
    "mr": "mr-IN",
}

# Sarvam language codes (for future Sarvam pipeline)
SARVAM_LANG_CODES = {
    "en": "en-IN",
    "ml": "ml-IN",
    "hi": "hi-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "kn": "kn-IN",
    "bn": "bn-IN",
    "mr": "mr-IN",
}


# ── Default system prompts ─────────────────────────────────────────────────

PROMPT_BILINGUAL = """\
You are a helpful voice assistant for a business in Kerala, India.
You speak both English and Malayalam fluently.

Language rules:
- Detect the language the customer uses and respond in the same language
- If they speak Malayalam, reply in natural Malayalam
- If they speak English, reply in English
- If they mix languages (Manglish), match their style naturally
- Never switch language mid-sentence

Voice call rules:
- Keep every response to 1-2 short sentences maximum
- Never use bullet points, numbered lists, or markdown
- Speak conversationally — this is a phone call, not a chat
- Be warm, clear, and get to the point quickly
- If you don't know something, say so and offer to find out
"""


# ── Fetch agent config from Kapso KV ──────────────────────────────────────

async def fetch_agent_config(agent_id: str) -> dict:
    """Fetch agent config from Kapso KV via the agent-config function."""
    kapso_fn_url = os.getenv("KAPSO_AGENT_CONFIG_URL")

    if kapso_fn_url and agent_id:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    kapso_fn_url,
                    params={"agent_id": agent_id},
                )
                if resp.status_code == 200:
                    config = resp.json()
                    logger.info(
                        f"✅ Agent: '{config.get('name')}' | "
                        f"llm={config.get('llm')} | lang={config.get('language')}"
                    )
                    return config
                logger.warning(f"⚠️  agent_id={agent_id} not found, using defaults")
        except Exception as e:
            logger.error(f"❌ KV fetch failed: {e}")

    logger.info("📋 Using env var defaults")
    return {
        "id":        agent_id or "default",
        "name":      os.getenv("AGENT_NAME", "Assistant"),
        "prompt":    os.getenv("SYSTEM_PROMPT", PROMPT_BILINGUAL),
        "llm":       os.getenv("LLM_PROVIDER", "gemini"),
        "tts_voice": os.getenv("TTS_VOICE", ""),
        "language":  os.getenv("LANGUAGE", "en"),
        "greeting":  os.getenv("GREETING", ""),
        "tools":     [],
    }


# ── Tool builder ───────────────────────────────────────────────────────────

def build_tools(tool_configs: list):
    """Build Pipecat ToolsSchema from agent tool config list."""
    if not tool_configs:
        return None

    from pipecat.adapters.schemas.function_schema import FunctionSchema
    from pipecat.adapters.schemas.tools_schema import ToolsSchema

    schemas = []

    for tool in tool_configs:
        name = tool.get("name")
        cfg  = tool.get("config", {})

        if name == "check_order_status":
            async def check_order_status(order_id: str):
                # TODO: connect to your order management system
                return {"status": "In transit", "eta": "2 business days"}
            schemas.append(FunctionSchema(
                name="check_order_status",
                description="Check delivery status of a customer order",
                properties={"order_id": {"type": "string"}},
                required=["order_id"],
                handler=check_order_status,
            ))

        elif name == "book_appointment":
            async def book_appointment(date: str, time: str, name: str):
                # TODO: connect to your calendar system
                return {"confirmation": f"Booked for {name} on {date} at {time}"}
            schemas.append(FunctionSchema(
                name="book_appointment",
                description="Book an appointment for the customer",
                properties={
                    "date": {"type": "string", "description": "YYYY-MM-DD"},
                    "time": {"type": "string", "description": "e.g. 10:00 AM"},
                    "name": {"type": "string"},
                },
                required=["date", "time", "name"],
                handler=book_appointment,
            ))

        elif name == "lookup_customer":
            crm_url = cfg.get("crm_url") or os.getenv("CRM_API_URL", "")
            crm_key = cfg.get("crm_key") or os.getenv("CRM_API_KEY", "")
            async def lookup_customer(phone: str):
                if not crm_url:
                    return {"error": "CRM not configured"}
                try:
                    async with httpx.AsyncClient(timeout=4.0) as c:
                        r = await c.get(
                            f"{crm_url}/customers",
                            params={"phone": phone},
                            headers={"Authorization": f"Bearer {crm_key}"},
                        )
                        return r.json()
                except Exception as e:
                    return {"error": str(e)}
            schemas.append(FunctionSchema(
                name="lookup_customer",
                description="Look up customer by phone number",
                properties={"phone": {"type": "string"}},
                required=["phone"],
                handler=lookup_customer,
            ))

    return ToolsSchema(standard_tools=schemas) if schemas else None


# ── Pipeline builders ──────────────────────────────────────────────────────

async def build_gemini_pipeline(
    config: dict,
    transport: SmallWebRTCTransport,
) -> Pipeline:
    """
    Gemini Live speech-to-speech pipeline.
    Single service handles STT + LLM + TTS — lowest latency.

    Ref: https://docs.pipecat.ai/server/services/s2s/gemini-live.md
    """
    from pipecat.services.google.gemini_live import GeminiLiveLLMService

    language  = config.get("language", "en")
    tts_voice = config.get("tts_voice", "")
    greeting  = config.get("greeting", "")
    tools     = build_tools(config.get("tools", []))

    voice_name = tts_voice or GEMINI_VOICES["default"]
    lang_code  = GEMINI_LANG_CODES.get(language, "en-US")

    # Prepend greeting instruction so Gemini speaks first on connection
    prompt = config.get("prompt") or PROMPT_BILINGUAL
    if greeting:
        prompt = (
            f'Start the conversation by saying exactly: "{greeting}"\n\n'
            f"{prompt}"
        )

    llm = GeminiLiveLLMService(
        api_key=os.getenv("GOOGLE_API_KEY"),
        system_instruction=prompt,
        # inference_on_context_initialization=True causes Gemini to speak
        # immediately on pipeline start (delivers the greeting)
        inference_on_context_initialization=bool(greeting),
        settings=GeminiLiveLLMService.Settings(
            model=GEMINI_MODEL,
            voice=voice_name,
            language=lang_code,
        ),
        tools=tools,
    )

    return Pipeline([
        transport.input(),
        llm,
        transport.output(),
    ])


async def build_sarvam_pipeline(
    config: dict,
    transport: SmallWebRTCTransport,
) -> Pipeline:
    """
    Sarvam full stack: SarvamSTT → sarvam-m LLM → SarvamTTS.
    Best for Indian languages. Work in progress.
    """
    from pipecat.services.sarvam import SarvamSTTService, SarvamTTSService
    from pipecat.services.openai import OpenAILLMService
    from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext

    language  = config.get("language", "en")
    tts_voice = config.get("tts_voice", "meera")
    tools     = build_tools(config.get("tools", []))
    prompt    = config.get("prompt") or PROMPT_BILINGUAL
    lang_code = SARVAM_LANG_CODES.get(language, "en-IN")

    stt = SarvamSTTService(
        api_key=os.getenv("SARVAM_API_KEY"),
        language_code=lang_code,
    )
    llm = OpenAILLMService(
        api_key=os.getenv("SARVAM_API_KEY"),
        base_url="https://api.sarvam.ai/v1",
        model="sarvam-m",
    )
    tts = SarvamTTSService(
        api_key=os.getenv("SARVAM_API_KEY"),
        voice=tts_voice,
        language_code=lang_code,
    )
    ctx = OpenAILLMContext(
        messages=[{"role": "system", "content": prompt}],
        tools=tools,
    )
    agg = llm.create_context_aggregator(ctx)

    return Pipeline([
        transport.input(),
        stt,
        agg.user(),
        llm,
        tts,
        transport.output(),
        agg.assistant(),
    ])


# ── Pipecat Cloud entrypoint ───────────────────────────────────────────────

async def bot(runner_args: RunnerArguments):
    """
    Pipecat Cloud entrypoint for WhatsApp inbound voice calls.

    Called automatically by Pipecat Cloud when a WhatsApp call arrives.
    Webhook URL (configure in Meta Developer Console):
      https://api.pipecat.daily.co/v1/public/webhooks/$ORG/$AGENT_NAME/whatsapp

    runner_args.body contains the call context from Kapso:
      - agent_id: which agent config to load from Kapso KV
      - context.contact: caller info (wa_id, profile_name)
      - context.call: call metadata (id)
    """
    body      = runner_args.body or {}
    ctx       = body.get("context", {})
    contact   = ctx.get("contact", {})
    call_info = ctx.get("call", {})
    agent_id  = body.get("agent_id") or os.getenv("DEFAULT_AGENT_ID", "")

    caller_name  = contact.get("profile_name", "there")
    caller_phone = contact.get("wa_id", "unknown")
    call_id      = call_info.get("id", "unknown")

    logger.info(
        f"📞 Inbound call | id={call_id} | agent={agent_id} | "
        f"caller={caller_name} ({caller_phone})"
    )

    config       = await fetch_agent_config(agent_id)
    llm_provider = config.get("llm", "gemini")

    webrtc_connection: SmallWebRTCConnection = runner_args.webrtc_connection

    # Krisp noise filter — improves audio quality on WhatsApp calls in production
    # Ref: https://docs.pipecat.ai/deployment/pipecat-cloud/guides/whatsapp.md
    krisp_filter = None
    if os.environ.get("ENV") != "local":
        try:
            from pipecat.audio.filters.krisp_viva_filter import KrispVivaFilter
            krisp_filter = KrispVivaFilter()
            logger.info("🎙️  Krisp noise filter enabled")
        except ImportError:
            logger.warning("⚠️  Krisp filter unavailable — running without noise filter")

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_in_filter=krisp_filter,
            audio_out_enabled=True,
        ),
    )

    if llm_provider == "gemini":
        pipeline = await build_gemini_pipeline(config, transport)
    elif llm_provider == "sarvam":
        pipeline = await build_sarvam_pipeline(config, transport)
    else:
        logger.error(f"❌ Unknown llm provider: {llm_provider!r}, falling back to gemini")
        pipeline = await build_gemini_pipeline(config, transport)

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
        ),
    )

    runner = PipelineRunner(handle_sigint=runner_args.handle_sigint)

    @transport.event_handler("on_client_connected")
    async def on_connected(t, client):
        logger.info(f"🟢 Connected — {caller_name} ({caller_phone})")

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(t, client):
        logger.info(f"🔴 Ended — {caller_name} | call_id={call_id}")
        await task.cancel()

    await runner.run(task)
