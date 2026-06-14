import { NextRequest } from "next/server";
import { supabaseAdmin }         from "@/lib/supabase";
import { encryptKey, decryptKey } from "@/lib/agent-helpers";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address) return Response.json({ error: "address required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("user_agent_subscriptions")
    .select("hf_target,enabled,llm_provider,llm_api_key_enc,llm_base_url,last_llm_call_at")
    .eq("wallet_address", address)
    .eq("agent_type", "personal")
    .single();

  if (error && error.code !== "PGRST116") {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const { data: tg } = await supabaseAdmin
    .from("telegram_connections")
    .select("chat_id")
    .eq("wallet_address", address)
    .single();

  return Response.json({
    enabled:      data?.enabled      ?? false,
    hfTarget:     data?.hf_target    ?? 1.3,
    llmProvider:  data?.llm_provider ?? null,
    hasLlmKey:    !!data?.llm_api_key_enc,
    llmBaseUrl:   data?.llm_base_url ?? null,
    hasTelegram:  !!tg?.chat_id,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { address, hfTarget, enabled, llmProvider, llmApiKey, llmBaseUrl } = body;

  if (!address) {
    return Response.json({ error: "address required" }, { status: 400 });
  }
  // Testnet: no signature required — settings are non-critical

  const update: Record<string, unknown> = {
    wallet_address: address.toLowerCase(),
    agent_type:     "personal",
  };
  if (hfTarget !== undefined) {
    const t = Number(hfTarget);
    if (!isFinite(t) || t < 1.1 || t > 3.0) {
      return Response.json({ error: "hfTarget must be between 1.1 and 3.0" }, { status: 400 });
    }
    update.hf_target = t;
  }
  if (enabled  !== undefined) update.enabled       = enabled;
  if (llmProvider !== undefined) update.llm_provider = llmProvider;
  if (llmBaseUrl  !== undefined) update.llm_base_url = llmBaseUrl;
  if (llmApiKey)                 update.llm_api_key_enc = encryptKey(llmApiKey);

  const { error } = await supabaseAdmin
    .from("user_agent_subscriptions")
    .upsert(update, { onConflict: "wallet_address,agent_type" });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
