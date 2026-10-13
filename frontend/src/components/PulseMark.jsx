/**
 * PulseMark - the brand's signature element: an ECG-style waveform that
 * draws itself in on mount, then loops a small traveling dot along the
 * path. Doubles as "Conference Pulse" wordmark reinforcement wherever it
 * appears (hero, section dividers, nav).
 */
export default function PulseMark({ width = 220, height = 40, color = "var(--amber)", strokeWidth = 2 }) {
  const path = "M0,20 L36,20 L46,4 L56,36 L66,12 L74,20 L100,20 L112,20 L122,30 L132,8 L142,20 L220,20";

  return (
    <svg
      viewBox={`0 0 220 40`}
      width={width}
      height={height}
      fill="none"
      style={{ display: "block", overflow: "visible" }}
    >
      <path
        d={path}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 320,
          strokeDashoffset: 320,
          animation: "drawLine 1.4s var(--ease) 0.15s forwards",
        }}
      />
      <circle r="3.2" fill={color}>
        <animateMotion
          dur="3.4s"
          repeatCount="indefinite"
          path={path}
          begin="1.6s"
        />
      </circle>
    </svg>
  );
}
