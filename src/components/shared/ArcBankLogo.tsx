interface Props {
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

export function AgentLoanLogo({ size = 32, color = "#000000", style }: Props) {
  // Parabola spans y=12..36 in a 40-wide canvas.
  // viewBox cropped to y=10..38 so there's no dead whitespace top/bottom —
  // flex alignItems:center will land the visual arch exactly on the text midline.
  return (
    <svg
      width={size}
      height={size * 0.7}
      viewBox="0 10 40 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
    >
      <path
        d="M13,36 C14,12 26,12 27,36"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
