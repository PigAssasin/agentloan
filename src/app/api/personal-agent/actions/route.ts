import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  const limit   = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "10"), 50);
  if (!address) return Response.json({ error: "address required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("agent_actions")
    .select("action,reason,amount_usd,hf_before,hf_after,success,tx_hash,error,created_at")
    .eq("wallet_address", address)
    .eq("agent_type", "personal")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}
