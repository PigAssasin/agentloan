// Telegram notification for liquidation events.
// Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.local to enable.

const TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function notify(message: string): Promise<void> {
  if (!TOKEN || !CHAT_ID) return; // silently skip if not configured

  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "HTML" }),
    });
  } catch {
    // Notification failure never crashes the bot
  }
}

export function liquidationMessage(
  borrower: string,
  debtRepaid: string,
  collToken: string,
  txHash: string,
): string {
  return [
    `🤖 <b>AgentLoan Liquidation</b>`,
    ``,
    `Borrower: <code>${borrower.slice(0, 10)}...${borrower.slice(-6)}</code>`,
    `Repaid:   <b>${debtRepaid} xUSDC</b>`,
    `Collateral seized from: <code>${collToken.slice(0, 10)}...</code>`,
    `TX: <a href="https://testnet.arcscan.app/tx/${txHash}">${txHash.slice(0, 14)}...</a>`,
  ].join("\n");
}
