/**
 * Kapso Function: agent-delete
 * Deploy: kapso functions push index.js --name agent-delete
 *
 * DELETE ?agent_id=xxx → removes agent from KV and index
 */

async function handler(request, env) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const url = new URL(request.url);
    const agentId = url.searchParams.get("agent_id");

    if (!agentId) {
      return new Response(
        JSON.stringify({ error: "agent_id is required" }),
        { status: 400, headers }
      );
    }

    // Delete the agent config
    await env.KV.delete(`agent:${agentId}`);

    // Remove from index
    const index = (await env.KV.get("agent:index", { type: "json" })) || [];
    const newIndex = index.filter((id) => id !== agentId);
    await env.KV.put("agent:index", JSON.stringify(newIndex));

    return new Response(
      JSON.stringify({ success: true, deleted: agentId }),
      { status: 200, headers }
    );

  } catch (err) {
    console.error("agent-delete error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers }
    );
  }
}
