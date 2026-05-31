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
      {/* Narrow upside-down parabola — no baseline */}
      <path
        d="M13,36 C14,6 26,6 27,36"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
