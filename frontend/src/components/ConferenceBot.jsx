/**
 * A second original illustrated mascot, deliberately different from the
 * one on the Assistant page (rounder body, presenter stance, holding a
 * small globe instead of a chest waveform) so the two pages don't reuse
 * the same character. Built the same way - layered gradients for a soft
 * 3D look, no photography or third-party art involved.
 */
export default function ConferenceBot({ width = 200 }) {
  return (
    <div style={{ width, animation: "bob 5s ease-in-out infinite" }}>
      <svg viewBox="0 0 220 230" width="100%" height="auto">
        <defs>
          <linearGradient id="cbBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#173049" />
            <stop offset="100%" stopColor="#0e2136" />
          </linearGradient>
          <linearGradient id="cbHead" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#234a6b" />
            <stop offset="100%" stopColor="#15304a" />
          </linearGradient>
          <radialGradient id="cbGlobe" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ee4bd8" />
            <stop offset="70%" stopColor="#b9791f" />
            <stop offset="100%" stopColor="#8a5a15" />
          </radialGradient>
          <radialGradient id="cbVisor" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#62d8f2" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#62d8f2" stopOpacity="0.05" />
          </radialGradient>
        </defs>

        {/* rounded body */}
        <ellipse cx="110" cy="168" rx="62" ry="52" fill="url(#cbBody)" stroke="#1c3550" strokeWidth="2" />

        {/* head, wider/rounder than the assistant's */}
        <circle cx="110" cy="80" r="46" fill="url(#cbHead)" stroke="#1c3550" strokeWidth="2" />
        {/* visor band */}
        <rect x="76" y="66" width="68" height="28" rx="14" fill="#0a1a2b" stroke="#254a6e" strokeWidth="1.5" />
        <rect x="76" y="66" width="68" height="28" rx="14" fill="url(#cbVisor)" />
        <circle cx="96" cy="80" r="4.6" fill="#62d8f2">
          <animate attributeName="ry" values="4.6;0.5;4.6" keyTimes="0;0.5;1" dur="5s" repeatCount="indefinite" />
        </circle>
        <circle cx="124" cy="80" r="4.6" fill="#62d8f2">
          <animate attributeName="ry" values="4.6;0.5;4.6" keyTimes="0;0.5;1" dur="5s" repeatCount="indefinite" />
        </circle>

        {/* two small dome lights instead of an antenna */}
        <circle cx="88" cy="34" r="4" fill="#ee4bd8">
          <animate attributeName="opacity" values="1;0.3;1" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="132" cy="34" r="4" fill="#62d8f2">
          <animate attributeName="opacity" values="0.3;1;0.3" dur="2.2s" repeatCount="indefinite" />
        </circle>

        {/* left arm holding a small globe up - the "worldwide conferences" nod */}
        <path d="M58 150 Q30 140 26 108" stroke="#132b44" strokeWidth="12" strokeLinecap="round" fill="none" />
        <g style={{ transformOrigin: "26px 100px", animation: "spinGlobe 9s linear infinite" }}>
          <circle cx="26" cy="100" r="19" fill="url(#cbGlobe)" stroke="#6e4712" strokeWidth="1.5" />
          <path d="M9 94 Q26 84 43 94" stroke="#6e4712" strokeWidth="1.4" fill="none" opacity="0.6" />
          <path d="M9 106 Q26 116 43 106" stroke="#6e4712" strokeWidth="1.4" fill="none" opacity="0.6" />
          <path d="M26 81 Q16 100 26 119" stroke="#6e4712" strokeWidth="1.4" fill="none" opacity="0.6" />
          <path d="M26 81 Q36 100 26 119" stroke="#6e4712" strokeWidth="1.4" fill="none" opacity="0.6" />
        </g>

        {/* right arm resting on body */}
        <path d="M162 150 Q188 148 190 128" stroke="#132b44" strokeWidth="12" strokeLinecap="round" fill="none" />

        {/* chest badge - a simple podium/mic glyph instead of a waveform,
            to keep this visually distinct from the assistant's chest panel */}
        <rect x="94" y="152" width="32" height="22" rx="4" fill="#0e2136" stroke="#ee4bd8" strokeWidth="1.6" />
        <circle cx="110" cy="163" r="5.5" fill="none" stroke="#ee4bd8" strokeWidth="1.6" />
      </svg>
      <style>{`
        @keyframes bob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes spinGlobe {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
