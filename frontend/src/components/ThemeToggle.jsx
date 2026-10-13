import { useEffect, useState } from "react";

const KEY = "conferencePulse.theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    const initial = saved || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // ignore storage failures, theme still applies for this session
    }
  }

  return (
    <button
      onClick={toggle}
      className="glow-hover"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        border: "1px solid var(--border)",
        background: "var(--surface-2)",
        color: "var(--text)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 15,
      }}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
