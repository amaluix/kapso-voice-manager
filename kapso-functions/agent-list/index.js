/**
 * Kapso Function: agent-list
 * Deploy: kapso functions push index.js --name agent-list
 *
 * Returns all agent configs stored in KV.
 * Uses the agent:index key to enumerate agents efficiently.
 *
 * GET → returns array of all agent configs
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
    // Get the index of all agent IDs
    const index = (await env.KV.get("agent:index", { type: "json" })) || [];

    if (index.length === 0) {
      return new Response(JSON.stringify([]), { status: 200, headers });
    }

    // Fetch all agent configs in parallel
    const agents = await Promise.all(
      index.map((id) => env.KV.get(`agent:${id}`, { type: "json" }))
    );

    // Filter out any nulls (deleted agents) and sort by updated_at desc
    const validAgents = agents
      .filter(Boolean)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    return new Response(JSON.stringify(validAgents), { status: 200, headers });

  } catch (err) {
    console.error("agent-list error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers }
    );
  }
}
