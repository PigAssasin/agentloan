/**
 * Rolling memory for Coordinator Agent.
 * Keeps last 20 decisions + auto-summary so prompt size stays constant.
 */
import * as fs   from "fs";
import * as path from "path";

const MEMORY_FILE  = "agents/state/coordinator-memory.json";
const MAX_ENTRIES  = 20;

export interface MemoryEntry {
  ts:       number;
  positions: Array<{ address: string; hf: number; debtUSD: number; bonus: number }>;
  priority: string[];
  model:    string;
  outcome:  "success" | "front_run" | "no_profit" | "pending" | null;
  profitUSD: number;
}

export interface CoordinatorMemory {
  summary:   string;
  decisions: MemoryEntry[];
}

export function loadMemory(): CoordinatorMemory {
  const file = path.resolve(MEMORY_FILE);
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  }
  return { summary: "No history yet.", decisions: [] };
}

export function saveMemory(mem: CoordinatorMemory): void {
  const file = path.resolve(MEMORY_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(mem, null, 2), "utf8");
}

export function addDecision(
  mem:      CoordinatorMemory,
  entry:    Omit<MemoryEntry, "outcome" | "profitUSD">,
): CoordinatorMemory {
  const newEntry: MemoryEntry = { ...entry, outcome: "pending", profitUSD: 0 };
  const decisions = [...mem.decisions, newEntry].slice(-MAX_ENTRIES);

  // Auto-summarize when we have enough data
  const summary = buildSummary(decisions);

  return { summary, decisions };
}

export function updateOutcome(
  mem:      CoordinatorMemory,
  address:  string,
  outcome:  MemoryEntry["outcome"],
  profitUSD: number,
): CoordinatorMemory {
  const decisions = mem.decisions.map(d =>
    d.priority[0] === address && d.outcome === "pending"
      ? { ...d, outcome, profitUSD }
      : d
  );
  return { ...mem, decisions, summary: buildSummary(decisions) };
}

function buildSummary(decisions: MemoryEntry[]): string {
  const completed = decisions.filter(d => d.outcome && d.outcome !== "pending");
  if (completed.length === 0) return "No completed liquidations yet.";

  const success   = completed.filter(d => d.outcome === "success").length;
  const frontRun  = completed.filter(d => d.outcome === "front_run").length;
  const totalProfit = completed.reduce((s, d) => s + d.profitUSD, 0);

  const largePositions = completed.filter(d =>
    d.positions.some(p => p.debtUSD > 50_000) && d.outcome === "front_run"
  ).length;

  const lines = [
    `Total: ${completed.length} liquidations, ${success} success, ${frontRun} front-run.`,
    `Total profit: $${totalProfit.toFixed(0)} USD.`,
  ];

  if (frontRun > 0) {
    const pct = Math.round((frontRun / completed.length) * 100);
    lines.push(`Front-run rate: ${pct}%. ${largePositions > 0 ? "Large positions (>$50k) especially at risk." : ""}`);
  }

  if (completed.length >= 5) {
    const avgProfit = totalProfit / success || 0;
    lines.push(`Avg profit per success: $${avgProfit.toFixed(0)}.`);
  }

  return lines.join(" ");
}

export function formatMemoryForPrompt(mem: CoordinatorMemory): string {
  const recent = mem.decisions
    .filter(d => d.outcome !== "pending")
    .slice(-5)
    .map(d => `  - Chose ${d.priority[0]?.slice(0, 10)} → outcome: ${d.outcome}, profit: $${d.profitUSD}`)
    .join("\n");

  return `HISTORY SUMMARY: ${mem.summary}\nRECENT DECISIONS:\n${recent || "  None yet."}`;
}
