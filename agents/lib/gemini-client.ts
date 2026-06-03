/**
 * LLM client — Gemini 2.5 Flash (primary) + DeepSeek V3 (fallback)
 * Only called when risky positions exist AND state has changed.
 */

const GEMINI_API_KEY   = process.env.GEMINI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// gemini-2.5-flash with thinkingBudget=0 — disables thinking, full output, cheapest
const GEMINI_URL   = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export interface LLMResponse {
  text:  string;
  model: string;
}

// State cache — skip LLM call if positions haven't changed significantly
let lastStateHash = "";
let lastCallTime  = 0;
const MIN_CALL_INTERVAL_MS = 60_000; // minimum 60s between calls

export function shouldCallLLM(stateHash: string): boolean {
  const now = Date.now();
  // Skip if same state AND called recently
  if (stateHash === lastStateHash && now - lastCallTime < MIN_CALL_INTERVAL_MS) {
    return false;
  }
  return true;
}

export function markCalled(stateHash: string): void {
  lastStateHash = stateHash;
  lastCallTime  = Date.now();
}

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 600,
        thinkingConfig: { thinkingBudget: 0 },  // disable thinking tokens
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 100)}`);
  }
  const data = await res.json();
  return data.candidates[0].content.parts[0].text as string;
}

async function callDeepSeek(prompt: string): Promise<string> {
  if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY not set");

  const res = await fetch(DEEPSEEK_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    body:    JSON.stringify({
      model:      "deepseek-chat",
      messages:   [{ role: "user", content: prompt }],
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

export async function callLLM(prompt: string): Promise<LLMResponse> {
  try {
    const text = await callGemini(prompt);
    return { text, model: "gemini-2.5-flash" };
  } catch (e: any) {
    console.warn(`  [coordinator] Gemini failed (${e.message}), trying DeepSeek...`);
  }

  try {
    const text = await callDeepSeek(prompt);
    return { text, model: "deepseek-chat" };
  } catch (e: any) {
    throw new Error(`Both LLMs failed. Last error: ${e.message}`);
  }
}
