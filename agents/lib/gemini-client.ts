/**
 * LLM client — Gemini 2.0 Flash (primary, free) + DeepSeek V3 (fallback)
 * Only called when risky positions exist — no wasted API calls.
 */

const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const GEMINI_URL  = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export interface LLMResponse {
  text:  string;
  model: string;
}

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    signal:  AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
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
      max_tokens: 400,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

export async function callLLM(prompt: string): Promise<LLMResponse> {
  // Gemini first (free)
  try {
    const text = await callGemini(prompt);
    return { text, model: "gemini-2.0-flash" };
  } catch (e: any) {
    console.warn(`  [coordinator] Gemini failed (${e.message}), trying DeepSeek...`);
  }

  // DeepSeek fallback (paid but cheap)
  try {
    const text = await callDeepSeek(prompt);
    return { text, model: "deepseek-chat" };
  } catch (e: any) {
    throw new Error(`Both LLMs failed. Last error: ${e.message}`);
  }
}
