"use client";
/**
 * kapso-voice-manager — Agent Builder Page
 *
 * Paste into: app.kapso.ai → Project → Pages → New page
 *
 * Defaults: Gemini Live · English + Malayalam
 */

import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";

// ── Constants ──────────────────────────────────────────────────────────────

const MODELS = [
  {
    value: "gemini",
    label: "Gemini Live",
    badge: "Recommended",
    hint: "Speech-to-speech · Lowest latency · Natively multilingual",
  },
  {
    value: "sarvam",
    label: "Sarvam AI",
    badge: "Best for Malayalam",
    hint: "Indian languages STT+TTS · Natural Malayalam voice",
  },
  {
    value: "openai",
    label: "OpenAI GPT-4o",
    badge: "",
    hint: "Deepgram STT + GPT-4o + ElevenLabs/Cartesia TTS",
  },
];

const TTS_OPTIONS = {
  gemini: [
    { value: "gemini", label: "Gemini (built-in)" },
  ],
  sarvam: [
    { value: "sarvam", label: "Sarvam (built-in)" },
  ],
  openai: [
    { value: "elevenlabs", label: "ElevenLabs" },
    { value: "cartesia",   label: "Cartesia" },
    { value: "openai_tts", label: "OpenAI TTS" },
  ],
};

// Gemini Live built-in voices (multilingual, including Malayalam)
const GEMINI_VOICES = [
  { value: "Puck",   label: "Puck — Neutral, clear (default)" },
  { value: "Aoede",  label: "Aoede — Warm female" },
  { value: "Charon", label: "Charon — Calm male" },
  { value: "Fenrir", label: "Fenrir — Upbeat, energetic" },
  { value: "Kore",   label: "Kore — Soft female" },
];

// Sarvam voices — good for Malayalam
const SARVAM_VOICES = [
  { value: "meera",    label: "Meera — Female (Malayalam/Hindi)" },
  { value: "pavithra", label: "Pavithra — Female (Kannada/Malayalam)" },
  { value: "maitreyi", label: "Maitreyi — Female (Hindi)" },
  { value: "arvind",   label: "Arvind — Male (Hindi)" },
  { value: "amol",     label: "Amol — Male (Marathi)" },
];

const ELEVENLABS_VOICES = [
  { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel — Female, US English" },
  { value: "EXAVITQu4vr4xnSDxMaL", label: "Bella — Female, US English" },
  { value: "TxGEqnHWrfWFTfGW9XjX", label: "Josh — Male, US English" },
  { value: "pNInz6obpgDQGcFmaJgB", label: "Adam — Male, US English" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ml", label: "Malayalam — മലയാളം" },
  { value: "hi", label: "Hindi — हिन्दी" },
  { value: "ta", label: "Tamil — தமிழ்" },
  { value: "te", label: "Telugu — తెలుగు" },
  { value: "kn", label: "Kannada — ಕನ್ನಡ" },
  { value: "bn", label: "Bengali — বাংলা" },
  { value: "mr", label: "Marathi — मराठी" },
];

const DEFAULT_PROMPT = `You are a helpful voice assistant for a business in Kerala, India.
You speak both English and Malayalam fluently.

Language rules:
- Detect what language the customer uses and reply in the same language
- If they speak Malayalam, reply in natural conversational Malayalam
- If they mix languages (Manglish), match their style naturally

Voice call rules:
- Keep every response to 1-2 short sentences maximum
- Never use bullet points, numbered lists, or markdown
- Be warm, clear, and get to the point quickly`;

// ── API helpers ────────────────────────────────────────────────────────────

async function callFn(slug, payload = {}) {
  await kapso.ready();
  return kapso.invokeFunction({ slug, payload });
}

// ── Tiny UI primitives ─────────────────────────────────────────────────────

const colors = {
  primary:  "#6366f1",
  danger:   "#ef4444",
  success:  "#10b981",
  border:   "#e5e7eb",
  muted:    "#9ca3af",
  text:     "#111827",
  subtext:  "#6b7280",
  bg:       "#f9fafb",
};

function Badge({ children, color = "gray" }) {
  const map = {
    green:  { background: "#d1fae5", color: "#065f46" },
    blue:   { background: "#dbeafe", color: "#1e40af" },
    purple: { background: "#ede9fe", color: "#5b21b6" },
    gray:   { background: "#f3f4f6", color: "#374151" },
    red:    { background: "#fee2e2", color: "#991b1b" },
  };
  return (
    <span style={{ ...map[color], padding: "1px 7px", borderRadius: 9999, fontSize: 11, fontWeight: 600 }}>
      {children}
    </span>
  );
}

function Btn({ children, onClick, variant = "primary", disabled, sm }) {
  const variants = {
    primary:   { background: colors.primary, color: "#fff", border: "none" },
    danger:    { background: colors.danger, color: "#fff", border: "none" },
    ghost:     { background: "transparent", color: colors.primary, border: `1px solid ${colors.primary}` },
    secondary: { background: "#f3f4f6", color: "#374151", border: "none" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "system-ui",
        fontWeight: 500,
        opacity: disabled ? 0.5 : 1,
        padding: sm ? "5px 12px" : "9px 18px",
        fontSize: sm ? 13 : 14,
      }}
    >
      {children}
    </button>
  );
}

const inp = {
  width: "100%", boxSizing: "border-box",
  border: `1px solid ${colors.border}`, borderRadius: 8,
  padding: "8px 12px", fontSize: 14,
  fontFamily: "system-ui", color: colors.text,
  background: "#fff", outline: "none",
};

function Field({ label, hint, children, required }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 3, color: "#374151" }}>
        {label}{required && <span style={{ color: colors.danger }}> *</span>}
      </label>
      {hint && <div style={{ fontSize: 11, color: colors.muted, marginBottom: 5 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Alert({ type, children }) {
  const map = {
    error: { background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" },
    info:  { background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" },
  };
  return (
    <div style={{ ...map[type], padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
      {children}
    </div>
  );
}

// ── Model selector card ────────────────────────────────────────────────────

function ModelCard({ model, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `2px solid ${selected ? colors.primary : colors.border}`,
        borderRadius: 10,
        padding: "12px 14px",
        cursor: "pointer",
        background: selected ? "#f5f3ff" : "#fff",
        flex: 1,
        minWidth: 160,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{model.label}</span>
        {model.badge && <Badge color={model.value === "gemini" ? "purple" : model.value === "sarvam" ? "green" : "gray"}>{model.badge}</Badge>}
      </div>
      <div style={{ fontSize: 12, color: colors.subtext }}>{model.hint}</div>
    </div>
  );
}

// ── Agent Form ─────────────────────────────────────────────────────────────

function AgentForm({ agent, onSave, onCancel }) {
  const isNew = !agent?.id;
  const [f, setF] = useState({
    id:                     agent?.id || null,
    name:                   agent?.name || "",
    prompt:                 agent?.prompt || DEFAULT_PROMPT,
    llm:                    agent?.llm || "gemini",
    tts:                    agent?.tts || "gemini",
    tts_voice:              agent?.tts_voice || "Puck",
    language:               agent?.language || "en",
    greeting:               agent?.greeting || "",
    type:                   agent?.type || "inbound",
    is_active:              agent?.is_active !== undefined ? agent.is_active : true,
    kapso_voice_agent_id:   agent?.kapso_voice_agent_id || "",
    whatsapp_number_id:     agent?.whatsapp_number_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const onModelChange = (llm) => {
    set("llm", llm);
    const defaultTts = TTS_OPTIONS[llm][0].value;
    set("tts", defaultTts);
    // Reset voice to sensible default per model
    if (llm === "gemini")  set("tts_voice", "Puck");
    if (llm === "sarvam")  set("tts_voice", "meera");
    if (llm === "openai")  set("tts_voice", "");
  };

  // Determine which voice list to show
  const voiceList =
    f.tts === "gemini"      ? GEMINI_VOICES :
    f.tts === "sarvam"      ? SARVAM_VOICES :
    f.tts === "elevenlabs"  ? ELEVENLABS_VOICES : [];

  const handleSave = async () => {
    if (!f.name.trim())   return setError("Agent name is required");
    if (!f.prompt.trim()) return setError("System prompt is required");
    setSaving(true);
    setError(null);
    try {
      const saved = await callFn("agent-config", f);
      onSave(saved);
    } catch (e) {
      setError(e?.message || "Failed to save. Make sure Kapso Functions are deployed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 660, fontFamily: "system-ui" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: colors.subtext }}>←</button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          {isNew ? "New Voice Agent" : `Edit: ${agent.name}`}
        </h2>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Name + Type row */}
      <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
        <div style={{ flex: 2 }}>
          <Field label="Agent Name" required>
            <input style={inp} value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Kerala Support Agent" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Type">
            <select style={inp} value={f.type} onChange={e => set("type", e.target.value)}>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
          </Field>
        </div>
      </div>

      {/* Language */}
      <Field label="Primary Language" hint="Sets speech recognition language. Gemini Live understands all listed languages natively.">
        <select style={inp} value={f.language} onChange={e => set("language", e.target.value)}>
          {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </Field>

      {/* Model */}
      <Field label="AI Model" required hint="Gemini Live is recommended — it handles Malayalam natively with no separate STT/TTS needed.">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {MODELS.map(m => (
            <ModelCard
              key={m.value}
              model={m}
              selected={f.llm === m.value}
              onClick={() => onModelChange(m.value)}
            />
          ))}
        </div>
      </Field>

      {/* TTS (hidden for Gemini — it's built-in) */}
      {f.llm !== "gemini" && f.llm !== "sarvam" && (
        <Field label="Text-to-Speech">
          <select style={inp} value={f.tts} onChange={e => { set("tts", e.target.value); set("tts_voice", ""); }}>
            {TTS_OPTIONS[f.llm].map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
      )}

      {/* Voice */}
      {voiceList.length > 0 && (
        <Field
          label={f.tts === "gemini" ? "Gemini Voice" : f.tts === "sarvam" ? "Sarvam Voice" : "Voice"}
          hint={f.tts === "gemini" ? "All Gemini voices speak Malayalam natively." : ""}
        >
          <select style={inp} value={f.tts_voice} onChange={e => set("tts_voice", e.target.value)}>
            {voiceList.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </Field>
      )}

      {/* Greeting */}
      <Field
        label="Opening Greeting"
        hint="What the agent says immediately when the call connects. Can be in English or Malayalam."
      >
        <input
          style={inp}
          value={f.greeting}
          onChange={e => set("greeting", e.target.value)}
          placeholder={
            f.language === "ml"
              ? "ഹലോ, ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?"
              : "Hello! How can I help you today?"
          }
        />
      </Field>

      {/* Prompt */}
      <Field
        label="System Prompt"
        required
        hint="Instructions for the agent. Be specific about tone, what it can/cannot do, and language behaviour."
      >
        <textarea
          style={{ ...inp, resize: "vertical", lineHeight: 1.6 }}
          rows={10}
          value={f.prompt}
          onChange={e => set("prompt", e.target.value)}
        />
      </Field>

      {/* Kapso linkage */}
      <div style={{ background: colors.bg, borderRadius: 10, padding: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Kapso Linkage</div>
        <Field label="Kapso Voice Agent ID" hint="From app.kapso.ai → Voice Agents. Links this config to the Pipecat deployment.">
          <input style={inp} value={f.kapso_voice_agent_id} onChange={e => set("kapso_voice_agent_id", e.target.value)} placeholder="va_xxxxxxxx" />
        </Field>
        <Field label="WhatsApp Phone Number ID" hint="The Meta Phone Number ID assigned to this agent.">
          <input style={inp} value={f.whatsapp_number_id} onChange={e => set("whatsapp_number_id", e.target.value)} placeholder="12345678901234" />
        </Field>
      </div>

      {/* Active toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <input
          type="checkbox"
          id="is_active"
          checked={f.is_active}
          onChange={e => set("is_active", e.target.checked)}
          style={{ width: 16, height: 16 }}
        />
        <label htmlFor="is_active" style={{ fontSize: 14, color: "#374151", cursor: "pointer" }}>
          Active — accepts incoming calls
        </label>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : isNew ? "Create Agent" : "Save Changes"}
        </Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

// ── Agent Card ─────────────────────────────────────────────────────────────

function AgentCard({ agent, onEdit, onDelete }) {
  const modelLabel = { gemini: "Gemini Live", openai: "OpenAI", sarvam: "Sarvam" };
  const langLabel  = LANGUAGES.find(l => l.value === agent.language)?.label || agent.language;

  return (
    <div style={{
      border: `1px solid ${colors.border}`, borderRadius: 12,
      padding: 16, background: "#fff", marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{agent.name}</span>
            <Badge color={agent.is_active ? "green" : "gray"}>
              {agent.is_active ? "Active" : "Inactive"}
            </Badge>
            <Badge color="blue">{agent.type}</Badge>
            <Badge color="purple">{modelLabel[agent.llm] || agent.llm}</Badge>
          </div>
          <div style={{ fontSize: 12, color: colors.subtext, marginBottom: 4 }}>
            {langLabel}
            {agent.tts_voice && ` · ${agent.tts_voice}`}
          </div>
          <div style={{
            fontSize: 12, color: colors.muted,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: 420,
          }}>
            {agent.prompt?.slice(0, 90)}...
          </div>
          {agent.whatsapp_number_id && (
            <div style={{ fontSize: 11, color: colors.subtext, marginTop: 5 }}>
              📱 {agent.whatsapp_number_id}
              {agent.kapso_voice_agent_id && ` · 🔗 ${agent.kapso_voice_agent_id}`}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: 12, flexShrink: 0 }}>
          <Btn sm variant="ghost" onClick={() => onEdit(agent)}>Edit</Btn>
          <Btn sm variant="danger" onClick={() => onDelete(agent)}>Delete</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────

function App() {
  const [view,   setView]   = useState("list");
  const [agents, setAgents] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callFn("agent-list");
      setAgents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError("Could not load agents. Make sure the three Kapso Functions are deployed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = (saved) => {
    setAgents(prev => {
      const exists = prev.find(a => a.id === saved.id);
      return exists ? prev.map(a => a.id === saved.id ? saved : a) : [saved, ...prev];
    });
    setView("list");
  };

  const handleDelete = async (agent) => {
    if (!confirm(`Delete "${agent.name}"? This cannot be undone.`)) return;
    try {
      await callFn("agent-delete", { agent_id: agent.id });
      setAgents(prev => prev.filter(a => a.id !== agent.id));
    } catch (e) {
      alert("Delete failed: " + e.message);
    }
  };

  if (view === "form") {
    return (
      <AgentForm
        agent={editing}
        onSave={handleSave}
        onCancel={() => setView("list")}
      />
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Voice Agents</h1>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: colors.subtext }}>
            kapso-voice-manager · Gemini Live · English + Malayalam
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn sm variant="secondary" onClick={load}>↻</Btn>
          <Btn sm onClick={() => { setEditing(null); setView("form"); }}>+ New Agent</Btn>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: colors.muted }}>
          Loading agents...
        </div>
      ) : agents.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 52,
          border: `2px dashed ${colors.border}`, borderRadius: 14,
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎙️</div>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>No voice agents yet</div>
          <div style={{ fontSize: 13, color: colors.muted, marginBottom: 20 }}>
            Create your first agent to start taking WhatsApp voice calls
          </div>
          <Btn onClick={() => { setEditing(null); setView("form"); }}>
            Create First Agent
          </Btn>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </div>
          {agents.map(a => (
            <AgentCard
              key={a.id}
              agent={a}
              onEdit={ag => { setEditing(ag); setView("form"); }}
              onDelete={handleDelete}
            />
          ))}
        </>
      )}

      {/* Footer note */}
      <div style={{
        marginTop: 24, padding: 14,
        background: colors.bg, borderRadius: 10,
        fontSize: 12, color: colors.subtext,
      }}>
        <strong>Setup reminder:</strong> After creating an agent here, register it in{" "}
        <strong>Kapso → Voice Agents</strong> with your Pipecat deployment credentials,
        then paste the Voice Agent ID back into the form above.
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
