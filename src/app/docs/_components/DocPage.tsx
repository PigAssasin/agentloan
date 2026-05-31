import Link from "next/link";

interface Props {
  title: string;
  description?: string;
  children: React.ReactNode;
  prev?: { label: string; href: string };
  next?: { label: string; href: string };
}

export function DocPage({ title, description, children, prev, next }: Props) {
  return (
    <article>
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 40, marginBottom: 12, lineHeight: 1 }}>
        {title.toUpperCase()}
      </h1>
      {description && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "#666", lineHeight: 1.7, marginBottom: 40, maxWidth: 620 }}>
          {description}
        </p>
      )}
      <div style={{ borderTop: "3px solid #000", paddingTop: 40 }}>
        {children}
      </div>
      {(prev || next) && (
        <div style={{ marginTop: 64, borderTop: "3px solid #000", paddingTop: 24, display: "flex", justifyContent: "space-between" }}>
          {prev ? (
            <Link href={prev.href} style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#000", textDecoration: "none" }}>
              ← {prev.label}
            </Link>
          ) : <span />}
          {next && (
            <Link href={next.href} style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#000", textDecoration: "none" }}>
              {next.label} →
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

export function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 24, marginBottom: 32 }}>
      <div style={{ width: 36, height: 36, background: "#000", color: "#fff", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {n}
      </div>
      <div>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, marginBottom: 8 }}>{title.toUpperCase()}</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.7 }}>{children}</div>
      </div>
    </div>
  );
}

export function InfoBox({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "3px solid #000", padding: "20px 24px", marginBottom: 32, borderLeft: "6px solid #000" }}>
      {title && <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{title}</div>}
      <div style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.7, color: "#333" }}>{children}</div>
    </div>
  );
}

export function WarnBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: "3px solid #FFA500", padding: "16px 20px", marginBottom: 32, background: "#fffbf0" }}>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.7, color: "#333" }}>{children}</div>
    </div>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{ fontFamily: "var(--font-mono)", fontSize: 13, background: "#f5f5f5", border: "1px solid #ddd", padding: "2px 6px" }}>
      {children}
    </code>
  );
}

export function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div style={{ border: "3px solid #000", marginBottom: 32, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#000" }}>
            {headers.map(h => (
              <th key={h} style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#fff", padding: "10px 16px", textAlign: "left" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: "2px solid #000", background: i % 2 === 1 ? "#f9f9f9" : "#fff" }}>
              {row.map((cell, j) => (
                <td key={j} style={{ fontFamily: j === 0 ? "var(--font-mono)" : "var(--font-body)", fontSize: 13, padding: "12px 16px", color: "#000" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
