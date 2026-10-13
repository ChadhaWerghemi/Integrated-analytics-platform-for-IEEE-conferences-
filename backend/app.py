"""
Flask API for Conference Pulse - serves live KPI/trend data from the
MySQL warehouse for the Home page, powers the Recommendations explorer,
and /api/assistant, a server-side proxy to Groq's free API tier so no
API key ever touches the browser.

Requirements:
    pip install flask flask-cors mysql-connector-python groq python-dotenv

Setup:
    Create a .env file next to this script with:
        GROQ_API_KEY=gsk_...
        MYSQL_PASSWORD=your_mysql_root_password
    (get a free Groq key at console.groq.com - no credit card required)

Usage:
    python app.py
    (runs on http://localhost:5000)
"""

import os
import re
import json
import time
from difflib import SequenceMatcher
from flask import Flask, jsonify, request
from flask_cors import CORS
import mysql.connector
from dotenv import load_dotenv
from groq import Groq, BadRequestError

load_dotenv()

app = Flask(__name__)
CORS(app)  # allows the React dev server (different port) to call this API

DB_CONFIG = dict(
    database="ieee_conferences_dw",
    user="root",
    password=os.environ.get("MYSQL_PASSWORD", "root"),
    host="localhost",
    port=3306,
)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


def query(sql, params=None):
    conn = mysql.connector.connect(**DB_CONFIG)
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params or ())
        rows = cur.fetchall()
        cur.close()
        return rows
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Dataset description - single source of truth for what this warehouse
# actually contains. Used to (a) power the "available data" panel on the
# Assistant page and (b) ground the assistant's system prompt so it knows
# exactly what it has access to, instead of guessing or hedging.
# ---------------------------------------------------------------------------
DATASET_INFO = {
    "connection": {
        "name": "ieee_conferences_dw",
        "engine": "MySQL",
        "kind": "Star-schema data warehouse",
    },
    "grain": "One row per IEEE conference/event (fact_events).",
    "dimensions": [
        {
            "table": "dim_date",
            "covers": "Calendar attributes",
            "fields": ["full_date", "day_of_week", "year", "month", "month_name", "quarter"],
        },
        {
            "table": "dim_category",
            "covers": "Subject/topic of the conference",
            "fields": ["category_name"],
        },
        {
            "table": "dim_location",
            "covers": "Where the conference was held",
            "fields": ["city", "country_name"],
        },
        {
            "table": "dim_host",
            "covers": "Organizing host/society",
            "fields": ["host_name"],
        },
        {
            "table": "dim_format",
            "covers": "Delivery format",
            "fields": ["event_format (on-site / virtual / hybrid)"],
        },
    ],
    "facts": [
        "duration_hours", "is_multiday (flag)", "virtual (flag)", "cancelled (flag)",
        "has_registration_url (flag)",
        "ieee_attending", "guests_attending", "total_attending", "ieee_attending_share_pct",
        "has_attendance_data (coverage flag - attendance fields are NULL unless this is 1)",
        "title", "link", "description_plain",
        "keywords_clean (free-text tags per conference, searchable)",
    ],
    "known_gaps": [
        "No individual attendee-level or session-level data, only per-conference aggregates.",
        "Attendance figures (ieee_attending / guests_attending / total_attending / "
        "ieee_attending_share_pct) are only present where has_attendance_data = 1.",
    ],
}

# ---------------------------------------------------------------------------
# SQL schema handed to the assistant model so it can write its own read-only
# queries (see the run_sql_query tool below), instead of being limited to
# whatever aggregates a developer thought to precompute. This is the actual
# table/column map - kept separate from DATASET_INFO above, which is the
# plain-language version for the UI panel. Sourced directly from the
# warehouse build script (build_star_schema_mysql_FINAL.sql), not inferred.
# ---------------------------------------------------------------------------
SQL_SCHEMA_FOR_ASSISTANT = """
TABLES (MySQL, database ieee_conferences_dw, read-only):

fact_events                 - one row per conference (the grain of this warehouse)
  event_id                  int, primary key
  title                     varchar, raw conference title
  date_key                  FK -> dim_date.date_key
  category_key              FK -> dim_category.category_key
  location_key               FK -> dim_location.location_key
  host_key                    FK -> dim_host.host_key
  format_key                   FK -> dim_format.format_key
  duration_hours                decimal
  is_multiday                    tinyint 0/1
  cancelled                       tinyint 0/1
  virtual                          tinyint 0/1
  has_registration_url              tinyint 0/1
  has_attendance_data                tinyint 0/1 - coverage flag; when 0, the four
                                      attendance columns below are NULL. Always filter
                                      or guard on has_attendance_data = 1 when
                                      averaging/summing any of them.
  ieee_attending                       decimal, NULL unless has_attendance_data = 1
  guests_attending                      decimal, NULL unless has_attendance_data = 1
  total_attending                        decimal, NULL unless has_attendance_data = 1
  ieee_attending_share_pct                decimal, NULL unless has_attendance_data = 1
  link                                     varchar
  description_plain                         text, longer free-text description
  keywords_clean                             varchar, comma-separated free-text tags

dim_date        date_key (PK), full_date (DATE), year int, month int (1-12),
                month_name varchar, quarter int (1-4),
                day_of_week varchar ('Monday'..'Sunday', from DAYNAME(full_date))
dim_category    category_key (PK), category_name varchar
dim_location    location_key (PK), city varchar, country_name varchar
dim_host        host_key (PK), host_name varchar
dim_format      format_key (PK), event_format varchar (on-site / virtual / hybrid)

Join fact_events to a dim_ table on the matching _key column, e.g.:
  fact_events f JOIN dim_date d ON f.date_key = d.date_key
  fact_events f JOIN dim_location l ON f.location_key = l.location_key

Weekday/weekend questions ARE answerable: use dim_date.day_of_week directly
(it's already a name like 'Saturday', not something to derive), or
WEEKDAY(d.full_date)/DAYOFWEEK(d.full_date) if you need a numeric form. Do
not say weekday data is unavailable - it's a real column, use it.

IMPORTANT - keywords_clean: this is a single comma-separated text column, not
a related table. It can only be filtered with LIKE (e.g. keywords_clean LIKE
'%robotics%') to find matching conferences. Do NOT try to split it into
individual tags/rows to count or rank keywords (no JSON_TABLE, no recursive
CTE, no user-defined split function exists in this schema) - that isn't
answerable here, so say so plainly instead of attempting a large query for it.

Keep each query simple: a single SELECT with plain WHERE/GROUP BY/ORDER BY/
LIMIT. Avoid deeply nested subqueries or long multi-line string manipulation -
if a query needs more than a few lines, it's almost certainly the wrong
approach for this schema.

This is the full set of tables available - do not reference any other table
or column name, and do not invent columns not listed above. There is no
attendee-level or session-level table.
""".strip()


# Whitelist of tables the assistant's SQL is allowed to touch - checked
# against every FROM/JOIN target before a query is ever executed.
_SQL_ALLOWED_TABLES = {
    "fact_events", "dim_date", "dim_category", "dim_location", "dim_host", "dim_format",
}
# Statement types that are never allowed, regardless of table.
_SQL_FORBIDDEN_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|GRANT|REVOKE|TRUNCATE|"
    r"ATTACH|DETACH|CALL|EXEC|EXECUTE|MERGE|LOAD|OUTFILE|INFILE|INTO\s+OUTFILE)\b",
    re.IGNORECASE,
)
_SQL_TABLE_REF = re.compile(r"\b(?:FROM|JOIN)\s+`?(\w+)`?", re.IGNORECASE)


def _validate_readonly_sql(sql):
    """Only allows a single read-only SELECT against the whitelisted
    warehouse tables above. Raises ValueError with a message that gets fed
    straight back to the model as the tool result, so it can see what went
    wrong and try a corrected query - the model never gets a raw stack
    trace or a chance to run anything destructive."""
    cleaned = sql.strip().rstrip(";").strip()
    if not cleaned:
        raise ValueError("Empty query.")
    if ";" in cleaned:
        raise ValueError("Only a single statement is allowed (no semicolons).")
    if not re.match(r"^\s*(SELECT|WITH)\b", cleaned, re.IGNORECASE):
        raise ValueError("Only SELECT (or WITH ... SELECT) statements are allowed.")
    if _SQL_FORBIDDEN_KEYWORDS.search(cleaned):
        raise ValueError("This statement type isn't allowed - read-only SELECT queries only.")
    referenced = {t.lower() for t in _SQL_TABLE_REF.findall(cleaned)}
    unknown = referenced - _SQL_ALLOWED_TABLES
    if unknown:
        raise ValueError(
            f"Unknown table(s): {', '.join(sorted(unknown))}. "
            f"Only these tables exist: {', '.join(sorted(_SQL_ALLOWED_TABLES))}."
        )
    return cleaned


_SQL_ROW_LIMIT = 200


def _run_assistant_sql(sql):
    """Validates and executes a query written by the assistant model,
    capping rows returned so one broad SELECT can't flood the context."""
    cleaned = _validate_readonly_sql(sql)
    if not re.search(r"\bLIMIT\s+\d+\b", cleaned, re.IGNORECASE):
        cleaned = f"{cleaned} LIMIT {_SQL_ROW_LIMIT}"
    rows = query(cleaned)
    truncated = len(rows) >= _SQL_ROW_LIMIT
    return rows, truncated


# Tool/function-calling definition passed to Groq so the model can ground
# *any* question in a live query instead of only the questions a developer
# anticipated and pre-aggregated.
_SQL_TOOL = {
    "type": "function",
    "function": {
        "name": "run_sql_query",
        "description": (
            "Run a single read-only SQL SELECT statement against the "
            "ieee_conferences_dw MySQL warehouse and get back the result rows. "
            "Use this for any question that needs a number, breakdown, or "
            "ranking not already given to you - e.g. attendance by month, by "
            "country, top single conferences, etc. Only SELECT is allowed, "
            "and only against the tables described in the schema."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "A single read-only SELECT statement, using only the documented tables/columns.",
                }
            },
            "required": ["sql"],
        },
    },
}


@app.route("/api/schema")
def schema():
    """Exposes DATASET_INFO so the frontend can render a plain-language
    'what this assistant can see' panel, instead of the user having to
    guess or the assistant having to explain it turn by turn."""
    return jsonify(DATASET_INFO)


@app.route("/api/overview")
def overview():
    kpis = query("""
        SELECT
            COUNT(*) AS total_conferences,
            COUNT(DISTINCT location_key) AS locations,
            ROUND(AVG(duration_hours), 1) AS avg_duration_hours,
            ROUND(100.0 * SUM(CASE WHEN `virtual` = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS virtual_rate_pct,
            ROUND(100.0 * SUM(CASE WHEN cancelled = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS cancelled_rate_pct
        FROM fact_events
    """)
    monthly = query("""
        SELECT d.year, d.month, d.month_name, COUNT(*) AS conference_count
        FROM fact_events f
        JOIN dim_date d ON f.date_key = d.date_key
        GROUP BY d.year, d.month, d.month_name
        ORDER BY d.year, d.month
    """)
    return jsonify({"kpis": kpis[0] if kpis else {}, "monthly_trend": monthly})


def _category_breakdown():
    return query("""
        SELECT c.category_name, COUNT(*) AS conference_count,
               ROUND(AVG(f.duration_hours), 1) AS avg_duration_hours
        FROM fact_events f JOIN dim_category c ON f.category_key = c.category_key
        GROUP BY c.category_name ORDER BY conference_count DESC
    """)


def _geographic_breakdown():
    return query("""
        SELECT l.country_name, COUNT(*) AS conference_count
        FROM fact_events f JOIN dim_location l ON f.location_key = l.location_key
        GROUP BY l.country_name ORDER BY conference_count DESC LIMIT 10
    """)


def _host_breakdown():
    return query("""
        SELECT h.host_name, COUNT(*) AS conference_count
        FROM fact_events f JOIN dim_host h ON f.host_key = h.host_key
        GROUP BY h.host_name ORDER BY conference_count DESC LIMIT 10
    """)


def _attendance_breakdown():
    coverage = query("""
        SELECT ROUND(100.0 * SUM(CASE WHEN has_attendance_data = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS reporting_coverage_pct,
               ROUND(AVG(total_attending), 0) AS avg_total_attending
        FROM fact_events
    """)
    by_format = query("""
        SELECT fmt.event_format, ROUND(AVG(f.total_attending), 0) AS avg_attending
        FROM fact_events f JOIN dim_format fmt ON f.format_key = fmt.format_key
        WHERE f.has_attendance_data = 1
        GROUP BY fmt.event_format ORDER BY avg_attending DESC
    """)
    return {"summary": coverage[0] if coverage else {}, "by_format": by_format}


# ---------------------------------------------------------------------------
# Recommendations / explorer
#
# The warehouse only stores per-conference *aggregates* joined to
# category / country / host / format dimensions - there's no individual
# conference title column to recommend. So instead of inventing per-event
# results, this powers an "explore by dimension" experience: search matches
# a category, country or host; the response also includes cross-dimension
# recommendations (e.g. search "Robotics" -> see which hosts and countries
# run the most Robotics conferences). Two scores make this feel like an
# actual recommender instead of a plain filtered list:
#   - match_pct on search results: how closely the name matches what was
#     typed (plain string similarity).
#   - match_pct on related/cross-dimension rows: a real conditional-
#     probability affinity - "of all conferences in the thing you picked,
#     what share also involve this host/country/category" - computed
#     straight from the joint vs. total counts, nothing invented.
# ---------------------------------------------------------------------------

# Whitelisted so a search term can never be interpolated into SQL as a
# table/column name - only ever bound as a parameter.
#
# NOTE on "country": dim_location has one row per (city, country) pair, not
# one row per country - so grouping or filtering by its key column
# (location_key) was splitting a single country like India across several
# rows (one per city), each with its own count/percentage. Country is
# handled as a special case below: grouped and filtered by country_name
# itself, never by location_key.
_DIMENSIONS = {
    "category": dict(table="dim_category", key="category_key", name="category_name"),
    "country": dict(table="dim_location", key="country_name", name="country_name"),
    "host": dict(table="dim_host", key="host_key", name="host_name"),
}


def _dimension_stats(display_dim, filter_dim=None, filter_key=None, name_like=None, limit=8):
    """Aggregates fact_events grouped by `display_dim`'s dimension table,
    optionally restricted to rows where a *different* dimension
    (`filter_dim`) equals `filter_key`. Kept as two separate dimension
    arguments on purpose - collapsing them into one was an earlier bug
    that filtered the wrong key column entirely."""
    cfg = _DIMENSIONS[display_dim]
    where = "1=1"
    params = []

    if filter_dim is not None and filter_key is not None:
        if filter_dim == "country":
            # fact_events only carries location_key, not country_name
            # directly, so filtering by country goes through a subquery
            # instead of a straight column match.
            where = "f.location_key IN (SELECT location_key FROM dim_location WHERE country_name = %s)"
        else:
            where = f"f.{_DIMENSIONS[filter_dim]['key']} = %s"
        params.append(filter_key)
    elif name_like is not None:
        where = f"d.{cfg['name']} LIKE %s"
        params.append(f"%{name_like}%")

    if display_dim == "country":
        # Grouped by country_name ONLY - never by location_key, or a
        # country with multiple cities on record would show up as several
        # separate "countries" with different counts.
        sql = f"""
            SELECT d.country_name AS name, d.country_name AS key_value,
                   COUNT(*) AS conference_count,
                   ROUND(AVG(f.duration_hours), 1) AS avg_duration_hours,
                   ROUND(AVG(CASE WHEN f.has_attendance_data = 1 THEN f.total_attending END), 0) AS avg_attending
            FROM fact_events f JOIN dim_location d ON f.location_key = d.location_key
            WHERE {where}
            GROUP BY d.country_name
            ORDER BY conference_count DESC
            LIMIT {int(limit)}
        """
    else:
        sql = f"""
            SELECT d.{cfg['name']} AS name, d.{cfg['key']} AS key_value,
                   COUNT(*) AS conference_count,
                   ROUND(AVG(f.duration_hours), 1) AS avg_duration_hours,
                   ROUND(AVG(CASE WHEN f.has_attendance_data = 1 THEN f.total_attending END), 0) AS avg_attending
            FROM fact_events f JOIN {cfg['table']} d ON f.{cfg['key']} = d.{cfg['key']}
            WHERE {where}
            GROUP BY d.{cfg['name']}, d.{cfg['key']}
            ORDER BY conference_count DESC
            LIMIT {int(limit)}
        """
    return query(sql, params)


def _keyword_matches(q, limit=6):
    """Searches the actual per-conference keywords_clean column (falling
    back to title) instead of only matching category/country/host names -
    this is what lets a search for something like "blockchain" surface
    individual conferences even when it isn't a category name itself.
    Each match's score is the best similarity between the typed query and
    any single tag in that conference's keyword list.

    A conference series (e.g. an annual event) has one fact_events row per
    edition/year, so the same title can legitimately appear many times.
    Without deduping, a search would show several cards with the identical
    name/host/country and no visible difference except a slightly different
    match score per edition - confusing, since there's nothing to tell them
    apart. Editions of the same title are collapsed into a single card here,
    keeping the best-matching edition as the one you actually open (its
    event_id/category/etc.), tagged with how many editions exist so that's
    not silently hidden either."""
    like_q = f"%{q}%"
    rows = query("""
        SELECT f.event_id, f.title, f.keywords_clean, f.total_attending,
               f.has_attendance_data, f.duration_hours,
               f.category_key, c.category_name,
               f.host_key, h.host_name,
               f.location_key, l.country_name
        FROM fact_events f
        LEFT JOIN dim_category c ON f.category_key = c.category_key
        LEFT JOIN dim_host h ON f.host_key = h.host_key
        LEFT JOIN dim_location l ON f.location_key = l.location_key
        WHERE f.keywords_clean LIKE %s OR f.title LIKE %s
        LIMIT 200
    """, [like_q, like_q])

    by_title = {}
    for r in rows:
        tags = [t.strip() for t in (r.get("keywords_clean") or "").split(",") if t.strip()]
        tag_ratio = max((SequenceMatcher(None, q.lower(), t.lower()).ratio() for t in tags), default=0)
        title_ratio = SequenceMatcher(None, q.lower(), (r.get("title") or "").lower()).ratio()
        candidate = {
            "type": "keyword",
            "name": r["title"],
            "key_value": r["event_id"],
            "category_key": r["category_key"],
            "category_name": r["category_name"],
            "host_name": r["host_name"],
            "country_name": r["country_name"],
            "conference_count": 1,
            "avg_attending": r["total_attending"] if r["has_attendance_data"] else None,
            "avg_duration_hours": r["duration_hours"],
            "match_pct": round(100 * max(tag_ratio, title_ratio)),
        }

        # Group by title only - host/country can genuinely differ between
        # editions (a conference series moving city each year), and that's
        # useful info to keep on the representative card, not something to
        # collapse away.
        dedup_key = (r["title"] or "").strip().lower()
        existing = by_title.get(dedup_key)
        if existing is None:
            by_title[dedup_key] = {**candidate, "instance_count": 1}
        else:
            instance_count = existing["instance_count"] + 1
            # Keep whichever edition matched the search better as the one
            # that actually opens, but always carry the running count.
            best = candidate if candidate["match_pct"] > existing["match_pct"] else existing
            by_title[dedup_key] = {**best, "instance_count": instance_count}

    results = list(by_title.values())
    results.sort(key=lambda r: r["match_pct"], reverse=True)
    return results[:limit]


def _total_conferences():
    row = query("SELECT COUNT(*) AS n FROM fact_events")
    return row[0]["n"] if row else 0


@app.route("/api/trending")
def trending():
    """Default, no-search-yet state: the most-represented category, host
    and country overall, tagged with what share of the whole dataset each
    one accounts for, so the Recommendations page never opens on a blank
    screen."""
    grand_total = _total_conferences() or 1

    def with_share(rows):
        for r in rows:
            r["match_pct"] = round(100 * r["conference_count"] / grand_total)
        return rows

    return jsonify({
        "category": with_share(_dimension_stats("category", limit=4)),
        "country": with_share(_dimension_stats("country", limit=4)),
        "host": with_share(_dimension_stats("host", limit=4)),
    })


def _dimension_match_count(dim, name_like):
    """Total rows that would match a name_like search for this dimension,
    ignoring the display LIMIT - lets the frontend say 'showing 8 of 23'
    instead of silently capping the list."""
    cfg = _DIMENSIONS[dim]
    like = f"%{name_like}%"
    if dim == "country":
        row = query("SELECT COUNT(DISTINCT country_name) AS n FROM dim_location WHERE country_name LIKE %s", [like])
    else:
        row = query(f"SELECT COUNT(*) AS n FROM {cfg['table']} WHERE {cfg['name']} LIKE %s", [like])
    return row[0]["n"] if row else 0


def _keyword_match_count(q):
    """Distinct-title count, matching the dedup in _keyword_matches - so the
    'showing N of M' note in the UI reflects how many distinct conferences
    exist, not how many raw per-edition rows matched."""
    like = f"%{q}%"
    row = query(
        "SELECT COUNT(DISTINCT title) AS n FROM fact_events WHERE keywords_clean LIKE %s OR title LIKE %s",
        [like, like],
    )
    return row[0]["n"] if row else 0


@app.route("/api/search")
def search():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"query": q, "results": [], "total_matches": {}})

    try:
        # Per-type result cap so the list stays readable; total_matches
        # below tells the frontend how many more exist beyond that cap.
        per_type_limit = 8
        results = []
        total_matches = {}
        for dim in _DIMENSIONS:
            for row in _dimension_stats(dim, name_like=q, limit=per_type_limit):
                # Plain string-similarity score against the typed query -
                # this is what makes "match_pct" meaningful for a text
                # search, rather than just re-showing the count.
                row["match_pct"] = round(100 * SequenceMatcher(None, q.lower(), row["name"].lower()).ratio())
                results.append({"type": dim, **row})
            total_matches[dim] = _dimension_match_count(dim, q)

        # Also search the per-conference keyword tags, not just the three
        # dimension names - a search like "blockchain" should be able to
        # surface actual conferences even when "Blockchain" isn't itself a
        # category/country/host name.
        results.extend(_keyword_matches(q, limit=per_type_limit))
        total_matches["keyword"] = _keyword_match_count(q)

        results.sort(key=lambda r: (r["match_pct"], r["conference_count"]), reverse=True)
        return jsonify({"query": q, "results": results, "total_matches": total_matches})
    except Exception as e:
        app.logger.exception("search failed for q=%r", q)
        return jsonify({"error": f"search failed: {e}"}), 500


@app.route("/api/related")
def related():
    """Given a matched dimension (type + its key_value from /api/search),
    return the other two dimensions' breakdowns filtered to that match,
    each carrying an affinity score: the percentage of that selection's
    conferences that also involve this particular host/country/category."""
    dim = request.args.get("type")
    key_value = request.args.get("key")
    name = request.args.get("name", "")

    if dim not in _DIMENSIONS or not key_value or key_value == "undefined" or key_value == "null":
        return jsonify({"error": "type must be one of category/country/host, and a valid key is required"}), 400

    try:
        if dim == "country":
            where = "f.location_key IN (SELECT location_key FROM dim_location WHERE country_name = %s)"
        else:
            where = f"f.{_DIMENSIONS[dim]['key']} = %s"

        attendance = query(f"""
            SELECT ROUND(AVG(CASE WHEN f.has_attendance_data = 1 THEN f.total_attending END), 0) AS avg_attending,
                   ROUND(AVG(f.duration_hours), 1) AS avg_duration_hours,
                   COUNT(*) AS conference_count
            FROM fact_events f WHERE {where}
        """, [key_value])
        stats = attendance[0] if attendance else {}
        selection_total = stats.get("conference_count") or 1

        other_dims = [d for d in _DIMENSIONS if d != dim]
        related_data = {}
        for d in other_dims:
            rows = _dimension_stats(d, filter_dim=dim, filter_key=key_value, limit=6)
            for r in rows:
                r["match_pct"] = round(100 * r["conference_count"] / selection_total)
            related_data[d] = rows

        return jsonify({
            "for": {"type": dim, "name": name, "key": key_value},
            "stats": stats,
            "related": related_data,
        })
    except Exception as e:
        app.logger.exception("related failed for type=%r key=%r", dim, key_value)
        return jsonify({"error": f"related lookup failed: {e}"}), 500


@app.route("/api/insights")
def insights():
    """Feeds the Home page's extra sections (format comparison, top hosts
    and countries at a glance) - all reusing the same breakdown queries
    the assistant is grounded on, so the numbers never drift apart."""
    return jsonify({
        "by_category": _category_breakdown()[:6],
        "top_countries": _geographic_breakdown()[:6],
        "top_hosts": _host_breakdown()[:6],
        "attendance": _attendance_breakdown(),
    })


# ---------------------------------------------------------------------------
# Assistant
# ---------------------------------------------------------------------------

# Matches bracketed / arrow-style inline citations the model sometimes adds,
# e.g. "【attendance → by_format】" or "[attendance -> by_format]". Answers
# should read like plain prose, not annotate their own source lookup.
_CITATION_PATTERN = re.compile(r"[\u3010\[][^\u3011\]\n]{0,80}(?:\u2192|->)[^\u3011\]\n]{0,80}[\u3011\]]")


def _strip_inline_citations(text):
    return re.sub(r"\s{2,}", " ", _CITATION_PATTERN.sub("", text)).strip()


def _dataset_description_for_prompt():
    lines = ["DATASET THIS ASSISTANT IS CONNECTED TO:",
             f"- {DATASET_INFO['connection']['name']} ({DATASET_INFO['connection']['engine']}), "
             f"{DATASET_INFO['grain']}"]
    lines.append("Available dimensions:")
    for d in DATASET_INFO["dimensions"]:
        gap = f" (does NOT include: {', '.join(d['not_included'])})" if d.get("not_included") else ""
        lines.append(f"- {d['covers']}: {', '.join(d['fields'])}{gap}")
    lines.append(f"Available facts/metrics: {', '.join(DATASET_INFO['facts'])}")
    lines.append("Known gaps (state these plainly and directly if asked, do not hedge):")
    for g in DATASET_INFO["known_gaps"]:
        lines.append(f"- {g}")
    return "\n".join(lines)


# Cache the 5-query "grounding" summary instead of recalculating it on every
# single message. Conference data doesn't change second-to-second, so
# reusing a slightly-stale summary for a few minutes is safe and removes
# 5 database round trips from the hot path of every assistant reply.
_SUMMARY_CACHE = {"data": None, "computed_at": 0}
_SUMMARY_CACHE_TTL_SECONDS = 300  # 5 minutes


def _get_cached_summary():
    now = time.time()
    if _SUMMARY_CACHE["data"] is None or (now - _SUMMARY_CACHE["computed_at"]) > _SUMMARY_CACHE_TTL_SECONDS:
        _SUMMARY_CACHE["data"] = {
            "overview": overview().get_json(),
            "by_category": _category_breakdown(),
            "top_countries": _geographic_breakdown(),
            "top_hosts": _host_breakdown(),
            "attendance": _attendance_breakdown(),
        }
        _SUMMARY_CACHE["computed_at"] = now
    return _SUMMARY_CACHE["data"]


_MAX_TOOL_ROUNDS = 3


@app.route("/api/assistant", methods=["POST"])
def assistant():
    if groq_client is None:
        return jsonify({
            "error": "GROQ_API_KEY is not set. Add it to a .env file next to app.py. "
                     "Get a free key at console.groq.com - no credit card required."
        }), 500

    body = request.get_json(force=True) or {}
    user_message = body.get("message", "").strip()
    raw_history = body.get("history", [])  # [{role: "user"|"assistant", content: "...", ...}]

    if not user_message:
        return jsonify({"error": "message is required"}), 400

    # The frontend's history entries carry extra UI-only fields (e.g.
    # queriesUsed, for the "live queries" panel on assistant messages).
    # Groq's API validates message shape strictly and rejects any
    # unrecognized property, so only role/content ever get forwarded -
    # everything else is the frontend's business, not the model's.
    history = [
        {"role": m.get("role"), "content": m.get("content", "")}
        for m in raw_history
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]

    # Ground the assistant in real aggregate numbers pulled fresh from the
    # warehouse (same source of truth as the Home page's KPI cards) so common
    # questions answer instantly without a round trip. Anything more specific
    # - a breakdown by month, by country, a single conference, etc. - the
    # model can get itself via the run_sql_query tool below, instead of the
    # answer being capped at whatever a developer thought to precompute.
    summary = _get_cached_summary()

    system_prompt = (
        "You are a data assistant for an IEEE conference analytics dashboard. "
        "Ground every answer in real data from this warehouse - either the "
        "precomputed summary below, or, for anything more specific (a "
        "breakdown by month, by country, a particular conference, a ranking, "
        "etc.), by calling run_sql_query yourself. Prefer calling the tool "
        "over saying data isn't available - most questions about this "
        "warehouse's dimensions and metrics CAN be answered with the right "
        "query. Only say something can't be answered after you've tried a "
        "query for it (or it's genuinely outside the schema, e.g. "
        "attendee-level or session-level detail), and say so plainly in one sentence, "
        "naming what IS available instead of hedging. Never invent figures, "
        "event names, or numbers not returned by the summary or a query. "
        "Keep answers short (2-4 sentences), write in plain prose, and cite "
        "actual numbers. Never add bracketed source tags, arrows, or "
        "footnote-style references (e.g. no '[attendance -> by_format]' or "
        "'\u3010...\u3011') - just state the number in the sentence itself.\n\n"
        f"{_dataset_description_for_prompt()}\n\n"
        f"{SQL_SCHEMA_FOR_ASSISTANT}\n\n"
        f"PRECOMPUTED SUMMARY (JSON):\n{summary}"
    )

    # Groq uses the OpenAI-style chat format: system prompt is just the
    # first message in the list, not a separate parameter.
    messages = [{"role": "system", "content": system_prompt}] + history + [
        {"role": "user", "content": user_message}
    ]

    queries_used = []  # surfaced to the frontend for the "data used" panel

    try:
        round_idx = 0
        while round_idx < _MAX_TOOL_ROUNDS:
            round_idx += 1
            try:
                response = groq_client.chat.completions.create(
                    model="openai/gpt-oss-120b",
                    max_tokens=1024,
                    messages=messages,
                    tools=[_SQL_TOOL],
                    tool_choice="auto",
                )
            except BadRequestError as e:
                # A tool call that got cut off mid-generation (usually a
                # query the model made too long/complex) comes back as a
                # 400 with code "tool_use_failed" and no usable message
                # object - there's nothing to append to `messages` for it,
                # so nudge the model in plain text and let it retry rather
                # than surfacing a raw API error to the user.
                error_code = None
                try:
                    error_code = (e.body or {}).get("error", {}).get("code")
                except Exception:
                    pass
                if error_code == "tool_use_failed" and round_idx < _MAX_TOOL_ROUNDS:
                    messages.append({
                        "role": "user",
                        "content": (
                            "Your last query didn't come through - it was likely too long or complex "
                            "and got cut off. Try again with a single, simple SELECT (no long subqueries "
                            "or string-splitting), or answer directly if it's not something a simple "
                            "query can compute here."
                        ),
                    })
                    continue
                raise

            msg = response.choices[0].message
            tool_calls = getattr(msg, "tool_calls", None)

            if not tool_calls:
                reply_text = _strip_inline_citations(msg.content or "")
                return jsonify({"reply": reply_text, "queries_used": queries_used})

            # The assistant asked to run one or more queries - append its
            # tool-call message, execute each safely, feed results back, and
            # let it keep going (it may chain a follow-up query off the
            # first result, e.g. find the top month, then drill into it).
            messages.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in tool_calls
                ],
            })

            for tc in tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                    sql = args.get("sql", "")
                    rows, truncated = _run_assistant_sql(sql)
                    queries_used.append({"sql": sql, "row_count": len(rows), "truncated": truncated})
                    result_payload = json.dumps({"rows": rows, "truncated": truncated}, default=str)
                except Exception as tool_err:
                    result_payload = json.dumps({"error": str(tool_err)})

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result_payload,
                })

        # Ran out of rounds without a final text answer - ask once more
        # without tool access so the user still gets a reply.
        response = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            max_tokens=400,
            messages=messages + [
                {"role": "user", "content": "Please answer now with what you've found so far, in plain prose."}
            ],
        )
        reply_text = _strip_inline_citations(response.choices[0].message.content or "")
        return jsonify({"reply": reply_text, "queries_used": queries_used})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=False, port=5000)
