"use client";

import { TokenIcon } from "../../components/shared/TokenIcon";
import { MOCK_RESERVES } from "../../lib/mock-data";

export default function MarketsPage() {
  const totalSupplied = MOCK_RESERVES.reduce((a, r) => a + Number(r.totalDeposited) / 1e6, 0);
  const totalBorrowed = MOCK_RESERVES.reduce((a, r) => a + Number(r.totalBorrowed)  / 1e6, 0);

  return (
    <div style={{ maxWidth: "var(--page-max-width)", margin: "0 auto", padding: "32px 24px" }}>

      {/* Header */}
      <div style={{ marginBottom: 32, borderBottom: "4px solid #000000", paddingBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 48, marginBottom: 0 }}>
          MARKETS
        </h1>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, marginBottom: 32, border: "4px solid #000000" }}>
        {[
          { label: "Total Market Size", value: `$${totalSupplied.toFixed(2)}` },
          { label: "Total Borrowed",    value: `$${totalBorrowed.toFixed(2)}` },
          { label: "Active Markets",    value: String(MOCK_RESERVES.length) },
        ].map(({ label, value }, i) => (
          <div key={label} style={{ padding: "20px 24px", borderRight: i < 2 ? "4px solid #000000" : "none" }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999", marginBottom: 8 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <table className="rawblock-table">
        <thead>
          <tr>
            {["Asset", "Total Supplied", "Supply APY", "Total Borrowed", "Borrow APY"].map(h => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOCK_RESERVES.map(r => {
            const sup  = Number(r.totalDeposited) / 1e6;
            const bor  = Number(r.totalBorrowed)  / 1e6;
            const util = sup > 0 ? Math.round((bor/sup)*100) : 0;
            return (
              <tr key={r.symbol}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <TokenIcon symbol={r.symbol} size={28} />
                    <div>
                      <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{r.symbol}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>
                    {sup >= 1e6 ? `$${(sup/1e6).toFixed(2)}M` : `$${sup.toLocaleString()}`}
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "#999999" }}>Util {util}%</div>
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#008000" }}>
                  {r.supplyAPY}
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>
                  {bor > 0 ? (bor >= 1e6 ? `$${(bor/1e6).toFixed(2)}M` : `$${bor.toLocaleString()}`) : "N/A"}
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: r.borrowAPY === "N/A" ? "#999999" : "#FFA500" }}>
                  {r.borrowAPY}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
