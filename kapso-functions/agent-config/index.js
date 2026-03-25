/**
 * Kapso Function: agent-config
 * Deploy: kapso functions push index.js --name agent-config
 *
 * Handles GET and POST for voice agent configurations.
 * All configs stored in Kapso KV under key: agent:{id}
 *
 * GET  ?agent_id=xxx        → returns agent config
 * POST {body: agentConfig}  → saves agent config, returns saved config
 */

async function handler(request, env) {
  const url = new URL(request.url);
  const method = request.method;

  // ── CORS headers for Kapso Pages ──────────────────────────────────────────
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    // ── GET: fetch a single agent config ────────────────────────────────────
    if (method === "GET") {
      const agentId = url.searchParams.get("agent_id");

      if (!agentId) {
        return new Response(
          JSON.stringify({ error: "agent_id is required" }),
          { status: 400, headers }
        );
      }

      const config = await env.KV.get(`agent:${agentId}`, { type: "json" });

      if (!config) {
        return new Response(
          JSON.stringify({ error: "Agent not found" }),
          { status: 404, headers }
        );
      }

      return new Response(JSON.stringify(config), { status: 200, headers });
    }

    // ── POST: create or update an agent config ───────────────────────────────
    if (method === "POST") {
      const body = await request.json();

      const {
        id,               // string — unique ID (auto-generated if new)
        name,             // string — display name e.g. "Support Agent"
        prompt,           // string — system prompt / instructions
        llm,              // "gemini" | "openai" | "sarvam"
        stt,              // "gemini" | "deepgram" | "sarvam" (ignored if llm=gemini)
        tts,              // "gemini" | "elevenlabs" | "sarvam" (ignored if llm=gemini)
        tts_voice,        // string — ElevenLabs voice ID or Sarvam voice name
        language,         // "en" | "hi" | "ml" | "te" | "ta" etc.
        greeting,         // string — first thing agent says when call connects
        tools,            // array of tool configs [{name, config}]
        kapso_voice_agent_id,  // string — Kapso Platform voice agent ID
        whatsapp_number_id,    // string — assigned phone number ID
        is_active,        // boolean — is this the active agent for the number
        type,             // "inbound" | "outbound"
      } = body;

      // Validate required fields
      if (!name || !prompt || !llm) {
        return new Response(
          JSON.stringify({ error: "name, prompt, and llm are required" }),
          { status: 400, headers }
        );
      }

      // Generate ID for new agents
      const agentId = id || crypto.randomUUID();
      const now = new Date().toISOString();

      const config = {
        id: agentId,
        name,
        prompt,
        llm,
        stt: stt || (llm === "gemini" ? "gemini" : "deepgram"),
        tts: tts || (llm === "gemini" ? "gemini" : "elevenlabs"),
        tts_voice: tts_voice || null,
        language: language || "en",
        greeting: greeting || `Hi, I'm ${name}. How can I help you today?`,
        tools: tools || [],
        kapso_voice_agent_id: kapso_voice_agent_id || null,
        whatsapp_number_id: whatsapp_number_id || null,
        is_active: is_active !== undefined ? is_active : true,
        type: type || "inbound",
        created_at: id ? undefined : now,  // only set on create
        updated_at: now,
      };

      // Remove undefined fields
      Object.keys(config).forEach(
        (k) => config[k] === undefined && delete config[k]
      );

      await env.KV.put(`agent:${agentId}`, JSON.stringify(config));

      // Also maintain an index of all agent IDs
      const index = (await env.KV.get("agent:index", { type: "json" })) || [];
      if (!index.includes(agentId)) {
        index.push(agentId);
        await env.KV.put("agent:index", JSON.stringify(index));
      }

      return new Response(JSON.stringify(config), { status: 200, headers });
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers }
    );

  } catch (err) {
    console.error("agent-config error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers }
    );
  }
}
