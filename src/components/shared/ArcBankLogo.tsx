interface Props {
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

export function ArcBankLogo({ size = 32, color = "#000000", style }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
    >
      {/* Narrow upside-down parabola — peak at y=12 so visual CoM aligns with text midline */}
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
