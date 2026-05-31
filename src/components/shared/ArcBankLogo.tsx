interface Props {
  size?: number;
  color?: string;
}

export function ArcBankLogo({ size = 32, color = "#000000" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Baseline */}
      <line x1="4" y1="32" x2="36" y2="32" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Upside-down parabola: y = -x² shape, peak at top center */}
      <path
        d="M6,32 C9,6 31,6 34,32"
        stroke={color}
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
