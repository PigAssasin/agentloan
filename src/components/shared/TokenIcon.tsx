interface Props { symbol: string; size?: number; }

const CONFIGS: Record<string, { bg: string; letter: string }> = {
  cirBTC:  { bg: "linear-gradient(135deg, #f7931a 0%, #ffb74d 100%)", letter: "₿" },
  EURC:    { bg: "linear-gradient(135deg, #2775ca 0%, #6aaef5 100%)", letter: "€" },
  USDC:    { bg: "linear-gradient(135deg, #2775ca 0%, #3ea6e8 100%)", letter: "$" },
  xclrBTC: { bg: "linear-gradient(135deg, #f7931a 0%, #ffb74d 100%)", letter: "₿" },
  xEURC:   { bg: "linear-gradient(135deg, #2775ca 0%, #6aaef5 100%)", letter: "€" },
  xUSDC:   { bg: "linear-gradient(135deg, #2775ca 0%, #3ea6e8 100%)", letter: "$" },
};

export function TokenIcon({ symbol, size = 32 }: Props) {
  const cfg = CONFIGS[symbol] ?? { bg: "#cccccc", letter: symbol[0] };
  return (
    <div style={{
      width:        size,
      height:       size,
      borderRadius: "50%",
      background:   cfg.bg,
      border:       "2.5px solid #000000",
      display:      "flex",
      alignItems:   "center",
      justifyContent: "center",
      fontSize:     size * 0.44,
      color:        "#ffffff",
      fontFamily:   "var(--font-mono)",
      fontWeight:   700,
      flexShrink:   0,
    }}>
      {cfg.letter}
    </div>
  );
}
