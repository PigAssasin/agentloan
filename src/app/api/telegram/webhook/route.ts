import { NextRequest }                      from "next/server";
import { supabaseAdmin }                    from "@/lib/supabase";
import { sendTelegram, formatAgentStatus }  from "@/lib/agent-helpers";
import { createPublicClient, http, parseAbi } from "viem";
import { ARC_TESTNET_CONTRACTS }            from "../../../../../config/contracts";

const arcChain = {
  id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const client = createPublicClient({ chain: arcChain, transport: http() });
const POOL_ABI = parseAbi(["function getUserAccountData(address) external view returns (uint256,uint256,uint256,uint256,uint256,uint256)"]);

async function getHFSafe(address: string): Promise<number | null> {
  try {
    const result = await Promise.race([
      client.readContract({
        address: ARC_TESTNET_CONTRACTS.LENDING_POOL,
        abi: POOL_ABI, functionName: "getUserAccountData",
        args: [address as `0x${string}`],
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]) as bigint[];
    return Number(result[5]) / 1e18;
  } catch { return null; }
}

async function processMessage(chatId: string, text: string) {
  // /start — link wallet (handles both text command and deep link payload)
  const startMatch = text.match(/^\/start\s+(0x[0-9a-fA-F]{40})/i);
  if (startMatch) {
    const wallet = startMatch[1].toLowerCase();
    await supabaseAdmin.from("telegram_connections").upsert({
      wallet_address: wallet, chat_id: chatId,
    });
    await sendTelegram(chatId,
      `✅ <b>Wallet linked!</b>\n<code>${wallet}</code>\n\nCommands:\n/status — HF &amp; agent state\n/enable — turn on agent\n/disable — turn off agent\n/hf 1.4 — set HF target\n/history — last 5 actions`
    );
    return;
  }

  if (text === "/start") {
    await sendTelegram(chatId, `Send your wallet address:\n<code>/start 0xYOUR_WALLET_ADDRESS</code>`);
    return;
  }

  // Find wallet for this chat
  const { data: conn } = await supabaseAdmin
    .from("telegram_connections").select("wallet_address").eq("chat_id", chatId).single();
  if (!conn) {
    await sendTelegram(chatId, "Link your wallet first:\n<code>/start 0xYOUR_WALLET</code>");
    return;
  }
  const wallet = conn.wallet_address;

  if (text === "/status") {
    const [sub, hf] = await Promise.all([
      supabaseAdmin.from("user_agent_subscriptions").select("*").eq("wallet_address", wallet).single().then(r => r.data),
      getHFSafe(wallet),
    ]);
    await sendTelegram(chatId, formatAgentStatus(wallet, sub, hf));
    return;
  }

  if (text === "/enable") {
    await supabaseAdmin.from("user_agent_subscriptions")
      .upsert({ wallet_address: wallet, agent_type: "personal", enabled: true }, { onConflict: "wallet_address,agent_type" });
    await sendTelegram(chatId, "✅ Personal Agent <b>enabled</b>.\nWatching your position 24/7.");
    return;
  }

  if (text === "/disable") {
    await supabaseAdmin.from("user_agent_subscriptions")
      .upsert({ wallet_address: wallet, agent_type: "personal", enabled: false }, { onConflict: "wallet_address,agent_type" });
    await sendTelegram(chatId, "⏸ Personal Agent <b>disabled</b>.");
    return;
  }

  const hfMatch = text.match(/^\/hf\s+([0-9.]+)$/);
  if (hfMatch) {
    const t = parseFloat(hfMatch[1]);
    if (t < 1.1 || t > 3.0) {
      await sendTelegram(chatId, "HF target must be between 1.1 and 3.0");
      return;
    }
    await supabaseAdmin.from("user_agent_subscriptions")
      .upsert({ wallet_address: wallet, agent_type: "personal", hf_target: t }, { onConflict: "wallet_address,agent_type" });
    await sendTelegram(chatId, `✅ HF target set to <b>${t}</b>`);
    return;
  }

  if (text === "/history") {
    const { data: actions } = await supabaseAdmin.from("agent_actions")
      .select("action,amount_usd,hf_before,hf_after,created_at")
      .eq("wallet_address", wallet).order("created_at", { ascending: false }).limit(5);
    if (!actions?.length) { await sendTelegram(chatId, "No actions yet."); return; }
    const lines = actions.map(a =>
      `${a.action}: $${(a.amount_usd ?? 0).toFixed(0)}  HF ${(a.hf_before ?? 0).toFixed(2)}→${(a.hf_after ?? 0).toFixed(2)}`
    );
    await sendTelegram(chatId, "<b>Last actions:</b>\n" + lines.join("\n"));
    return;
  }

  await sendTelegram(chatId, "Commands: /status /enable /disable /hf [target] /history");
}

export async function POST(req: NextRequest) {
  // Validate Telegram secret token
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return Response.json({ ok: false }, { status: 403 });
  }

  const body = await req.json();
  const msg  = body.message;
  if (!msg?.text) return Response.json({ ok: true });

  const chatId = msg.chat.id.toString();
  const text   = msg.text.trim();

  // Respond immediately — process async to avoid Telegram 5s timeout
  processMessage(chatId, text).catch(console.error);
  return Response.json({ ok: true });
}
