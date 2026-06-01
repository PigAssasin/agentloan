"use client";

import { useEffect, useRef } from "react";
import { useReserveData }    from "../../hooks/use-lending-pool";

export function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { reserves } = useReserveData();

  // Real on-chain values — fallback to 0 before data loads
  const btcBorrowApy  = reserves["xclrBTC"]?.borrowApy  ?? 0;
  const eurcBorrowApy = reserves["xEURC"]?.borrowApy    ?? 0;
  const usdcBorrowApy = reserves["xUSDC"]?.borrowApy    ?? 0;
  const usdcSupplyApy = reserves["xUSDC"]?.supplyApy    ?? 0;
  const utilization   = reserves["xUSDC"]?.utilization  ?? 0;
  const tvlUSDC       = reserves["xUSDC"]?.totalSuppliedUSD ?? null;
  const tvlBTC        = reserves["xclrBTC"]?.totalSuppliedUSD ?? null;

  const totalTVL = (tvlUSDC ?? 0) + (tvlBTC ?? 0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;
    let t = 0;

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width  || canvas.offsetWidth  || 600;
      canvas.height = rect.height || canvas.offsetHeight || 320;
    }

    // History buffers — seeded with real current value
    const N = 80;
    const makeHistory = (base: number) =>
      Array.from({ length: N }, () => base);

    const histBTC  = makeHistory(btcBorrowApy  / 100);
    const histEURC = makeHistory(eurcBorrowApy / 100);
    const histUSDC = makeHistory(usdcBorrowApy / 100);

    const ASSETS = [
      { label: "xclrBTC", color: "#f7931a", history: histBTC,  realVal: btcBorrowApy  },
      { label: "xEURC",   color: "#6aaef5", history: histEURC, realVal: eurcBorrowApy },
      { label: "xUSDC",   color: "#ffffff", history: histUSDC, realVal: usdcBorrowApy },
    ];

    function draw() {
      if (!canvas) return;
      const W = canvas.width;
      const H = canvas.height;
      if (W < 10 || H < 10) { raf = requestAnimationFrame(draw); return; }

      t += 0.008;

      // Background
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);

      const TICKER_H = 44;
      const CHART_H  = H - TICKER_H;

      // Grid
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let c = 1; c < 8; c++) {
        ctx.beginPath(); ctx.moveTo((c / 8) * W, 0); ctx.lineTo((c / 8) * W, CHART_H); ctx.stroke();
      }
      for (let r = 1; r < 5; r++) {
        ctx.beginPath(); ctx.moveTo(0, (r / 5) * CHART_H); ctx.lineTo(W, (r / 5) * CHART_H); ctx.stroke();
      }

      // Y-axis labels — scaled to max APY shown
      const maxApy = Math.max(btcBorrowApy, eurcBorrowApy, usdcBorrowApy, 6); // min 6% for visual
      ctx.font = "500 9px 'Space Mono',monospace";
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      for (let r = 1; r < 5; r++) {
        const y = (r / 5) * CHART_H;
        const pct = ((1 - r / 5) * maxApy).toFixed(1) + "%";
        ctx.fillText(pct, 6, y - 4);
      }

      const px = (i: number) => (i / (N - 1)) * W;
      const py = (v: number, max: number) => CHART_H * 0.88 - (v / max) * CHART_H * 0.72;

      // Draw each asset
      ASSETS.forEach(({ color, history, realVal }, ai) => {
        // Add tiny organic noise around real value (±0.02%)
        const noise = (realVal / 100) + 0.0001 * Math.sin(t * (3 + ai) + ai * 2.1);
        history.shift();
        history.push(noise);

        const max = Math.max(maxApy / 100, 0.06);

        // Fill under curve
        const r16 = parseInt(color.slice(1,3),16);
        const g16 = parseInt(color.slice(3,5),16);
        const b16 = parseInt(color.slice(5,7),16);
        ctx.beginPath();
        ctx.moveTo(px(0), CHART_H);
        for (let i = 0; i < N; i++) ctx.lineTo(px(i), py(history[i], max));
        ctx.lineTo(px(N - 1), CHART_H);
        ctx.closePath();
        const gf = ctx.createLinearGradient(0, 0, 0, CHART_H);
        gf.addColorStop(0, `rgba(${r16},${g16},${b16},0.10)`);
        gf.addColorStop(1, `rgba(${r16},${g16},${b16},0)`);
        ctx.fillStyle = gf;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = "round";
        for (let i = 0; i < N; i++) {
          i === 0 ? ctx.moveTo(px(i), py(history[i], max)) : ctx.lineTo(px(i), py(history[i], max));
        }
        ctx.stroke();

        // Tip dot
        const tx = px(N - 1);
        const ty = py(history[N - 1], max);
        ctx.beginPath();
        ctx.arc(tx, ty, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Tip label — real value
        const label = realVal.toFixed(2) + "%";
        ctx.font = "600 10px 'Space Mono',monospace";
        ctx.fillStyle = color;
        ctx.fillText(label, tx - 32, ty - 8);
      });

      // Legend
      ASSETS.forEach(({ label, color }, i) => {
        const lx = 12 + i * 90;
        ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.moveTo(lx, 14); ctx.lineTo(lx + 16, 14); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "600 9px 'Work Sans',sans-serif";
        ctx.fillText(label, lx + 20, 18);
      });

      // LIVE dot
      const blink = 0.5 + 0.5 * Math.sin(t * 4);
      ctx.beginPath();
      ctx.arc(W - 12, 14, 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,30,30,${0.5 + blink * 0.5})`;
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "600 9px 'Work Sans',sans-serif";
      ctx.fillText("LIVE", W - 44, 18);

      // Ticker strip — REAL data
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, CHART_H, W, TICKER_H);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, CHART_H); ctx.lineTo(W, CHART_H); ctx.stroke();

      const tvlStr = totalTVL > 1_000_000
        ? "$" + (totalTVL / 1_000_000).toFixed(2) + "M"
        : totalTVL > 1_000
        ? "$" + (totalTVL / 1_000).toFixed(1) + "K"
        : totalTVL > 0 ? "$" + totalTVL.toFixed(0) : "—";

      const cols = [
        { label: "SUPPLY APY",  val: usdcSupplyApy.toFixed(2) + "%", color: "#ffffff" },
        { label: "BORROW APY",  val: usdcBorrowApy.toFixed(2) + "%", color: "#ff9944" },
        { label: "UTILIZATION", val: utilization.toFixed(1) + "%",   color: "#ffffff" },
        { label: "TVL",         val: tvlStr,                          color: "#f7931a" },
      ];

      const cw = W / cols.length;
      cols.forEach(({ label, val, color }, i) => {
        const x = i * cw;
        if (i > 0) {
          ctx.strokeStyle = "rgba(255,255,255,0.1)";
          ctx.beginPath(); ctx.moveTo(x, CHART_H + 6); ctx.lineTo(x, H - 6); ctx.stroke();
        }
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = "600 8px 'Work Sans',sans-serif";
        ctx.fillText(label, x + 10, CHART_H + 16);
        ctx.fillStyle = color;
        ctx.font = "700 13px 'Space Mono',monospace";
        ctx.fillText(val, x + 10, H - 9);
      });

      raf = requestAnimationFrame(draw);
    }

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  // Re-initialize when real data arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [btcBorrowApy, eurcBorrowApy, usdcBorrowApy, usdcSupplyApy, utilization, totalTVL]);

  return (
    <canvas
      ref={ref}
      style={{ display: "block", width: "100%", height: "100%", minHeight: 320 }}
    />
  );
}
