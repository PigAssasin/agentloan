"use client";

import { useEffect } from "react";
import { useIsMobile } from "../../hooks/use-is-mobile";

export function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title?: string }) {
  const isMobile = useIsMobile();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      alignItems: isMobile ? "flex-end" : "center",
      justifyContent: "center",
      padding: isMobile ? 0 : 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%",
        maxWidth: isMobile ? "100%" : 480,
        background: "#ffffff",
        border: "4px solid #000000",
        borderBottom: isMobile ? "none" : "4px solid #000000",
        padding: isMobile ? "24px 20px" : 32,
        position: "relative",
        /* Slide up on mobile — add a subtle top-rounded feel via larger padding-top */
        borderTop: "4px solid #000000",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 16, right: 16,
          background: "none", border: "2px solid #000000",
          width: 32, height: 32, cursor: "pointer",
          fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 14,
        }}>✕</button>
        {title && (
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: isMobile ? 22 : 28, marginBottom: 24, paddingRight: 40 }}>
            {title.toUpperCase()}
          </h3>
        )}
        {children}
      </div>
    </div>
  );
}

export function OverviewRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: "1px solid #000000",
    }}>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999" }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: accent ? "#008000" : "#000000", fontWeight: 700 }}>
        {value}
      </span>
    </div>
  );
}
