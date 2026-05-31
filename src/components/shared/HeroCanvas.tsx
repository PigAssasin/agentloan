"use client";

import { useEffect, useRef } from "react";

export function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;
    let t = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width  || canvas.offsetWidth  || 600;
      canvas.height = rect.height || canvas.offsetHeight || 320;
    }

    /* ── 3 simulated rate histories ── */
    const N = 100;
    const make = (base: number, amp: number, freq: number, seed: number) =>
      Array.from({ length: N }, (_, i) =>
        base + amp * Math.sin(i * freq + seed) + (amp * 0.3) * Math.sin(i * freq * 2.3 + seed * 1.7)
      );

    const histBTC  = make(0.60, 0.22, 0.14, 0.0);
    const histETH  = make(0.42, 0.18, 0.18, 1.4);
    const histUSDC = make(0.25, 0.10, 0.22, 2.8);

    const ASSETS = [
      { label: "cirBTC", color: "#f7931a", history: histBTC  },
      { label: "EURC",   color: "#6aaef5", history: histETH  },
      { label: "USDC",   color: "#ffffff", history: histUSDC },
    ];

    function draw() {
      const W = canvas.width;
      const H = canvas.height;
      if (W < 10 || H < 10) { raf = requestAnimationFrame(draw); return; }

      t += 0.010;

      /* Black bg */
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);

      const TICKER_H = 44;
      const CHART_H  = H - TICKER_H;

      /* Grid */
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let c = 1; c < 8; c++) {
        const x = (c / 8) * W;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CHART_H); ctx.stroke();
      }
      for (let r = 1; r < 5; r++) {
        const y = (r / 5) * CHART_H;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      /* Y-axis labels */
      ctx.font = "500 9px 'Space Mono',monospace";
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      for (let r = 1; r < 5; r++) {
        const y = (r / 5) * CHART_H;
        const pct = ((1 - r / 5) * 2).toFixed(1) + "%";
        ctx.fillText(pct, 6, y - 4);
      }

      /* Chart line helper */
      const px = (i: number) => (i / (N - 1)) * W;
      const py = (v: number) => CHART_H * 0.9 - v * CHART_H * 0.75;

      /* Draw each asset */
      ASSETS.forEach(({ color, history }, ai) => {
        /* Advance tip */
        const base  = [0.60, 0.42, 0.25][ai];
        const amp   = [0.22, 0.18, 0.10][ai];
        const freq  = [0.14, 0.18, 0.22][ai];
        const seed  = [0.0,  1.4,  2.8][ai];
        const newV  = base
          + amp * Math.sin(t * freq * 8 + seed)
          + amp * 0.3 * Math.sin(t * freq * 18 + seed * 1.7);
        history.shift();
        history.push(newV);

        /* Fill under curve */
        ctx.beginPath();
        ctx.moveTo(px(0), CHART_H);
        for (let i = 0; i < N; i++) ctx.lineTo(px(i), py(history[i]));
        ctx.lineTo(px(N - 1), CHART_H);
        ctx.closePath();
        const r16 = parseInt(color.slice(1,3),16);
        const g16 = parseInt(color.slice(3,5),16);
        const b16 = parseInt(color.slice(5,7),16);
        const gf = ctx.createLinearGradient(0, 0, 0, CHART_H);
        gf.addColorStop(0, `rgba(${r16},${g16},${b16},0.12)`);
        gf.addColorStop(1, `rgba(${r16},${g16},${b16},0)`);
        ctx.fillStyle = gf;
        ctx.fill();

        /* Line */
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = "round";
        for (let i = 0; i < N; i++) {
          i === 0 ? ctx.moveTo(px(i), py(history[i])) : ctx.lineTo(px(i), py(history[i]));
        }
        ctx.stroke();

        /* Tip dot */
        const tx = px(N - 1);
        const ty = py(history[N - 1]);
        ctx.beginPath();
        ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        /* Tip label */
        const val = (history[N - 1] * 2).toFixed(2) + "%";
        ctx.font = "600 10px 'Space Mono',monospace";
        ctx.fillStyle = color;
        ctx.fillText(val, tx - 30, ty - 8);
      });

      /* Legend top-left */
      ASSETS.forEach(({ label, color }, i) => {
        const lx = 12 + i * 90;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.moveTo(lx, 14); ctx.lineTo(lx + 18, 14);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "600 9px 'Work Sans',sans-serif";
        ctx.fillText(label, lx + 22, 18);
      });

      /* LIVE dot */
      const blink = 0.5 + 0.5 * Math.sin(t * 4);
      ctx.beginPath();
      ctx.arc(W - 12, 14, 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,30,30,${0.5 + blink * 0.5})`;
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "600 9px 'Work Sans',sans-serif";
      ctx.fillText("LIVE", W - 44, 18);

      /* ── Ticker strip ── */
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, CHART_H, W, TICKER_H);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, CHART_H); ctx.lineTo(W, CHART_H); ctx.stroke();

      const cols = [
        { label: "SUPPLY APY",  val: (0.82 + Math.sin(t * 0.3) * 0.04).toFixed(2) + "%",  color: "#ffffff" },
        { label: "BORROW APY",  val: (1.36 + Math.sin(t * 0.2 + 1) * 0.06).toFixed(2) + "%", color: "#ff3333" },
        { label: "UTILIZATION", val: (40   + Math.sin(t * 0.15 + 2) * 5).toFixed(1) + "%",   color: "#ffffff" },
        { label: "TVL",         val: "$" + (3.2 + Math.sin(t * 0.1 + 0.5) * 0.2).toFixed(2) + "K", color: "#f7931a" },
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
    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(canvas);
    // Also observe parent
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{ display: "block", width: "100%", height: "100%", minHeight: 320 }}
    />
  );
}
