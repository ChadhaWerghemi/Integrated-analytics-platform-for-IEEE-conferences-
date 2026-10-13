import { useState } from "react";

/**
 * A card that flips on hover (or tap, on touch devices) to reveal a back
 * face. Both faces are laid on top of each other and rotated with a real
 * CSS 3D transform, not a fade - so it reads as a flip rather than a
 * crossfade.
 */
export default function FlipCard({ front, back, height = 150, style = {} }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      onMouseEnter={() => setFlipped(true)}
      onMouseLeave={() => setFlipped(false)}
      onClick={() => setFlipped((f) => !f)}
      style={{ perspective: 900, height, ...style }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.55s var(--ease)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
          }}
        >
          {front}
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {back}
        </div>
      </div>
    </div>
  );
}
