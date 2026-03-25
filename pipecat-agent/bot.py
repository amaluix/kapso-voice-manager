"""
kapso-voice-manager — Pipecat Voice Agent
==========================================
Default: Gemini Live (speech-to-speech, lowest latency)
Languages: English + Malayalam (ml-IN)

Single deployment handles ALL agents.
Fetches config from Kapso KV on every call — no redeploy needed
when you change agent settings in the Kapso Page GUI.

Pipeline options:
  gemini  → GeminiMultimodalLiveLLMService (default, speech-to-speech)
  openai  → DeepgramSTT + GPT-4o + ElevenLabs/Cartesia TTS
  sarvam  → SarvamSTT + GPT-4o + SarvamTTS (best for Malayalam)
"""

import asyncio
import os
import httpx
from loguru import logger
from dotenv import load_dotenv

load_dotenv()

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.transports.network.small_webrtc import SmallWebRTCTransport
from pipecat.transports.base_transport import TransportParams
from pipecat.frames.frames import TTSSpeakFrame


# ── Language maps ──────────────────────────────────────────────────────────

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

# Gemini Live built-in voices
GEMINI_VOICES = {
    "default": "Puck",
    "female":  "Aoede",
    "male":    "Charon",
    "upbeat":  "Fenrir",
    "soft":    "Kore",
}

# Sarvam voices suited for Malayalam
SARVAM_ML_VOICES = ["meera", "pavithra", "maitreyi"]


# ── Default prompts ────────────────────────────────────────────────────────

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

PROMPT_EN = """\
You are a helpful voice assistant on a WhatsApp call.
Keep every response to 1-2 short sentences.
Never use bullet points or markdown.
Be warm, professional, and get to the point quickly.
"""

PROMPT_ML = """\
നിങ്ങൾ WhatsApp വഴി ഒരു ഉപഭോക്താവുമായി സംസാരിക്കുന്ന ഒരു സഹായകരമായ വോയ്സ് അസിസ്റ്റന്റ് ആണ്.
ഓരോ മറുപടിയും 1-2 ചെറിയ വാക്യങ്ങളിൽ ഒതുക്കുക.
ബുള്ളറ്റ് പോയിന്റുകൾ ഉപയോഗിക്കരുത്.
ഊഷ്മളമായും സ്വാഭാവികമായും സംസാരിക്കുക.
"""


# ── Fetch config from Kapso KV ─────────────────────────────────────────────

async def fetch_agent_config(agent_id: str) -> dict:
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

    # Local dev fallback
    logger.info("📋 Using env var defaults")
    return {
        "id":        agent_id or "default",
        "name":      os.getenv("AGENT_NAME", "Assistant"),
        "prompt":    os.getenv("SYSTEM_PROMPT", PROMPT_BILINGUAL),
        "llm":       os.getenv("LLM_PROVIDER", "gemini"),
        "tts":       os.getenv("TTS_PROVIDER", "gemini"),
        "tts_voice": os.getenv("TTS_VOICE", ""),
        "language":  os.getenv("LANGUAGE", "en"),
        "greeting":  os.getenv("GREETING", ""),
        "tools":     [],
    }


# ── Tool builder ───────────────────────────────────────────────────────────

def build_tools(tool_configs: list):
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
                # TODO: your order API
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
                # TODO: your calendar API
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


# ── Pipeline builder ───────────────────────────────────────────────────────

async def build_pipeline(config: dict, transport: SmallWebRTCTransport) -> Pipeline:
    llm_provider = config.get("llm", "gemini")
    tts_provider = config.get("tts", "gemini")
    language     = config.get("language", "en")
    prompt       = config.get("prompt") or PROMPT_BILINGUAL
    tools        = build_tools(config.get("tools", []))
    tts_voice    = config.get("tts_voice", "")

    logger.info(f"🔧 Pipeline: llm={llm_provider} | lang={language}")

    # ── Gemini Live ───────────────────────────────────────────────────────
    if llm_provider == "gemini":
        from pipecat.services.google.gemini_multimodal_live import (
            GeminiMultimodalLiveLLMService,
            GeminiMultimodalLiveParams,
        )

        voice_name = tts_voice or GEMINI_VOICES["default"]
        lang_code  = GEMINI_LANG_CODES.get(language, "en-US")

        # For Malayalam: use ml-IN so Gemini recognises Malayalam speech
        # Gemini Live is natively multilingual — no separate STT needed
        llm = GeminiMultimodalLiveLLMService(
            api_key=os.getenv("GOOGLE_API_KEY"),
            system_instruction=prompt,
            params=GeminiMultimodalLiveParams(
                voice_name=voice_name,
                language_code=lang_code,
            ),
            tools=tools,
        )

        return Pipeline([
            transport.input(),
            llm,
            transport.output(),
        ])

    # ── OpenAI + Deepgram STT + separate TTS ─────────────────────────────
    elif llm_provider == "openai":
        from pipecat.services.deepgram import DeepgramSTTService
        from pipecat.services.openai import OpenAILLMService
        from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext

        stt = DeepgramSTTService(
            api_key=os.getenv("DEEPGRAM_API_KEY"),
            language=GEMINI_LANG_CODES.get(language, "en-US"),
        )
        llm = OpenAILLMService(
            api_key=os.getenv("OPENAI_API_KEY"),
            model="gpt-4o",
        )
        tts = await _build_tts(tts_provider, tts_voice, language)
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

    # ── Sarvam — best for Malayalam + other Indian languages ─────────────
    elif llm_provider == "sarvam":
        from pipecat.services.sarvam import SarvamSTTService, SarvamTTSService
        from pipecat.services.openai import OpenAILLMService
        from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext

        lang_code = SARVAM_LANG_CODES.get(language, "en-IN")
        voice     = tts_voice or ("meera" if language == "ml" else "meera")

        stt = SarvamSTTService(
            api_key=os.getenv("SARVAM_API_KEY"),
            language_code=lang_code,
        )
        llm = OpenAILLMService(
            api_key=os.getenv("OPENAI_API_KEY"),
            model="gpt-4o",
        )
        tts = SarvamTTSService(
            api_key=os.getenv("SARVAM_API_KEY"),
            voice=voice,
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

    raise ValueError(f"Unknown llm provider: {llm_provider!r}")


async def _build_tts(provider: str, voice: str, language: str):
    if provider == "elevenlabs":
        from pipecat.services.elevenlabs import ElevenLabsTTSService
        return ElevenLabsTTSService(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            voice_id=voice or "21m00Tcm4TlvDq8ikWAM",
        )
    elif provider == "cartesia":
        from pipecat.services.cartesia import CartesiaTTSService
        return CartesiaTTSService(
            api_key=os.getenv("CARTESIA_API_KEY"),
            voice_id=voice or "a0e99841-438c-4a64-b679-ae501e7d6091",
        )
    elif provider == "openai_tts":
        from pipecat.services.openai import OpenAITTSService
        return OpenAITTSService(
            api_key=os.getenv("OPENAI_API_KEY"),
            voice=voice or "alloy",
        )
    elif provider == "sarvam":
        from pipecat.services.sarvam import SarvamTTSService
        return SarvamTTSService(
            api_key=os.getenv("SARVAM_API_KEY"),
            voice=voice or "meera",
            language_code=SARVAM_LANG_CODES.get(language, "en-IN"),
        )
    # fallback
    from pipecat.services.elevenlabs import ElevenLabsTTSService
    return ElevenLabsTTSService(
        api_key=os.getenv("ELEVENLABS_API_KEY"),
        voice_id=voice or "21m00Tcm4TlvDq8ikWAM",
    )


# ── Main entrypoint ────────────────────────────────────────────────────────

async def run_bot(webrtc_connection, body: dict):
    ctx          = body.get("context", {})
    contact      = ctx.get("contact", {})
    call_info    = ctx.get("call", {})
    agent_id     = body.get("agent_id") or os.getenv("DEFAULT_AGENT_ID", "")
    caller_name  = contact.get("profile_name", "there")
    caller_phone = contact.get("wa_id", "unknown")
    call_id      = call_info.get("id", "unknown")

    logger.info(
        f"📞 Call {call_id} | agent={agent_id} | "
        f"caller={caller_name} ({caller_phone})"
    )

    # Accept the WhatsApp call
    from pipecat.services.whatsapp import WhatsAppClient
    wa = WhatsAppClient(
        token=body.get("whatsapp_token") or os.getenv("WHATSAPP_TOKEN"),
        phone_number_id=body.get("phone_number_id") or os.getenv("WHATSAPP_PHONE_NUMBER_ID"),
    )
    await wa.handle_webhook_request(body)

    # Fetch agent config from Kapso KV
    config   = await fetch_agent_config(agent_id)
    greeting = config.get("greeting", "")

    # Build transport + pipeline
    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    )
    pipeline = await build_pipeline(config, transport)

    task   = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))
    runner = PipelineRunner()

    @transport.event_handler("on_client_connected")
    async def on_connected(t, client):
        logger.info(f"🟢 Connected — {caller_name}")
        if greeting:
            await task.queue_frame(TTSSpeakFrame(text=greeting))

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(t, client):
        logger.info(f"🔴 Ended — {caller_name} ({call_id})")
        await task.cancel()

    await runner.run(task)


async def bot(connection, body):
    """Pipecat Cloud entrypoint."""
    await run_bot(connection, body or {})
