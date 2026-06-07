import { NextRequest } from "next/server";
import { supabaseAdmin }         from "@/lib/supabase";
import { encryptKey, decryptKey } from "@/lib/agent-helpers";
import { verifyMessage }          from "viem";

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
  const { address, hfTarget, enabled, llmProvider, llmApiKey, llmBaseUrl, signature, message } = body;

  if (!address || !signature || !message) {
    return Response.json({ error: "address, signature, message required" }, { status: 400 });
  }

  // Verify wallet ownership via EIP-191 personal sign
  try {
    const recovered = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature,
    });
    if (!recovered) throw new Error("invalid");
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const update: Record<string, unknown> = {
    wallet_address: address.toLowerCase(),
    agent_type:     "personal",
  };
  if (hfTarget !== undefined) update.hf_target    = hfTarget;
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
