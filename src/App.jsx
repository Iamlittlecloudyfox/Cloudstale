import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Plus, Settings, Send, Trash2, X, Moon, Sun, MessageSquare, Pencil, RotateCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
// ─── Constants & Helpers ──────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);

// ─── API style detection & URL normalization ──────────────────────────────
function detectApiStyle(url) {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("anthropic.com") || u.pathname.endsWith("/messages")) {
      return "anthropic";
    }
  } catch {}
  return "openai";
}

function normalizeChatUrl(rawUrl, style) {
  const trimmed = rawUrl.trim().replace(/\/+$/, "");
  if (style === "anthropic") {
    return /\/v1\/messages$/.test(trimmed) ? trimmed : `${trimmed}/v1/messages`;
  }
  if (/\/(chat\/completions|responses)$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

const MIN_THINKING_DISPLAY_MS = 550;

const MASCOT_IMAGES_LIGHT = [
  "/mascot/idle.png",
  "/mascot/idle_blink.png",
  "/mascot/think.png",
  "/mascot/answer.png",
  "/mascot/answer2.png",
];

const MASCOT_IMAGES_DARK = [
  "/mascot/dark/idle_dark.png",
  "/mascot/dark/idle_blink_dark.png",
  "/mascot/dark/think_dark.png",
  "/mascot/dark/answer_dark.png",
  "/mascot/dark/answer2_dark.png",
];

const ALL_MASCOT_IMAGES = [...MASCOT_IMAGES_LIGHT, ...MASCOT_IMAGES_DARK];

const FONTS = {
  inter: { label: "Inter", value: "'Inter', system-ui, -apple-system, sans-serif" },
  georgia: { label: "Georgia", value: "Georgia, serif" },
  times: { label: "Times English", value: "'Times New Roman', Times, serif" },
};

const GREETING_TEMPLATES = [
  (name) => `Yip Yap n' clouds!`,
  (name) => `Hallo, ${name}.`,
  (name) => `What are we working on, ${name}?`,
  (name) => `Unleash your imagination!`,
  (name) => `Always good to see you, ${name}.`,
  (name) => `Ready when you are.`,
  (name) => `What's on your mind today, ${name}?`,
  (name) => `Let's explore something interesting!`,
  (name) => `Welcome back, ${name}.`,
];

const PERSONAS = {
  Studying: {
    label: "Studying",
    prompt: "You are a focused, knowledgeable assistant. Answer questions clearly and concisely. Use examples when helpful. Encourage the user to think critically.",
  },
  Dreaming: {
    label: "Dreaming",
    prompt: "You are a reflective, poetic companion. Speak softly and thoughtfully. Feel free to be philosophical, imaginative, and inspiring.",
  },
  Custom: {
    label: "Custom",
    prompt: "",
  },
};

const MASCOT_PERSONA_PROMPT = "You are Cloudy, a friendly and curious anthro fox who lives in this chat as its mascot. Let a bit of that personality come through in how you write — warm, a little playful and whimsical, quick with a gentle touch of humor — without ever getting in the way of giving a complete, accurate, and genuinely useful answer. Stay in character subtly; don't make a big deal out of being a fox unless the user brings it up first.";

const DEFAULT_SETTINGS = {
  provider: "ollama",
  ollamaUrl: "http://localhost:11434",
  customApiUrl: "https://openrouter.ai/api/v1/chat/completions",
  customApiKey: "",
  modelName: "llama3",
  modelDisplayName: "",
  userName: "User",
  theme: "light",
  font: "inter",
  persona: "Dreaming",
  customPrompt: "",
  showMascot: true,
  fontSize: 14,
  mascotPersonaEnabled: true,
  maxTokens: 4096,
};

const ls = {
  get: (k, def) => { try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── Mascot ───────────────────────────────────────────────────────────────────
function FoxMascot({ state = "idle", size = 480, isDark = false }) {
  const images = isDark ? MASCOT_IMAGES_DARK : MASCOT_IMAGES_LIGHT;
  const [display, setDisplay] = useState({ img: images[0], instant: false });

  const blinkTimerRef = useRef(null);
  const blinkEndTimerRef = useRef(null);

  useEffect(() => {
    ALL_MASCOT_IMAGES.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  useEffect(() => {
    setDisplay((prev) => {
      const idx = images.findIndex((_, i) =>
        (isDark ? MASCOT_IMAGES_LIGHT : MASCOT_IMAGES_DARK)[i] === prev.img
      );
      return { img: images[idx !== -1 ? idx : 0], instant: true };
    });
  }, [isDark]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;

    const stopBlinkLoop = () => {
      if (blinkTimerRef.current) { clearTimeout(blinkTimerRef.current); blinkTimerRef.current = null; }
      if (blinkEndTimerRef.current) { clearTimeout(blinkEndTimerRef.current); blinkEndTimerRef.current = null; }
    };

    stopBlinkLoop();

    if (state === "thinking") {
      setDisplay({ img: images[2], instant: false }); // think.png
      return () => { cancelled = true; };
    }

    if (state === "answering") {
      setDisplay({
        img: Math.random() < 0.5 ? images[3] : images[4], // answer / answer2
        instant: false,
      });
      return () => { cancelled = true; };
    }

    setDisplay({ img: images[0], instant: false }); // idle

    const scheduleBlink = () => {
      if (cancelled) return;
      const nextBlink = 2500 + Math.random() * 3000;
      blinkTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        setDisplay({ img: images[1], instant: true }); // idle_blink
        blinkEndTimerRef.current = setTimeout(() => {
          if (cancelled) return;
          setDisplay({ img: images[0], instant: true }); // idle
          scheduleBlink();
        }, 150);
      }, nextBlink);
    };

    scheduleBlink();

    return () => { cancelled = true; stopBlinkLoop(); };
  }, [state, isDark]);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {images.map((src) => (
        <img
          key={src}
          src={src}
          alt="Mascot"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: size,
            height: size,
            objectFit: "contain",
            opacity: display.img === src ? 1 : 0,
            transition: display.instant ? "none" : "opacity 0.25s linear",
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}

// ─── Markdown renderer ─────────────────────────────────────────────────────────

function InlineText({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
        if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="px-1.5 py-0.5 rounded text-[0.82em] font-mono bg-black/10 dark:bg-white/10">{p.slice(1, -1)}</code>;
        if (p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function MessageContent({ text, isDark, fontSize = 14 }) {
  const codeClass = isDark ? "bg-[#16181d] text-slate-200 border border-[#272a31]" : "bg-[#f1f5f9] text-slate-800 border border-[#cbd5e1]";
  const elements = [];
  let inCode = false, codeBuf = [], k = 0;
  const flushCode = () => {
    if (!codeBuf.length) return;
    elements.push(
      <pre key={k++} className={`my-4 rounded-xl p-4 text-[0.82em] overflow-x-auto font-mono leading-relaxed ${codeClass}`}>
        <code>{codeBuf.join("\n")}</code>
      </pre>
    );
    codeBuf = [];
  };
  text.split("\n").forEach((line) => {
    if (line.startsWith("```")) { if (inCode) flushCode(); inCode = !inCode; return; }
    if (inCode) { codeBuf.push(line); return; }
    if (line.startsWith("### ")) elements.push(<h3 key={k++} style={{ fontSize: "1.05em" }} className="font-semibold mt-4 mb-1">{line.slice(4)}</h3>);
    else if (line.startsWith("## ")) elements.push(<h2 key={k++} style={{ fontSize: "1.2em" }} className="font-bold mt-5 mb-1.5">{line.slice(3)}</h2>);
    else if (line.startsWith("# ")) elements.push(<h1 key={k++} style={{ fontSize: "1.35em" }} className="font-bold mt-5 mb-2">{line.slice(2)}</h1>);
    else if (line.startsWith("- ") || line.startsWith("* ")) elements.push(<li key={k++} className="ml-5 list-disc leading-relaxed my-0.5"><InlineText text={line.slice(2)} /></li>);
    else if (/^\d+\. /.test(line)) elements.push(<li key={k++} className="ml-5 list-decimal leading-relaxed my-0.5"><InlineText text={line.replace(/^\d+\. /, "")} /></li>);
    else if (!line.trim()) elements.push(<div key={k++} className="h-3" />);
    else elements.push(<p key={k++} className="leading-[1.75] my-0.5"><InlineText text={line} /></p>);
  });
  if (inCode) flushCode();
  return <div style={{ fontSize: `${fontSize}px` }}>{elements}</div>;
}

function TypingDots({ isDark }) {
  return (
    <div className="flex gap-1.5 items-center py-1">
      {[0, 1, 2].map((i) => (
        <motion.span key={i}
          className={`w-1.5 h-1.5 rounded-full inline-block ${isDark ? "bg-slate-400" : "bg-slate-500"}`}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

const ChatMessage = memo(function ChatMessage({
  msg, isDark, fontSize, isStreamingThis, showRegenerate, onRegenerate, userBg, userTxt, muted, hov,
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className={`leading-relaxed px-4 py-2.5 rounded-2xl max-w-[82%] ${userBg} ${userTxt}`}>
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 pr-4 group relative">
      {msg.content === "" && isStreamingThis
        ? <TypingDots isDark={isDark} />
        : <MessageContent text={msg.content} isDark={isDark} fontSize={fontSize} />}
      {showRegenerate && (
        <div className="flex items-center gap-2 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onRegenerate(msg.id)}
            title="Regenerate full response"
            className={`p-1 rounded-md text-xs flex items-center gap-1 ${muted} ${hov} transition-all`}>
            <RotateCw size={11} />
            <span className="text-[10px]">{msg.isError ? "Retry" : "Regenerate"}</span>
          </button>
        </div>
      )}
    </div>
  );
});

// ─── Settings Modal ───────────────────────────────────────────────────────────

function SettingsModal({ settings, onSave, onClose, isDark }) {
  const [loc, setLoc] = useState({ ...settings });
  const set = (k, v) => setLoc((p) => ({ ...p, [k]: v }));

  const [ollamaModels, setOllamaModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState(null);
  const fetchingRef = useRef(false);

  const bg = isDark ? "bg-[#121417]" : "bg-[#ffffff]";
  const txt = isDark ? "text-[#f1f5f9]" : "text-[#0f172a]";
  const brd = isDark ? "border-[#22242a]" : "border-[#cbd5e1]";
  const muted = isDark ? "text-[#71717a]" : "text-[#64748b]";
  const inp = isDark ? "bg-[#181a1e] border-[#272a31] text-[#f1f5f9] placeholder-[#52525b]" : "bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a] placeholder-[#94a3b8]";
  const hov = isDark ? "hover:bg-white/5" : "hover:bg-black/5";
  const pill = (active) => active
    ? (isDark ? "border-slate-300 text-white bg-white/10 font-medium" : "border-slate-800 text-slate-900 bg-slate-900/10 font-semibold")
    : `border-transparent ${muted} ${hov}`;

  const buttonPrimary = isDark
    ? "bg-slate-200 text-slate-950 font-semibold hover:bg-white active:bg-slate-300"
    : "bg-slate-900 text-white font-semibold hover:bg-slate-800 active:bg-slate-950";

  const [customModels, setCustomModels] = useState([]);
const [loadingCustomModels, setLoadingCustomModels] = useState(false);
const [customModelError, setCustomModelError] = useState(null);
const customFetchingRef = useRef(false);

const deriveModelsUrl = (chatUrl) => {
  try {
    const style = detectApiStyle(chatUrl);
    const url = new URL(normalizeChatUrl(chatUrl, style));
    const segments = url.pathname.split("/").filter(Boolean);

    if (style === "anthropic") {
      segments[segments.length - 1] = "models"; // .../v1/messages → .../v1/models
    } else {
      if (segments[segments.length - 1] === "completions") segments.pop();
      if (segments[segments.length - 1] === "responses") segments.pop();
      if (segments[segments.length - 1] === "chat") segments.pop();
      segments.push("models");
    }
    url.pathname = "/" + segments.join("/");
    return url.toString();
  } catch {
    return null;
  }
};

const fetchCustomModels = useCallback(async (chatUrl, apiKey) => {
  if (!chatUrl || customFetchingRef.current) return;
  const style = detectApiStyle(chatUrl);
  const modelsUrl = deriveModelsUrl(chatUrl);
  if (!modelsUrl) return;

  customFetchingRef.current = true;
  setLoadingCustomModels(true);
  setCustomModelError(null);
  try {
    const headers = style === "anthropic"
      ? (apiKey ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } : {})
      : (apiKey ? { Authorization: `Bearer ${apiKey}` } : {});

    const text = await invoke("http_get_json", { url: modelsUrl, headers });
    const data = JSON.parse(text);
    const list = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean);

    if (list.length > 0) {
      setCustomModels(list);
      setLoc((prev) => {
        if (!prev.modelName || !list.includes(prev.modelName)) {
          return { ...prev, modelName: list[0] };
        }
        return prev;
      });
    } else {
      setCustomModelError("No models returned by this endpoint");
    }
  } catch (err) {
    setCustomModelError(`Error: ${err}`);
  } finally {
    setLoadingCustomModels(false);
    customFetchingRef.current = false;
  }
}, []);

  const fetchOllamaModels = useCallback(async (url) => {
  if (!url || fetchingRef.current) return;
  fetchingRef.current = true;
  setLoadingModels(true);
  setModelError(null);
  try {
    const cleanUrl = url.trim().replace(/\/+$/, "");
    const text = await invoke("http_get_json", { url: `${cleanUrl}/api/tags`, headers: {} });
    const data = JSON.parse(text);
    const list = (data.models || []).map((m) => m.name);
    if (list.length > 0) {
      setOllamaModels(list);
      setLoc((prev) => {
        if (!prev.modelName || !list.includes(prev.modelName)) {
          return { ...prev, modelName: list[0] };
        }
        return prev;
      });
    } else {
      setModelError("No models found on Ollama server");
    }
  } catch (err) {
    setModelError(`Error: ${err}`);
  } finally {
    setLoadingModels(false);
    fetchingRef.current = false;
  }
}, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: "blur(6px)", background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }} transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className={`${bg} ${txt} rounded-2xl border ${brd} shadow-xl w-full max-w-md max-h-[88vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}>

        <div className={`flex items-center justify-between px-5 py-3.5 border-b ${brd}`}>
          <h2 className="font-semibold text-sm">Settings</h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${hov} transition-colors`}><X size={15} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Provider */}
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted} mb-1.5`}>API Provider</p>
            <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl mb-2.5 ${isDark ? "bg-[#181a1e]" : "bg-[#f1f5f9]"}`}>
              {[{ v: "ollama", l: "Ollama (Local)" }, { v: "custom", l: "Custom API" }].map(({ v, l }) => (
                <button key={v} onClick={() => set("provider", v)}
                  className={`py-2 rounded-lg border text-xs transition-all ${pill(loc.provider === v)}`}>{l}</button>
              ))}
            </div>

            {loc.provider === "ollama" && (
              <div className="space-y-2.5">
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted} mb-1`}>Ollama URL</p>
                  <input value={loc.ollamaUrl} onChange={(e) => set("ollamaUrl", e.target.value)}
                    placeholder="http://localhost:11434"
                    className={`w-full rounded-xl border px-3 py-2 text-xs ${inp} focus:outline-none focus:border-slate-400 transition-colors`} />
                  <p className={`text-[10px] ${muted} mt-1.5 leading-relaxed`}>
                  If running on a phone while Ollama runs on your computer, use your computer's local IP
                  instead of localhost, e.g. http://192.168.1.10:11434
                </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Model</p>
                    <button onClick={() => fetchOllamaModels(loc.ollamaUrl)}
                      disabled={loadingModels}
                      title="Refresh models"
                      className={`flex items-center gap-1 text-[10px] ${muted} hover:text-current transition-colors`}>
                      <RotateCw size={10} className={loadingModels ? "animate-spin" : ""} />
                      <span>Refresh</span>
                    </button>
                  </div>
                  {ollamaModels.length > 0 ? (
                    <select
                      value={loc.modelName}
                      onChange={(e) => set("modelName", e.target.value)}
                      className={`w-full rounded-xl border px-3 py-2 text-xs ${inp} focus:outline-none focus:border-slate-400 transition-colors cursor-pointer`}>
                      {ollamaModels.map((m) => (
                        <option key={m} value={m} className={isDark ? "bg-[#181a1e] text-white" : "bg-white text-slate-900"}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div>
                      <input value={loc.modelName} onChange={(e) => set("modelName", e.target.value)}
                        placeholder="llama3, mistral, deepseek-r1…"
                        className={`w-full rounded-xl border px-3 py-2 text-xs ${inp} focus:outline-none focus:border-slate-400 transition-colors`} />
                      {modelError && (
                        <p className="text-[10px] text-amber-500 mt-1">{modelError}</p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted} mb-1`}>Name for the model</p>
                  <input value={loc.modelDisplayName ?? ""} onChange={(e) => set("modelDisplayName", e.target.value)}
                    placeholder="e.g. Assistant, Fox, Llama…"
                    className={`w-full rounded-xl border px-3 py-2 text-xs ${inp} focus:outline-none focus:border-slate-400 transition-colors`} />
                </div>
              </div>
            )}

            {loc.provider === "custom" && (
              <div className="space-y-2.5">
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted} mb-1`}>Endpoint URL</p>
                  <input value={loc.customApiUrl} onChange={(e) => set("customApiUrl", e.target.value)}
                    placeholder="https://api.openai.com/v1/chat/completions"
                    className={`w-full rounded-xl border px-3 py-2 text-xs ${inp} focus:outline-none focus:border-slate-400 transition-colors`} />
                          <p className={`text-[10px] ${muted} mt-1.5 leading-relaxed`}>
                           Some AI providers may block the direct API connection (CORS policy).
                          If your request returns a network error, it may be the connection being blocked by the AI provider.
                        </p>
                </div>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted} mb-1`}>API Key</p>
                  <input value={loc.customApiKey} onChange={(e) => set("customApiKey", e.target.value)}
                    placeholder="API Key" type="password"
                    className={`w-full rounded-xl border px-3 py-2 text-xs ${inp} focus:outline-none focus:border-slate-400 transition-colors`} />
                    <p className={`text-[10px] ${muted} mt-1.5 leading-relaxed`}>
                    Your key is stored only in this browser and sent directly to the selected provider —
                    we never see it or store it anywhere.
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Model Name</p>
                    <button onClick={() => fetchCustomModels(loc.customApiUrl, loc.customApiKey)}
                      disabled={loadingCustomModels || !loc.customApiUrl}
                      title="Try to fetch model list"
                      className={`flex items-center gap-1 text-[10px] ${muted} hover:text-current transition-colors disabled:opacity-40`}>
                      <RotateCw size={10} className={loadingCustomModels ? "animate-spin" : ""} />
                      <span>Fetch models</span>
                    </button>
                  </div>
                  {customModels.length > 0 ? (
                    <select
                      value={loc.modelName}
                      onChange={(e) => set("modelName", e.target.value)}
                      className={`w-full rounded-xl border px-3 py-2 text-xs ${inp} focus:outline-none focus:border-slate-400 transition-colors cursor-pointer`}>
                      {customModels.map((m) => (
                        <option key={m} value={m} className={isDark ? "bg-[#181a1e] text-white" : "bg-white text-slate-900"}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div>
                      <input value={loc.modelName} onChange={(e) => set("modelName", e.target.value)}
                        placeholder="gpt-4o, claude-3-5-sonnet, mistral…"
                        className={`w-full rounded-xl border px-3 py-2 text-xs ${inp} focus:outline-none focus:border-slate-400 transition-colors`} />
                      {customModelError && (
                        <p className="text-[10px] text-amber-500 mt-1">{customModelError}</p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted} mb-1`}>Name for the model</p>
                  <input value={loc.modelDisplayName ?? ""} onChange={(e) => set("modelDisplayName", e.target.value)}
                    placeholder="e.g. Assistant, Fox, AI…"
                    className={`w-full rounded-xl border px-3 py-2 text-xs ${inp} focus:outline-none focus:border-slate-400 transition-colors`} />
                </div>
              </div>
            )}
          </div>

          {/* Max Response Length */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Max Response Length</p>
              <span className={`text-[10px] font-mono ${muted}`}>{loc.maxTokens.toLocaleString()} tokens</span>
            </div>
            <input
              type="range"
              min={256}
              max={8192}
              step={256}
              value={loc.maxTokens}
              onChange={(e) => set("maxTokens", Number(e.target.value))}
              className="w-full accent-slate-500 cursor-pointer"
            />
            <p className={`text-[10px] ${muted} mt-1.5 leading-relaxed`}>
              Upper limit on how long a single response can be (the model's max_tokens parameter). Lower values respond faster and use less quota; higher values allow longer answers.
            </p>
          </div>

          {/* User Name */}
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted} mb-1`}>Your Name</p>
            <input value={loc.userName} onChange={(e) => set("userName", e.target.value)}
              placeholder="Name you want the model to call you"
              className={`w-full rounded-xl border px-3 py-2 text-xs ${inp} focus:outline-none focus:border-slate-400 transition-colors`} />
          </div>

          {/* Font Selection */}
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted} mb-1.5`}>Font</p>
            <div className={`grid grid-cols-3 gap-1.5 p-1 rounded-xl ${isDark ? "bg-[#181a1e]" : "bg-[#f1f5f9]"}`}>
              {Object.entries(FONTS).map(([key, f]) => (
                <button key={key} onClick={() => set("font", key)}
                  style={{ fontFamily: f.value }}
                  className={`py-2 rounded-lg border text-xs transition-all ${pill(loc.font === key)}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Text Size */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Text Size</p>
              <span className={`text-[10px] font-mono ${muted}`}>{loc.fontSize}px</span>
            </div>
            <input
              type="range"
              min={12}
              max={20}
              step={1}
              value={loc.fontSize}
              onChange={(e) => set("fontSize", Number(e.target.value))}
              className="w-full accent-slate-500 cursor-pointer"
            />
          </div>

          {/* Mascot Toggle */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">Show Mascot</p>
                <p className={`text-[10px] ${muted} mt-0.5`}>Hide Cloudy from chat</p>
              </div>
              <button
                onClick={() => set("showMascot", !loc.showMascot)}
                className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                  loc.showMascot
                    ? (isDark ? "bg-slate-200" : "bg-slate-900")
                    : (isDark ? "bg-[#272a31]" : "bg-[#cbd5e1]")
                }`}>
                <motion.span
                  layout
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={`absolute top-0.5 w-5 h-5 rounded-full ${isDark ? "bg-[#121417]" : "bg-white"}`}
                  style={{ left: loc.showMascot ? "18px" : "2px" }}
                />
              </button>
            </div>

            <AnimatePresence>
              {loc.showMascot && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden">
                  <div className="flex items-center justify-between pt-3">
                    <div>
                      <p className="text-xs font-medium">Add Mascot Preferences</p>
                      <p className={`text-[10px] ${muted} mt-0.5`}>Let Cloudy's personality color every response, even with a custom prompt</p>
                    </div>
                    <button
                      onClick={() => set("mascotPersonaEnabled", !loc.mascotPersonaEnabled)}
                      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                        loc.mascotPersonaEnabled
                          ? (isDark ? "bg-slate-200" : "bg-slate-900")
                          : (isDark ? "bg-[#272a31]" : "bg-[#cbd5e1]")
                      }`}>
                      <motion.span
                        layout
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        className={`absolute top-0.5 w-5 h-5 rounded-full ${isDark ? "bg-[#121417]" : "bg-white"}`}
                        style={{ left: loc.mascotPersonaEnabled ? "18px" : "2px" }}
                      />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>


          {/* System Prompt Category */}
          <div className="pt-1">
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${muted} mb-1.5`}>System prompt</p>
            <div className={`grid grid-cols-3 gap-1.5 p-1 rounded-xl mb-2 ${isDark ? "bg-[#181a1e]" : "bg-[#f1f5f9]"}`}>
              {["Studying", "Dreaming", "Custom"].map((key) => (
                <button key={key} onClick={() => set("persona", key)}
                  className={`py-2 rounded-lg border text-xs transition-all ${pill(loc.persona === key)}`}>
                  {key}
                </button>
              ))}
            </div>

            <AnimatePresence>
              {loc.persona === "Custom" && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <textarea value={loc.customPrompt} onChange={(e) => set("customPrompt", e.target.value)}
                    placeholder="Type custom system prompt for the model…"
                    className={`w-full rounded-xl border px-3 py-2 text-xs resize-none ${inp} focus:outline-none focus:border-slate-400 transition-colors`}
                    rows={4} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="px-5 pb-5">
          <button onClick={() => { onSave(loc); onClose(); }}
            className={`w-full py-2.5 rounded-xl text-xs transition-colors ${buttonPrimary}`}>
            Save
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...ls.get("cozy_settings", {}) }));
  const [chats, setChats] = useState(() => {
    const raw = ls.get("cozy_chats", []);
    return raw.map((c) => ({
      ...c,
      messages: (c.messages || []).filter((m) => m && typeof m.content === "string"),
    }));
  });
  const [activeChatId, setActiveChatId] = useState(() => ls.get("cozy_active_chat", null));
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState(null);
  const [mascotState, setMascotState] = useState("idle");
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [greetingIndex, setGreetingIndex] = useState(() => Math.floor(Math.random() * GREETING_TEMPLATES.length));
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const currentRequestIdRef = useRef(null);
  const textareaRef = useRef(null);
  const streamRunRef = useRef(0);
  const isDark = settings.theme === "dark";
  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const messages = activeChat?.messages ?? [];
  const hasMessages = messages.length > 0;
  const currentFontFamily = FONTS[settings.font]?.value || FONTS.inter.value;

  useEffect(() => { ls.set("cozy_settings", settings); }, [settings]);
  
  const saveChatsTimer = useRef(null);

  useEffect(() => {
    clearTimeout(saveChatsTimer.current);

    saveChatsTimer.current = setTimeout(() => {
      ls.set("cozy_chats", chats);
    }, 400);

    return () => clearTimeout(saveChatsTimer.current);
  }, [chats]);
  
  useEffect(() => { ls.set("cozy_active_chat", activeChatId); }, [activeChatId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);
  useEffect(() => {
    if (!streaming) {
      inputRef.current?.focus();
    }
  }, [streaming, activeChatId]);

  useEffect(() => {
  const handleBeforeUnload = () => {
    if (currentRequestIdRef.current) {
      invoke("abort_stream", { requestId: currentRequestIdRef.current }).catch(() => {});
    }
  };
  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, []);

  const newChat = useCallback(() => {
    const id = uid();
    setGreetingIndex(Math.floor(Math.random() * GREETING_TEMPLATES.length));
    setChats((p) => [{ id, title: "New Chat", messages: [], createdAt: Date.now() }, ...p]);
    setActiveChatId(id);
    setInput("");
  }, []);

  const deleteChat = useCallback((id, e) => {
    e.stopPropagation();
    setChats((p) => {
      const next = p.filter((c) => c.id !== id);
      if (id === activeChatId) setActiveChatId(next[0]?.id ?? null);
      return next;
    });
  }, [activeChatId]);

  const getSystemPrompt = useCallback(() => {
  const base = settings.persona === "Custom"
    ? (settings.customPrompt || "You are a helpful assistant.")
    : (PERSONAS[settings.persona]?.prompt ?? PERSONAS.Studying.prompt);

  const parts = [base];
  if (settings.userName) parts.push(`User's name is ${settings.userName}.`);
  const modelCustomName = settings.modelDisplayName || settings.modelName;
  if (modelCustomName) parts.push(`Your name is ${modelCustomName}.`);
  if (settings.showMascot && settings.mascotPersonaEnabled) parts.push(MASCOT_PERSONA_PROMPT);
  return parts.join("\n\n").trim();
}, [
  settings.persona, settings.customPrompt, settings.userName,
  settings.modelDisplayName, settings.modelName,
  settings.showMascot, settings.mascotPersonaEnabled,
]);
  // Core stream runner with robust error protection
const streamResponse = useCallback(async (chatId, aId, apiMsgs) => {
  if (!apiMsgs || !apiMsgs.length) return;

  const runId = ++streamRunRef.current;
  const requestId = uid();
  currentRequestIdRef.current = requestId;

  setStreaming(true);
  setStreamingMsgId(aId);
  setMascotState("thinking");
  const thinkStartedAt = performance.now();

  await new Promise(requestAnimationFrame);
  ls.set("cozy_pending_stream", { chatId, aId, requestId });

  let buf = "";
  let lineBuffer = "";
  let isAnswering = false;
  let lastUpdate = 0;

  const applyToken = (token) => {
    if (!isAnswering) {
      isAnswering = true;
      const elapsed = performance.now() - thinkStartedAt;
      const delay = Math.max(0, MIN_THINKING_DISPLAY_MS - elapsed);
      const trigger = () => { if (streamRunRef.current === runId) setMascotState("answering"); };
      if (delay > 0) setTimeout(trigger, delay); else trigger();
    }
    buf += token;
    const now = performance.now();
    if (now - lastUpdate >= 40) {
      lastUpdate = now;
      const snap = buf;
      setChats((prev) => prev.map((c) => c.id === chatId
        ? { ...c, messages: c.messages.map((m) => m.id === aId ? { ...m, content: snap, isError: false } : m) }
        : c));
    }
  };

 const processRawChunk = (raw) => {
  lineBuffer += raw;
  const lines = lineBuffer.split("\n");
  lineBuffer = lines.pop() || "";
  for (const rawLine of lines) {
    const line = rawLine.startsWith("data:") ? rawLine.slice(5).trim() : rawLine.trim();
    if (!line || line === "[DONE]") continue;
    try {
      const parsed = JSON.parse(line);
      const token =
        parsed.message?.content ??               // Ollama
        parsed.choices?.[0]?.delta?.content ??    // OpenAI
        parsed.delta?.text ??                     // Anthropic content_block_delta
        "";
      if (token) applyToken(token);
    } catch {}
  }
};

  await new Promise(async (resolve) => {
    const unlistenChunk = await listen(`stream-chunk-${requestId}`, (e) => processRawChunk(e.payload));

    const finish = () => {
      unlistenChunk();
      unlistenDone();
      unlistenError();
      unlistenAborted();
      resolve();
    };

    const unlistenDone = await listen(`stream-done-${requestId}`, () => {
      ls.set("cozy_pending_stream", null);
      if (buf) {
        setChats((prev) => prev.map((c) => c.id === chatId
          ? { ...c, messages: c.messages.map((m) => m.id === aId ? { ...m, content: buf, isError: false } : m) }
          : c));
      }
      finish();
    });

    const unlistenError = await listen(`stream-error-${requestId}`, (e) => {
      const errMsg = e.payload;
      setChats((p) => p.map((c) => c.id === chatId
        ? {
            ...c,
            messages: c.messages.map((m) => {
              if (m.id === aId) {
                if (m.content && m.content.trim() && !m.content.startsWith("⚠️")) return { ...m, isError: true };
                return { ...m, content: `⚠️ **Error:** ${errMsg}`, isError: true };
              }
              return m;
            }),
          }
        : c));
      ls.set("cozy_pending_stream", null);
      finish();
    });

    const unlistenAborted = await listen(`stream-aborted-${requestId}`, () => {
      ls.set("cozy_pending_stream", null);
      finish();
    });

    try {
      const isOllama = settings.provider === "ollama";
      let url, headers, body;

      if (isOllama) {
        url = `${settings.ollamaUrl}/api/chat`;
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({
          model: settings.modelName,
          messages: apiMsgs,
          stream: true,
          options: { num_predict: settings.maxTokens },
        });
      } else {
        const style = detectApiStyle(settings.customApiUrl);
        url = normalizeChatUrl(settings.customApiUrl, style);

        if (style === "anthropic") {
          const systemMsg = apiMsgs.find((m) => m.role === "system");
          const restMsgs = apiMsgs.filter((m) => m.role !== "system");
          headers = {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            ...(settings.customApiKey ? { "x-api-key": settings.customApiKey } : {}),
          };
          body = JSON.stringify({
            model: settings.modelName,
            system: systemMsg?.content,
            messages: restMsgs,
            max_tokens: settings.maxTokens,
            stream: true,
          });
        } else {
          headers = {
            "Content-Type": "application/json",
            ...(settings.customApiKey ? { Authorization: `Bearer ${settings.customApiKey}` } : {}),
          };
          body = JSON.stringify({
            model: settings.modelName,
            messages: apiMsgs,
            stream: true,
            max_tokens: settings.maxTokens,
          });
        }
      }

      await invoke("stream_chat", { requestId, url, headers, body });
    } catch (err) {
      ls.set("cozy_pending_stream", null);
      setChats((p) => p.map((c) => c.id === chatId
        ? { ...c, messages: c.messages.map((m) => m.id === aId ? { ...m, content: `⚠️ **Error:** ${err}`, isError: true } : m) }
        : c));
      finish();
    }
  });

  if (streamRunRef.current === runId) {
    setStreaming(false);
    setStreamingMsgId(null);
    setMascotState("idle");
    currentRequestIdRef.current = null;
  }
}, [settings]);

  // Safely auto-resume on reload with debounce
 useEffect(() => {
  const pending = ls.get("cozy_pending_stream", null);
  if (!pending || !pending.chatId || !pending.aId) return;

  if (pending.requestId) {
    invoke("abort_stream", { requestId: pending.requestId }).catch(() => {});
  }

  const timer = setTimeout(() => {
    const chat = chats.find((c) => c.id === pending.chatId);
    if (!chat) return;

    const msgIndex = chat.messages.findIndex((m) => m.id === pending.aId);
    if (msgIndex === -1) return;

    const priorMsgs = chat.messages.slice(0, msgIndex);
    const validPrior = priorMsgs
      .filter((m) => m && m.content && m.content.trim() && !m.content.startsWith("⚠️"))
      .map((m) => ({ role: m.role, content: m.content.trim() }));

    if (validPrior.length > 0) {
      const apiMsgs = [
        { role: "system", content: getSystemPrompt() },
        ...validPrior,
      ];
      streamResponse(pending.chatId, pending.aId, apiMsgs);
    }
  }, 350);

  return () => clearTimeout(timer);
}, []);

const chatsRef = useRef(chats);
useEffect(() => { chatsRef.current = chats; }, [chats]);

const regenerateResponse = useCallback((chatId, aId) => {
  if (streaming) return;
  const chat = chatsRef.current.find((c) => c.id === chatId);
  if (!chat) return;

  const msgIndex = chat.messages.findIndex((m) => m.id === aId);
  if (msgIndex === -1) return;

  setChats((prev) => prev.map((c) => c.id === chatId
    ? { ...c, messages: c.messages.map((m) => m.id === aId ? { ...m, content: "", isError: false } : m) }
    : c));

  const priorMsgs = chat.messages.slice(0, msgIndex);
  const validPrior = priorMsgs
    .filter((m) => m && m.content && m.content.trim() && !m.content.startsWith("⚠️"))
    .map((m) => ({ role: m.role, content: m.content.trim() }));

  if (validPrior.length > 0) {
    const apiMsgs = [{ role: "system", content: getSystemPrompt() }, ...validPrior];
    streamResponse(chatId, aId, apiMsgs);
  }
}, [streaming, getSystemPrompt, streamResponse]);

const handleRegenerate = useCallback((msgId) => {
  regenerateResponse(activeChatId, msgId);
}, [regenerateResponse, activeChatId]); 

const sendMessage = useCallback(async () => {
  const text = input.trim();
  if (!text || streaming) return;

  let chatId = activeChatId;
  if (!chatId) {
    chatId = uid();
    setChats((p) => [{ id: chatId, title: text.slice(0, 36), messages: [], createdAt: Date.now() }, ...p]);
    setActiveChatId(chatId);
  }

  const prior = (chats.find((c) => c.id === chatId)?.messages ?? [])
    .filter((m) => m && m.content && m.content.trim() && !m.content.startsWith("⚠️"));

  const userMsg = { id: uid(), role: "user", content: text, ts: Date.now() };
  const aId = uid();
  const aMsg = { id: aId, role: "assistant", content: "", ts: Date.now() };

  setChats((p) => p.map((c) => c.id === chatId
    ? {
        ...c,
        title: c.messages.length === 0 ? text.slice(0, 36) : c.title,
        messages: [...c.messages.filter((m) => m && m.content && m.content.trim()), userMsg, aMsg],
      }
    : c));
  setInput("");
  if (textareaRef.current) textareaRef.current.style.height = "auto";

  const apiMsgs = [
    { role: "system", content: getSystemPrompt() },
    ...prior.map((m) => ({ role: m.role, content: m.content.trim() })),
    { role: "user", content: text },
  ];

  streamResponse(chatId, aId, apiMsgs);
}, [input, streaming, activeChatId, chats, getSystemPrompt, streamResponse]);

const handleKey = (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
};

  // ── Theme tokens (Silver light mode & Dark Gray dark mode) ──
  const bg = isDark ? "bg-[#0b0c0e]" : "bg-[#e4e7eb]";
  const sidebarBg = isDark ? "bg-[#141518]" : "bg-[#d8dce2]";
  const sideBorder = isDark ? "border-[#22242a]" : "border-[#cbd5e1]";
  const txt = isDark ? "text-[#f1f5f9]" : "text-[#0f172a]";
  const muted = isDark ? "text-[#71717a]" : "text-[#64748b]";
  const hov = isDark ? "hover:bg-white/5" : "hover:bg-black/5";
  const activeItem = isDark ? "bg-white/10 text-[#f1f5f9]" : "bg-black/10 text-[#0f172a]";
  const userTxt = isDark ? "text-[#f1f5f9]" : "text-[#0f172a]";
  const userBg = isDark ? "bg-[#1e2229]" : "bg-[#d1d5db]";
  const inpBg = isDark ? "bg-[#16181d]" : "bg-white";
  const inpBorder = isDark ? "border-[#272a31]" : "border-[#cbd5e1]";

  return (
    <div className={`${bg} ${txt} flex h-screen overflow-hidden transition-colors duration-200`}
      style={{ fontFamily: currentFontFamily }}>

      {/* ─── Sidebar ─── */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside key="sb"
            initial={{ width: 0, opacity: 0 }} animate={{ width: 240, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`${sidebarBg} border-r ${sideBorder} flex flex-col overflow-hidden flex-shrink-0 transition-colors duration-200`}>

            {/* New Chat Button */}
            <div className="px-3 pt-3.5 pb-2">
              <button onClick={newChat}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${muted} ${hov} border ${sideBorder} transition-all`}>
                <Plus size={14} />
                New Chat
              </button>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
              <AnimatePresence>
                {chats.map((chat) => (
                  <motion.div key={chat.id} layout
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.12 }}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${chat.id === activeChatId ? activeItem : `${muted} ${hov}`}`}
                    onClick={() => { if (editingId !== chat.id) setActiveChatId(chat.id); }}>
                    <MessageSquare size={13} className="flex-shrink-0 opacity-40" />
                    {editingId === chat.id
                      ? <input value={editVal}
                          onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { setChats((p) => p.map((c) => c.id === chat.id ? { ...c, title: editVal } : c)); setEditingId(null); }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => { setChats((p) => p.map((c) => c.id === chat.id ? { ...c, title: editVal } : c)); setEditingId(null); }}
                          autoFocus className="flex-1 text-xs bg-transparent outline-none min-w-0"
                          onClick={(e) => e.stopPropagation()} />
                      : <span className="flex-1 text-xs truncate font-medium">{chat.title}</span>
                    }
                    <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(chat.id); setEditVal(chat.title); }}
                        className={`p-1 rounded ${hov}`}><Pencil size={10} /></button>
                      <button onClick={(e) => deleteChat(chat.id, e)}
                        className="p-1 rounded hover:text-red-400 transition-colors"><Trash2 size={10} /></button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Bottom Controls: Theme Switcher & Settings */}
            <div className={`px-3 py-2.5 border-t ${sideBorder} flex items-center justify-between`}>
              <button onClick={() => setSettings((p) => ({ ...p, theme: p.theme === "dark" ? "light" : "dark" }))}
                title="Toggle Theme"
                className={`p-2 rounded-lg ${muted} ${hov} transition-all`}>
                {isDark ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button onClick={() => setShowSettings(true)}
                title="Settings"
                className={`p-2 rounded-lg ${muted} ${hov} transition-all`}>
                <Settings size={15} />
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ─── Main Canvas ─── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">

        {/* Sidebar Toggle Button */}
        <button
          onClick={() => setSidebarOpen((p) => !p)}
          title="Toggle Sidebar"
          className={`absolute top-3.5 left-3.5 z-10 p-1.5 rounded-lg ${muted} ${hov} transition-all`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Message Feed / Minimal Empty State */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {!hasMessages ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full gap-2 px-6 pb-12">
                {settings.showMascot && (
                  <div className="cursor-pointer" onClick={() => setGreetingIndex((p) => (p + 1) % GREETING_TEMPLATES.length)} title="Click to change greeting">
                    <FoxMascot state={mascotState} size={420} isDark={isDark} />
                  </div>
                )}
                <motion.p
                  key={greetingIndex}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => setGreetingIndex((p) => (p + 1) % GREETING_TEMPLATES.length)}
                  className={`text-base md:text-lg font-medium cursor-pointer select-none transition-colors ${muted} hover:text-current`}>
                  {GREETING_TEMPLATES[greetingIndex](settings.userName || "Friend")}
                </motion.p>
              </motion.div>
            ) : (
              /* ── Active Chat Messages ── */
              <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="max-w-2xl mx-auto px-6 pt-12 pb-6 space-y-6">
                  {messages.map((msg) => (
                    <motion.div key={msg.id}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}>
                      <ChatMessage
                        msg={msg}
                        isDark={isDark}
                        fontSize={settings.fontSize}
                        isStreamingThis={streaming && msg.id === streamingMsgId}
                        showRegenerate={!streaming}
                        onRegenerate={handleRegenerate}
                        userBg={userBg}
                        userTxt={userTxt}
                        muted={muted}
                        hov={hov}
                      />
                    </motion.div>
                  ))}
                  <div ref={endRef} />
                </div>
              </motion.div>
            )}
            </AnimatePresence>
        </div>

        {/* Mascot in active chat bottom corner (256px Mascot Size) */}
        {hasMessages && settings.showMascot && (
          <div className="absolute bottom-20 right-6 pointer-events-none opacity-80">
            <FoxMascot state={mascotState} size={256} isDark={isDark} />
          </div>
        )}

        {/* ── Input Box (Vertically Centered Single Line with Auto-Expansion) ── */}
        <div className="px-4 py-3.5 flex-shrink-0">
          <div className={`max-w-2xl mx-auto ${inpBg} border ${inpBorder} rounded-2xl px-4 py-2 flex items-center gap-2.5 shadow-sm transition-all duration-150`}>
            <textarea
              ref={(el) => { inputRef.current = el; textareaRef.current = el; }}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px";
              }}
              onKeyDown={handleKey}
              rows={1}
              placeholder="Message…"
              disabled={streaming}
              className={`flex-1 bg-transparent resize-none outline-none py-1.5 leading-5 block ${isDark ? "text-[#f1f5f9] placeholder-[#52525b]" : "text-[#0f172a] placeholder-[#94a3b8]"}`}
              style={{ maxHeight: 180, fontSize: `${settings.fontSize}px` }}
            />
            <div className="flex items-center gap-1 flex-shrink-0">
            {streaming && (
              <button onClick={() => invoke("abort_stream", { requestId: currentRequestIdRef.current })}
                className={`p-1.5 rounded-lg ${muted} ${hov} transition-all`}><X size={14} /></button>
            )}
              <motion.button onClick={sendMessage} disabled={!input.trim() || streaming} whileTap={{ scale: 0.9 }}
                className={`p-2 rounded-xl transition-all ${input.trim() && !streaming
                  ? (isDark ? "bg-slate-200 text-slate-950 hover:bg-white" : "bg-slate-900 text-white hover:bg-slate-800")
                  : `${muted} opacity-25 cursor-not-allowed`}`}>
                <Send size={14} />
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <SettingsModal settings={settings} onSave={setSettings} onClose={() => setShowSettings(false)} isDark={isDark} />
        )}
      </AnimatePresence>
    </div>
  );
}
