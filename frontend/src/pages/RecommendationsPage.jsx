import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";
import Reveal from "../components/Reveal";
import FlipCard from "../components/FlipCard";
import { useCountUp } from "../lib/useCountUp";

const TYPE_LABEL = { category: "Category", country: "Country", host: "Host", keyword: "Conference" };
const TYPE_COLOR = { category: "var(--amber)", country: "var(--teal)", host: "#b779ff", keyword: "#4ba9f0" };

export default function RecommendationsPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState([]);
  const [totalMatches, setTotalMatches] = useState({});
  const [trending, setTrending] = useState(null);
  const [selected, setSelected] = useState(null); // the clicked result (always a category/country/host)
  const [matchedConference, setMatchedConference] = useState(null); // set only via a keyword hit
  const [related, setRelated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const topRef = useRef(null); // anchor just under the search bar, scrolled to on every pick

  useEffect(() => {
    apiGet("/api/trending")
      .then(setTrending)
      .catch((e) => setErrorMsg(describeError(e)));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debounced.trim()) {
      // Search bar cleared - reset back to the exact starting state (the
      // trending cards) rather than leaving whatever was last selected on
      // screen with nothing left to search for.
      setResults([]);
      setTotalMatches({});
      setSelected(null);
      setMatchedConference(null);
      setRelated(null);
      setErrorMsg(null);
      return;
    }
    apiGet(`/api/search?q=${encodeURIComponent(debounced)}`)
      .then((data) => {
        setResults(data.results);
        setTotalMatches(data.total_matches || {});
      })
      .catch((e) => setErrorMsg(describeError(e)));
  }, [debounced]);

  // Scrolls back up to just under the search bar - called whenever a card
  // is picked, so a selection made after scrolling down through a long
  // result list (or a "see also"/pairing pivot) brings the pairing panel
  // into view instead of leaving the user to scroll up manually.
  function scrollToTop() {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function loadRelated(item) {
    setSelected(item);
    setRelated(null);
    setErrorMsg(null);
    setLoading(true);
    // key_value can be a plain integer (category/host) OR a country name
    // that may contain commas, parentheses, or other characters that
    // need escaping - encode it unconditionally so those don't corrupt
    // the query string.
    apiGet(`/api/related?type=${item.type}&key=${encodeURIComponent(item.key_value)}&name=${encodeURIComponent(item.name)}`)
      .then(setRelated)
      .catch((e) => setErrorMsg(describeError(e)))
      .finally(() => setLoading(false));
  }

  function explore(item) {
    scrollToTop();
    // Keyword hits are individual conferences, not one of the three
    // recommendable dimensions - /api/related only understands
    // category/country/host, so a keyword match pivots into exploring
    // its own category instead, with a small banner noting which
    // conference it came from.
    if (item.type === "keyword") {
      if (item.category_key == null) {
        // This particular conference wasn't linked to a category in the
        // warehouse - nothing to pivot into, so say so instead of
        // firing a request that can only fail.
        setMatchedConference(item);
        setSelected(null);
        setRelated(null);
        setErrorMsg(null);
        return;
      }
      setMatchedConference(item);
      loadRelated({ type: "category", key_value: item.category_key, name: item.category_name });
      return;
    }
    setMatchedConference(null);
    loadRelated(item);
  }

  // clicking a "related" card pivots the whole explorer to that item
  function pivotTo(type, row) {
    scrollToTop();
    setMatchedConference(null);
    loadRelated({ type, key_value: row.key_value, name: row.name });
  }

  // Other conferences from the same search that matched on keyword/title,
  // excluding whichever one is currently opened - i.e. "See also" for a
  // matched conference. Derived straight from the existing search results
  // (already fetched for the query), no extra request needed.
  const seeAlso = matchedConference
    ? results.filter((r) => r.type === "keyword" && r.key_value !== matchedConference.key_value)
    : [];

  return (
    <div style={{ padding: "48px 28px 100px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <Reveal>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--teal)",
              marginBottom: 14,
            }}
          >
            Explore &amp; Recommend
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 700, marginBottom: 10 }}>
            Look up a category, country, host, or a conference topic.
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 15, maxWidth: 640, marginBottom: 30 }}>
            Search by topic, country, organizing society, or a keyword associated with a conference. Each result includes a match score, and selecting one reveals the hosts and countries that most frequently appear alongside it based on the conference records.
          </p>
        </Reveal>

        <Reveal delay={80}>
          <div style={{ position: "relative", marginBottom: 36 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try “robotics”, “Germany”, or a host society name…"
              style={{
                width: "100%",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: 15,
                padding: "16px 18px",
                borderRadius: 12,
                outline: "none",
              }}
            />
          </div>
        </Reveal>

        {/* Scroll anchor - picking any card scrolls back up to here, so the
            pairing panel (which renders just below) is brought into view
            instead of leaving the user to scroll up manually. */}
        <div ref={topRef} />

        {errorMsg && (
          <p style={{ color: "var(--rose)", fontFamily: "var(--mono)", fontSize: 13, marginBottom: 20 }}>
            {errorMsg}
          </p>
        )}

        {/* ---- RELATED / RECOMMENDATIONS ---- */}
        {/* Placed right under the search bar (rather than below the result
            grid) so the pairing info is the first thing you see once
            you've picked something, not something you have to scroll past
            the results to find. */}
        {(selected || (matchedConference && matchedConference.category_key == null)) && (
          <Reveal>
            <section
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
                borderRadius: "var(--radius)",
                padding: 24,
                marginBottom: 44,
              }}
            >
              {matchedConference && (
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-muted)",
                    marginBottom: selected ? 14 : 0,
                    paddingBottom: selected ? 14 : 0,
                    borderBottom: selected ? "1px solid var(--border)" : "none",
                  }}
                >
                  Matched conference: <strong style={{ color: "var(--text)" }}>{matchedConference.name}</strong>
                  {selected
                    ? " — showing what pairs with its category below."
                    : " — this one isn't linked to a category in the warehouse, so there's nothing to pivot into."}
                </div>
              )}

              {matchedConference && seeAlso.length > 0 && (
                <div
                  style={{
                    marginBottom: selected ? 20 : 0,
                    paddingBottom: selected ? 20 : 0,
                    borderBottom: selected ? "1px solid var(--border)" : "none",
                  }}
                >
                  <SectionLabel small>See also — same keyword</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    {seeAlso.map((item) => (
                      <button
                        key={item.key_value}
                        onClick={() => explore(item)}
                        className="glow-hover"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          background: "var(--bg-raised)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "9px 12px",
                          cursor: "pointer",
                          textAlign: "left",
                          color: "var(--text)",
                          fontSize: 13,
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.name}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <MatchBadge pct={item.match_pct} color={TYPE_COLOR.keyword} />
                          {item.country_name && (
                            <span style={{ color: "var(--text-dim)", fontFamily: "var(--mono)", fontSize: 11.5 }}>
                              {item.country_name}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selected && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ color: TYPE_COLOR[selected.type], fontFamily: "var(--mono)", fontSize: 11, textTransform: "uppercase" }}>
                      {TYPE_LABEL[selected.type]}
                    </span>
                    <h2 style={{ fontSize: 20, fontWeight: 600 }}>{selected.name}</h2>
                  </div>

                  {loading ? (
                    <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Pulling up what pairs with this…</p>
                  ) : related ? (
                    <>
                      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", margin: "14px 0 24px", fontFamily: "var(--mono)", fontSize: 13 }}>
                        <Stat label="Conferences" value={related.stats.conference_count} />
                        <Stat label="Avg attendance" value={related.stats.avg_attending ?? "n/a"} />
                        <Stat label="Avg duration" value={`${related.stats.avg_duration_hours ?? "n/a"}h`} />
                      </div>

                      <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginBottom: 18 }}>
                        Recommended pairings — the percentage is how often each one shows up alongside this {selected.type}:
                      </p>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
                        {Object.entries(related.related).map(([type, rows]) => (
                          <div key={type}>
                            <SectionLabel small>Top {TYPE_LABEL[type]}s</SectionLabel>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                              {rows.length === 0 ? (
                                <p style={{ color: "var(--text-dim)", fontSize: 12.5 }}>Nothing to pair here yet.</p>
                              ) : (
                                rows.map((row) => (
                                  <button
                                    key={row.key_value}
                                    onClick={() => pivotTo(type, row)}
                                    className="glow-hover"
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      gap: 10,
                                      background: "var(--bg-raised)",
                                      border: "1px solid var(--border)",
                                      borderRadius: 8,
                                      padding: "9px 12px",
                                      cursor: "pointer",
                                      textAlign: "left",
                                      color: "var(--text)",
                                      fontSize: 13,
                                    }}
                                  >
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>
                                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                      <MatchBadge pct={row.match_pct} color={TYPE_COLOR[type]} />
                                      <span style={{ color: "var(--text-dim)", fontFamily: "var(--mono)", fontSize: 11.5 }}>
                                        {row.conference_count}×
                                      </span>
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </section>
          </Reveal>
        )}

        {/* ---- SEARCH RESULTS ---- */}
        {debounced.trim() && (
          <Reveal delay={0}>
            <section style={{ marginBottom: 44 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <SectionLabel>Matches for “{debounced}”</SectionLabel>
                <MatchCountNote results={results} totalMatches={totalMatches} />
              </div>
              {results.length === 0 ? (
                <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 12 }}>
                  Nothing lines up with that yet — try a shorter word or a different spelling.
                </p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 14, marginTop: 14 }}>
                  {results.map((r) => (
                    <ResultCard
                      key={`${r.type}-${r.key_value}`}
                      row={r}
                      onClick={() => explore(r)}
                      active={
                        r.type === "keyword"
                          ? matchedConference?.key_value === r.key_value
                          : selected?.key_value === r.key_value && selected?.type === r.type
                      }
                      scoreLabel="match"
                    />
                  ))}
                </div>
              )}
            </section>
          </Reveal>
        )}

        {/* ---- TRENDING / DEFAULT STATE ---- */}
        {!debounced.trim() && trending && (
          <Reveal>
            <section>
              <SectionLabel>Most represented across the warehouse</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 14, marginTop: 14 }}>
                {["category", "country", "host"].flatMap((type) =>
                  (trending[type] || []).map((row) => (
                    <ResultCard
                      key={`${type}-${row.key_value}`}
                      row={{ ...row, type }}
                      onClick={() => explore({ ...row, type })}
                      scoreLabel="share"
                    />
                  ))
                )}
              </div>
            </section>
          </Reveal>
        )}
      </div>
    </div>
  );
}

/** Turns a thrown error into user-facing text - distinguishes a genuinely
 * unreachable backend from the backend responding with an actual error,
 * instead of showing the same "is app.py running?" message for both. */
function describeError(e) {
  if (e?.message === "UNREACHABLE") {
    return "Couldn't reach the API — is app.py running on port 5000?";
  }
  return `The API responded with an error: ${e?.message || "unknown error"}`;
}

function MatchCountNote({ results, totalMatches }) {
  const shown = results.length;
  const total = Object.values(totalMatches).reduce((a, b) => a + b, 0);
  if (!total || total <= shown) return null;
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
      showing {shown} of {total} matches
    </span>
  );
}

function SectionLabel({ children, small }) {
  return (
    <div
      style={{
        fontFamily: "var(--mono)",
        fontSize: small ? 11 : 12,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--text-dim)",
      }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  const animated = useCountUp(value);
  return (
    <div>
      <div style={{ color: "var(--text-h)", fontSize: 18, fontWeight: 600 }}>{animated}</div>
      <div style={{ color: "var(--text-dim)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

/** Small circular-looking percentage chip, styled like a recommender's
 * confidence score. */
function MatchBadge({ pct, color = "var(--amber)" }) {
  if (pct === undefined || pct === null) return null;
  return (
    <span
      style={{
        fontFamily: "var(--mono)",
        fontSize: 11,
        fontWeight: 600,
        color,
        border: `1px solid ${color}`,
        borderRadius: 999,
        padding: "2px 7px",
        background: "transparent",
        flexShrink: 0,
      }}
    >
      {pct}%
    </span>
  );
}

function ResultCard({ row, onClick, active, scoreLabel }) {
  const isKeyword = row.type === "keyword";
  return (
    <FlipCard
      height={178}
      front={
        <button
          onClick={onClick}
          className="glow-hover"
          style={{
            width: "100%",
            height: "100%",
            textAlign: "left",
            cursor: "pointer",
            border: `1px solid ${active ? TYPE_COLOR[row.type] : "var(--border)"}`,
            background: active ? "var(--bg-raised)" : "var(--surface)",
            borderRadius: 12,
            padding: 18,
            color: "var(--text)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <span style={{ color: TYPE_COLOR[row.type], fontFamily: "var(--mono)", fontSize: 10.5, textTransform: "uppercase" }}>
              {TYPE_LABEL[row.type]}
            </span>
            {row.match_pct !== undefined && <MatchBadge pct={row.match_pct} color={TYPE_COLOR[row.type]} />}
          </div>
          <div
            style={{
              fontWeight: 600,
              fontSize: isKeyword ? 13.5 : 15.5,
              margin: "10px 0",
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              flex: 1,
            }}
          >
            {row.name}
          </div>
          {isKeyword ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)" }}>
              {row.category_name && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.category_name}</span>}
              {row.country_name && <span>{row.country_name}</span>}
              {row.instance_count > 1 && <span>{row.instance_count} editions on record</span>}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 14, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text-muted)" }}>
              <span>{row.conference_count} conf.</span>
              {row.avg_attending != null && <span>{row.avg_attending} avg att.</span>}
            </div>
          )}
        </button>
      }
      back={
        <div
          onClick={onClick}
          style={{
            width: "100%",
            height: "100%",
            cursor: "pointer",
            border: `1px solid ${TYPE_COLOR[row.type]}`,
            background: "var(--bg-raised)",
            borderRadius: 12,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
            {isKeyword
              ? `${row.match_pct}% tag/title match on what you typed. Click through to explore its category.`
              : `${row.match_pct}% ${scoreLabel === "share" ? "of every conference on record" : "text match on what you typed"}. Click through for what pairs with it.`}
          </p>
        </div>
      }
    />
  );
}
