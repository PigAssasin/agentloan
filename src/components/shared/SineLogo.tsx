interface Props {
  size?: number;
  color?: string;
}

export function SineLogo({ size = 32, color = "#000000" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Y axis */}
      <line x1="8" y1="36" x2="8" y2="3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      {/* Y axis arrow */}
      <polyline points="5,6 8,2 11,6" stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />

      {/* X axis */}
      <line x1="5" y1="22" x2="37" y2="22" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      {/* X axis arrow */}
      <polyline points="34,19 38,22 34,25" stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />

      {/* Sine wave — one full period, amplitude 9, centered on y=22 */}
      <path
        d="M8,22 C11,13 15,13 18,22 C21,31 25,31 28,22"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
