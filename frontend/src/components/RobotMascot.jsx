/**
 * An original, illustrated assistant mascot (not a photo - avoids any
 * copyright/likeness concerns while still giving the Assistant page a
 * dedicated visual). Built from layered gradients for a soft 3D look,
 * with a slow float, a blinking eye, and a pulsing antenna tip tying it
 * back to the "pulse" motif used elsewhere.
 */
export default function RobotMascot({ width = 220 }) {
  return (
    <div style={{ width, animation: "float 4.5s ease-in-out infinite" }}>
      <svg viewBox="0 0 200 220" width="100%" height="auto">
        <defs>
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1c3550" />
            <stop offset="55%" stopColor="#132b44" />
            <stop offset="100%" stopColor="#0c1c2c" />
          </linearGradient>
          <linearGradient id="headGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#20405f" />
            <stop offset="100%" stopColor="#132b44" />
          </linearGradient>
          <radialGradient id="visorGlow" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#62d8f2" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#62d8f2" stopOpacity="0.05" />
          </radialGradient>
        </defs>

        {/* antenna */}
        <line x1="100" y1="18" x2="100" y2="42" stroke="#5e7690" strokeWidth="3" />
        <circle cx="100" cy="14" r="7" fill="#ee4bd8">
          <animate attributeName="opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite" />
        </circle>

        {/* head */}
        <rect x="52" y="42" width="96" height="72" rx="20" fill="url(#headGrad)" stroke="#1c3550" strokeWidth="2" />
        {/* visor */}
        <rect x="66" y="62" width="68" height="32" rx="14" fill="#0a1a2b" stroke="#254a6e" strokeWidth="1.5" />
        <rect x="66" y="62" width="68" height="32" rx="14" fill="url(#visorGlow)" />
        {/* eyes */}
        <g>
          <circle cx="86" cy="78" r="5.5" fill="#62d8f2">
            <animate attributeName="ry" values="5.5;0.6;5.5" keyTimes="0;0.5;1" dur="4.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="114" cy="78" r="5.5" fill="#62d8f2">
            <animate attributeName="ry" values="5.5;0.6;5.5" keyTimes="0;0.5;1" dur="4.5s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* body */}
        <rect x="44" y="118" width="112" height="80" rx="18" fill="url(#bodyGrad)" stroke="#1c3550" strokeWidth="2" />
        {/* chest panel echoing the pulse waveform */}
        <path
          d="M60 158 L78 158 L86 144 L96 172 L106 150 L114 158 L140 158"
          stroke="#ee4bd8"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* arms */}
        <rect x="24" y="130" width="16" height="48" rx="8" fill="#132b44" stroke="#1c3550" strokeWidth="1.5" />
        <rect x="160" y="130" width="16" height="48" rx="8" fill="#132b44" stroke="#1c3550" strokeWidth="1.5" />
      </svg>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}
