/** Draws a simple line chart from [{year, month, conference_count}], with
 * the same "draw itself in" animation as PulseMark, so it's real data
 * wearing the same visual signature rather than a generic chart widget. */
export default function TrendLine({ data, width = 900, height = 220, color = "var(--teal)" }) {
  if (!data || data.length < 2) return null;

  const values = data.map((d) => d.conference_count);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const padX = 12;
  const padY = 16;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const points = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * innerW;
    const y = padY + innerH - ((d.conference_count - min) / range) * innerH;
    return [x, y];
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1][0]},${height - padY} L${points[0][0]},${height - padY} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trendFill)" style={{ animation: "fadeIn 1s var(--ease) 0.6s both" }} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 2000,
          strokeDashoffset: 2000,
          animation: "drawLine 1.6s var(--ease) 0.1s forwards",
        }}
      />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.6} fill={color} opacity={0.85} />
      ))}
    </svg>
  );
}
