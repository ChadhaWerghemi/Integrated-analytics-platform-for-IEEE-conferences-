import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";
import PulseMark from "../components/PulseMark";
import Reveal from "../components/Reveal";
import FlipCard from "../components/FlipCard";
import conferenceHero from "../assets/conference-hero.png";
import { useCountUp } from "../lib/useCountUp";

// Your real, working Publish to Web URL.
const POWERBI_EMBED_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiMzUwYmQ1MzgtMjdiZS00MTRiLTk1ZTAtMTAzMTc2YTE4OGRlIiwidCI6ImRiZDY2NjRkLTRlYjktNDZlYi05OWQ4LTVjNDNiYTE1M2M2MSIsImMiOjl9";

export default function HomePage() {
  const [kpis, setKpis] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(false);
  const embedRef = useRef(null);

  useEffect(() => {
    apiGet("/api/overview")
      .then((data) => setKpis(data.kpis))
      .catch(() => setError(true));
    apiGet("/api/insights").then(setInsights).catch(() => setError(true));
  }, []);

  function goFullscreen() {
    const el = embedRef.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  return (
    <div style={{ color: "var(--text)" }}>
      {/* ---- HERO ---- */}
      <section
        className="grid-texture"
        style={{ padding: "84px 28px 48px", position: "relative", overflow: "hidden" }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            position: "relative",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 440px)",
            gap: 32,
            alignItems: "start",
          }}
        >
          <div>
            <Reveal>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--amber)",
                  marginBottom: 20,
                }}
              >
                Conference intelligence, in one place
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1
                style={{
                  fontFamily: "var(--display)",
                  fontWeight: 700,
                  fontSize: "clamp(32px, 5vw, 50px)",
                  lineHeight: 1.1,
                  maxWidth: 820,
                }}
              >
                Conference Pulse
              </h1>
            </Reveal>

            <Reveal delay={150}>
              <p style={{ fontSize: 16, color: "var(--text-muted)", maxWidth: 580, marginTop: 20, lineHeight: 1.65 }}>
                Get a clear view of the conference landscape at a glance — explore what is happening, where events are taking place, who is organizing them, and the patterns emerging across the data.
              </p>
            </Reveal>

            <Reveal delay={220}>
              <div style={{ marginTop: 32 }}>
                <PulseMark width={260} height={44} />
              </div>
            </Reveal>
          </div>

          <Reveal delay={120} className="home-mascot home-globe">
            <img
              src={conferenceHero}
              alt="Conference and event analytics"
              className="conference-globe"
            />
          </Reveal>

          {/* ---- LIVE KPI CARDS (count-up + flip for a bit more context) ---- */}
          <Reveal delay={260} style={{ gridColumn: "1 / -1" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 14,
                marginTop: 44,
              }}
            >
              {error ? (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    padding: 22,
                    color: "var(--rose)",
                    fontFamily: "var(--mono)",
                    fontSize: 13,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  Couldn't reach the API — is app.py running on port 5000?
                </div>
              ) : !kpis ? (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    padding: 22,
                    color: "var(--text-muted)",
                    fontFamily: "var(--mono)",
                    fontSize: 13,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  Pulling the latest figures…
                </div>
              ) : (
                <>
                  <StatCard num={kpis.total_conferences} label="Conferences tracked" back="Every row currently sitting in fact_events, cancelled ones included." />
                  <StatCard num={kpis.locations} label="Distinct locations" back="Count of unique countries these conferences have been hosted in." />
                  <StatCard num={`${kpis.avg_duration_hours}h`} label="Avg. duration" back="Mean length across every logged conference, in hours." />
                  <StatCard num={`${kpis.virtual_rate_pct}%`} label="Virtual rate" back="Share of conferences flagged as fully virtual, not hybrid." />
                </>
              )}
            </div>
          </Reveal>
        </div>
        <style>{`
          @media (min-width: 860px) {
            .home-mascot { display: block !important; }
          }
        `}</style>
      </section>

      {/* ---- FORMAT + TOP HOSTS/COUNTRIES ---- */}
      {insights && (
        <section style={{ padding: "0 28px 56px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
            <Reveal>
              <Panel title="Attendance by format">
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
                  {insights.attendance.by_format.map((f) => (
                    <FormatBar key={f.event_format} row={f} max={Math.max(...insights.attendance.by_format.map((r) => r.avg_attending || 0))} />
                  ))}
                </div>
                <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 14 }}>
                  {insights.attendance.summary.reporting_coverage_pct}% of conferences have attendance figures on record.
                </p>
              </Panel>
            </Reveal>

            <Reveal delay={80}>
              <Panel title="Where they happen most">
                <ListRows rows={insights.top_countries} nameKey="country_name" />
              </Panel>
            </Reveal>

            <Reveal delay={160}>
              <Panel title="Who runs them most">
                <ListRows rows={insights.top_hosts} nameKey="host_name" />
              </Panel>
            </Reveal>
          </div>
        </section>
      )}

      {/* ---- LIVE DASHBOARD EMBED ---- */}
      <section style={{ padding: "0 20px 64px" }}>
        <div style={{ maxWidth: 1520, margin: "0 auto" }}>
          <Reveal>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 26,
                borderBottom: "1px solid var(--border)",
                paddingBottom: 16,
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <h2 style={{ fontSize: 24, fontWeight: 600 }}>Full dashboard</h2>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--text-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Live report &middot; explore the latest conference data
              </span>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
                borderRadius: "var(--radius)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 18px",
                  borderBottom: "1px solid var(--border)",
                  fontFamily: "var(--mono)",
                  fontSize: 11.5,
                  color: "var(--text-muted)",
                }}
              >
                <span>Live conference report</span>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ color: "var(--teal)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--teal)",
                        display: "inline-block",
                        animation: "pulseDot 1.8s ease-in-out infinite",
                      }}
                    />
                    connected
                  </span>
                  <button
                    onClick={goFullscreen}
                    className="glow-hover"
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--surface-2)",
                      color: "var(--text)",
                      fontFamily: "var(--sans)",
                      fontSize: 11.5,
                      padding: "5px 12px",
                      borderRadius: 999,
                      cursor: "pointer",
                    }}
                  >
                    Expand fullscreen ⤢
                  </button>
                </div>
              </div>

              {/*
                Fix for the "only fits at 80% browser zoom" issue: the old
                embed used a fixed 720px height inside a 1180px-max
                container, which didn't match the report's actual canvas
                ratio at 100% zoom, so the bottom got clipped. This version
                gives the embed a full-bleed, much wider container and
                sizes the iframe with aspect-ratio instead of a fixed pixel
                height, so the whole report shows regardless of zoom or
                window size. "Expand fullscreen" covers everything else.
              */}
              <div
                ref={embedRef}
                style={{
                  width: "100%",
                  aspectRatio: "16 / 9",
                  minHeight: 640,
                  background: "var(--surface)",
                }}
              >
                <iframe
                  key="powerbi-default-first-page"
                  title="IEEE Conference Dashboard"
                  src={POWERBI_EMBED_URL}
                  style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                  allowFullScreen
                />
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

function StatCard({ num, label, back }) {
  const animated = useCountUp(num);
  return (
    <FlipCard
      height={128}
      front={
        <div
          style={{
            height: "100%",
            padding: "20px 20px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            background: "var(--bg-raised)",
            position: "relative",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: -3.5,
              left: -3.5,
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--amber)",
            }}
          />
          <div style={{ fontFamily: "var(--mono)", fontSize: 30, fontWeight: 600, color: "var(--text-h)" }}>{animated}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{label}</div>
        </div>
      }
      back={
        <div
          style={{
            height: "100%",
            padding: "20px 20px",
            border: "1px solid var(--teal)",
            borderRadius: "var(--radius)",
            background: "var(--teal-soft)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <p style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.5 }}>{back}</p>
        </div>
      }
    />
  );
}

function Panel({ title, children }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface)",
        borderRadius: "var(--radius)",
        padding: 22,
        height: "100%",
      }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-h)" }}>{title}</h3>
      {children}
    </div>
  );
}

function FormatBar({ row, max }) {
  const pct = max ? Math.round((100 * (row.avg_attending || 0)) / max) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
        <span style={{ textTransform: "capitalize" }}>{row.event_format}</span>
        <span style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>{row.avg_attending} avg</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--amber), var(--teal))",
            borderRadius: 999,
            animation: "growBar 1s var(--ease) 0.2s both",
          }}
        />
      </div>
      <style>{`@keyframes growBar { from { width: 0%; } }`}</style>
    </div>
  );
}

function ListRows({ rows, nameKey }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
      {rows.map((r) => (
        <div key={r[nameKey]} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "var(--text)" }}>{r[nameKey]}</span>
          <span style={{ fontFamily: "var(--mono)", color: "var(--text-dim)" }}>{r.conference_count}</span>
        </div>
      ))}
    </div>
  );
}
