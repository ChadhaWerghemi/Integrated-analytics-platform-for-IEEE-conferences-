import { useEffect, useRef, useState } from "react";

/** A soft magnetic-style cursor with a delayed luminous shadow trail.
 * Only enabled for mouse/trackpad devices. */
export default function CustomCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const trailARef = useRef(null);
  const trailBRef = useRef(null);
  const trailCRef = useRef(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    setEnabled(fine);
    if (!fine) return undefined;

    document.body.classList.add("custom-cursor-active");
    let mouseX = innerWidth / 2, mouseY = innerHeight / 2;
    let ringX = mouseX, ringY = mouseY;
    let aX = mouseX, aY = mouseY;
    let bX = mouseX, bY = mouseY;
    let cX = mouseX, cY = mouseY;
    let frame;

    const move = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (dotRef.current) dotRef.current.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
      const hoverable = e.target.closest?.("button, a, input, textarea, select, .glow-hover, [role='button']");
      if (ringRef.current) {
        ringRef.current.style.opacity = 1;
        ringRef.current.dataset.state = hoverable ? "hover" : "idle";
      }
      [dotRef, trailARef, trailBRef, trailCRef].forEach((ref) => {
        if (ref.current) ref.current.style.opacity = 1;
      });
    };

    const leave = () => {
      [dotRef, ringRef, trailARef, trailBRef, trailCRef].forEach((ref) => {
        if (ref.current) ref.current.style.opacity = 0;
      });
    };

    const loop = () => {
      ringX += (mouseX - ringX) * 0.22;
      ringY += (mouseY - ringY) * 0.22;
      aX += (mouseX - aX) * 0.14; aY += (mouseY - aY) * 0.14;
      bX += (mouseX - bX) * 0.09; bY += (mouseY - bY) * 0.09;
      cX += (mouseX - cX) * 0.055; cY += (mouseY - cY) * 0.055;
      if (ringRef.current) ringRef.current.style.transform = `translate(${ringX}px, ${ringY}px)`;
      if (trailARef.current) trailARef.current.style.transform = `translate(${aX}px, ${aY}px)`;
      if (trailBRef.current) trailBRef.current.style.transform = `translate(${bX}px, ${bY}px)`;
      if (trailCRef.current) trailCRef.current.style.transform = `translate(${cX}px, ${cY}px)`;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    window.addEventListener("mousemove", move);
    document.addEventListener("mouseleave", leave);
    document.addEventListener("mouseenter", move);
    return () => {
      document.body.classList.remove("custom-cursor-active");
      window.removeEventListener("mousemove", move);
      document.removeEventListener("mouseleave", leave);
      document.removeEventListener("mouseenter", move);
      cancelAnimationFrame(frame);
    };
  }, []);

  if (!enabled) return null;
  const fixed = { position: "fixed", top: 0, left: 0, pointerEvents: "none", zIndex: 9998, borderRadius: "50%", opacity: 0 };

  return <>
    <div ref={trailCRef} style={{ ...fixed, width: 52, height: 52, marginTop: -26, marginLeft: -26, background: "radial-gradient(circle, rgba(82,79,255,.08), transparent 68%)", filter: "blur(8px)", transition: "opacity .25s" }} />
    <div ref={trailBRef} style={{ ...fixed, width: 34, height: 34, marginTop: -17, marginLeft: -17, background: "radial-gradient(circle, rgba(230,53,216,.14), transparent 70%)", filter: "blur(5px)", transition: "opacity .2s" }} />
    <div ref={trailARef} style={{ ...fixed, width: 20, height: 20, marginTop: -10, marginLeft: -10, background: "radial-gradient(circle, rgba(98,216,242,.28), transparent 72%)", filter: "blur(3px)", transition: "opacity .15s" }} />
    <div ref={dotRef} style={{ ...fixed, zIndex: 10000, width: 8, height: 8, marginTop: -4, marginLeft: -4, background: "linear-gradient(135deg, #aef2ff, #62d8f2 45%, #ee4bd8)", boxShadow: "0 0 12px rgba(98,216,242,.9), 0 0 28px rgba(238,75,216,.55)", transition: "opacity .2s" }} />
    <div ref={ringRef} className="cursor-ring" style={{ ...fixed, width: 34, height: 34, marginTop: -17, marginLeft: -17, border: "1px solid rgba(174,242,255,.8)", boxShadow: "0 0 18px rgba(98,216,242,.18), inset 0 0 12px rgba(238,75,216,.08)", transition: "opacity .2s, width .25s var(--ease), height .25s var(--ease), margin .25s var(--ease), border-color .25s var(--ease), background .25s var(--ease), box-shadow .25s var(--ease)" }} />
    <style>{`.cursor-ring[data-state="hover"]{width:54px!important;height:54px!important;margin-top:-27px!important;margin-left:-27px!important;background:radial-gradient(circle,rgba(98,216,242,.14),rgba(238,75,216,.08))!important;border-color:rgba(238,75,216,.9)!important;box-shadow:0 0 24px rgba(238,75,216,.28),0 0 42px rgba(98,216,242,.18)!important;}`}</style>
  </>;
}
