import crypto from "crypto";

const ALGO = "aes-256-cbc";
const KEY  = () => Buffer.from(process.env.LLM_ENCRYPTION_KEY!, "hex");

export function encryptKey(plaintext: string): string {
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY(), iv);
  const enc    = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

export function decryptKey(encrypted: string): string {
  const [ivHex, encHex] = encrypted.split(":");
  const iv      = Buffer.from(ivHex, "hex");
  const enc     = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, KEY(), iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => {}); // never throw
}

export function formatAgentStatus(wallet: string, sub: any, hf: number | null): string {
  const hfStr    = hf !== null ? hf.toFixed(3) : "—";
  const status   = sub?.enabled ? "● ACTIVE" : "○ INACTIVE";
  const target   = sub?.hf_target ?? 1.3;
  return [
    `<b>Personal Agent</b>  ${status}`,
    `Wallet: <code>${wallet.slice(0, 10)}...${wallet.slice(-6)}</code>`,
    `HF: <b>${hfStr}</b>  |  Target: ${target}`,
  ].join("\n");
}
