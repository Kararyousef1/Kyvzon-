interface CircleGaugeProps {
  value: number;
  color: string;
  size?: number;
}

export default function CircleGauge({ value, color, size = 80 }: CircleGaugeProps) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle 
        cx={size / 2} 
        cy={size / 2} 
        r={r} 
        fill="none" 
        stroke="#f1f5f9" 
        strokeWidth={8} 
      />
      <circle 
        cx={size / 2} 
        cy={size / 2} 
        r={r} 
        fill="none" 
        stroke={color} 
        strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} 
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }} 
      />
    </svg>
  );
}