import { useEffect, useRef, useState } from "react";

/**
 * Animates a numeric value climbing from 0 up to `target` over `duration`
 * ms. Non-numeric targets (e.g. "57%", "4h") are parsed for their leading
 * number and the surrounding text (suffix) is preserved.
 */
export function useCountUp(target, duration = 1100) {
  const [display, setDisplay] = useState("0");
  const rafRef = useRef(null);

  useEffect(() => {
    if (target === undefined || target === null) return undefined;

    const str = String(target);
    const match = str.match(/-?\d+(\.\d+)?/);
    if (!match) {
      setDisplay(str);
      return undefined;
    }
    const numeric = parseFloat(match[0]);
    const prefix = str.slice(0, match.index);
    const suffix = str.slice(match.index + match[0].length);
    const decimals = match[0].includes(".") ? match[0].split(".")[1].length : 0;

    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const value = numeric * eased;
      setDisplay(`${prefix}${value.toFixed(decimals)}${suffix}`);
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}
