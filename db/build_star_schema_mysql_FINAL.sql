-- ===========================================================================
-- IEEE Conferences - Star Schema (MySQL) — CONSOLIDATED / CORRECTED VERSION
-- Combines build_star_schema_mysql_1.sql + fix_boolean_columns.sql into one
-- clean, run-once script.
--
-- FIX APPLIED: is_multiday, cancelled, virtual, has_registration_url, and
-- has_attendance_data are now VARCHAR(10) in staging_conferences from the
-- start (not TINYINT(1)), so the literal "True"/"False" text in the CSV
-- loads correctly instead of silently collapsing to 0/False.
--
-- Run this whole script in MySQL Workbench (lightning bolt / Execute icon).
-- ===========================================================================

DROP DATABASE IF EXISTS ieee_conferences_dw;
CREATE DATABASE ieee_conferences_dw;
USE ieee_conferences_dw;

SET GLOBAL local_infile = 1;

-- ---------------------------------------------------------------------------
-- STEP 1 — Staging table: mirrors the CSV, but boolean-like columns are
--   VARCHAR so "True"/"False" text survives the import.
-- ---------------------------------------------------------------------------
CREATE TABLE staging_conferences (
    event_id                  INT,
    title                     VARCHAR(500),
    category_name             VARCHAR(100),
    start_time_utc            DATETIME,
    end_time_utc              DATETIME,
    event_year                INT,
    event_month                INT,
    event_month_name           VARCHAR(20),
    duration_hours              DECIMAL(10,2),
    is_multiday                 VARCHAR(10),   -- was TINYINT(1) — fixed
    event_format                 VARCHAR(20),
    city                          VARCHAR(150),
    country_name                   VARCHAR(100),
    host_name                       VARCHAR(255),
    cancelled                        VARCHAR(10),  -- was TINYINT(1) — fixed
    link                               VARCHAR(500),
    description_plain                   TEXT,
    duration_minutes                     INT,
    `virtual`                             VARCHAR(10),  -- was TINYINT(1) — fixed
    ieee_attending                         DECIMAL(10,2),
    guests_attending                        DECIMAL(10,2),
    total_attending                          DECIMAL(10,2),
    keywords_clean                            VARCHAR(500),
    has_registration_url                       VARCHAR(10),  -- was TINYINT(1) — fixed
    has_attendance_data                         VARCHAR(10),  -- was TINYINT(1) — fixed
    ieee_attending_share_pct                     DECIMAL(6,2)
);

-- ---------------------------------------------------------------------------
-- STEP 2 — Import the CSV.
--   Easiest: right-click staging_conferences -> "Table Data Import Wizard"
--   -> select conferences_clean.csv -> Next through -> Finish.
--   OR uncomment/run the LOAD DATA statement below (update the path first).
-- ---------------------------------------------------------------------------
LOAD DATA LOCAL INFILE 'C:/Users/chadh/Desktop/IEEE/cleaning/conferences_clean.csv'
INTO TABLE staging_conferences
CHARACTER SET utf8mb4
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- Sanity check right after load: you should see a real mix of True/False here,
-- not just one value. If this looks wrong, stop and check the CSV path above.
SELECT `virtual`, COUNT(*) FROM staging_conferences GROUP BY `virtual`;
SELECT has_attendance_data, COUNT(*) FROM staging_conferences GROUP BY has_attendance_data;

-- ---------------------------------------------------------------------------
-- STEP 3 — Build dimension tables from the (now correctly loaded) staging data
-- ---------------------------------------------------------------------------
CREATE TABLE dim_date (
    date_key    INT PRIMARY KEY,
    full_date   DATE,
    year        INT,
    month       INT,
    month_name  VARCHAR(20),
    quarter     INT,
    day_of_week VARCHAR(15)
);

INSERT INTO dim_date (date_key, full_date, year, month, month_name, quarter, day_of_week)
SELECT DISTINCT
    CAST(DATE_FORMAT(start_time_utc, '%Y%m%d') AS UNSIGNED) AS date_key,
    DATE(start_time_utc)                                    AS full_date,
    event_year,
    event_month,
    event_month_name,
    QUARTER(start_time_utc),
    DAYNAME(start_time_utc)
FROM staging_conferences
WHERE start_time_utc IS NOT NULL;

CREATE TABLE dim_location (
    location_key  INT AUTO_INCREMENT PRIMARY KEY,
    city          VARCHAR(150),
    country_name  VARCHAR(100)
);

INSERT INTO dim_location (city, country_name)
SELECT DISTINCT city, country_name
FROM staging_conferences;

CREATE TABLE dim_category (
    category_key    INT AUTO_INCREMENT PRIMARY KEY,
    category_name   VARCHAR(100)
);

INSERT INTO dim_category (category_name)
SELECT DISTINCT category_name
FROM staging_conferences
WHERE category_name IS NOT NULL;

CREATE TABLE dim_host (
    host_key   INT AUTO_INCREMENT PRIMARY KEY,
    host_name  VARCHAR(255)
);

INSERT INTO dim_host (host_name)
SELECT DISTINCT host_name
FROM staging_conferences
WHERE host_name IS NOT NULL;

CREATE TABLE dim_format (
    format_key     INT AUTO_INCREMENT PRIMARY KEY,
    event_format   VARCHAR(20)
);

INSERT INTO dim_format (event_format)
SELECT DISTINCT event_format
FROM staging_conferences
WHERE event_format IS NOT NULL;

-- ---------------------------------------------------------------------------
-- STEP 4 — Build the fact table: converts "True"/"False" text into real 1/0,
--   and sets attendance fields to NULL when there's no real attendance data
--   (instead of treating a missing value as a 0).
-- ---------------------------------------------------------------------------
CREATE TABLE fact_events (
    event_id                  INT PRIMARY KEY,
    date_key                  INT,
    location_key               INT,
    category_key                INT,
    host_key                     INT,
    format_key                    INT,
    duration_hours                 DECIMAL(10,2),
    is_multiday                     TINYINT(1),
    cancelled                        TINYINT(1),
    `virtual`                         TINYINT(1),
    ieee_attending                     DECIMAL(10,2),
    guests_attending                    DECIMAL(10,2),
    total_attending                      DECIMAL(10,2),
    ieee_attending_share_pct              DECIMAL(6,2),
    has_registration_url                   TINYINT(1),
    has_attendance_data                     TINYINT(1),
    title                                    VARCHAR(500),
    link                                      VARCHAR(500),
    description_plain                          TEXT,
    keywords_clean                              VARCHAR(500),
    FOREIGN KEY (date_key)     REFERENCES dim_date(date_key),
    FOREIGN KEY (location_key) REFERENCES dim_location(location_key),
    FOREIGN KEY (category_key) REFERENCES dim_category(category_key),
    FOREIGN KEY (host_key)     REFERENCES dim_host(host_key),
    FOREIGN KEY (format_key)   REFERENCES dim_format(format_key)
);

INSERT INTO fact_events (
    event_id, date_key, location_key, category_key, host_key, format_key,
    duration_hours, is_multiday, cancelled, `virtual`,
    ieee_attending, guests_attending, total_attending, ieee_attending_share_pct,
    has_registration_url, has_attendance_data,
    title, link, description_plain, keywords_clean
)
SELECT
    s.event_id,
    CAST(DATE_FORMAT(s.start_time_utc, '%Y%m%d') AS UNSIGNED),
    loc.location_key,
    cat.category_key,
    hst.host_key,
    fmt.format_key,
    s.duration_hours,
    CASE WHEN s.is_multiday = 'True' THEN 1 ELSE 0 END,
    CASE WHEN s.cancelled   = 'True' THEN 1 ELSE 0 END,
    CASE WHEN s.`virtual`   = 'True' THEN 1 ELSE 0 END,
    CASE WHEN s.has_attendance_data = 'True' THEN s.ieee_attending ELSE NULL END,
    CASE WHEN s.has_attendance_data = 'True' THEN s.guests_attending ELSE NULL END,
    CASE WHEN s.has_attendance_data = 'True' THEN s.total_attending ELSE NULL END,
    CASE WHEN s.has_attendance_data = 'True' THEN s.ieee_attending_share_pct ELSE NULL END,
    CASE WHEN s.has_registration_url = 'True' THEN 1 ELSE 0 END,
    CASE WHEN s.has_attendance_data  = 'True' THEN 1 ELSE 0 END,
    s.title,
    s.link,
    s.description_plain,
    s.keywords_clean
FROM staging_conferences s
LEFT JOIN dim_location loc ON loc.city = s.city AND loc.country_name = s.country_name
LEFT JOIN dim_category cat ON cat.category_name = s.category_name
LEFT JOIN dim_host     hst ON hst.host_name = s.host_name
LEFT JOIN dim_format   fmt ON fmt.event_format = s.event_format;

-- ---------------------------------------------------------------------------
-- STEP 5 — Verification
-- ---------------------------------------------------------------------------

-- Each boolean should now show 2 distinct values (0 and 1), not just one.
SELECT 'virtual' AS col, `virtual` AS value, COUNT(*) AS n FROM fact_events GROUP BY `virtual`
UNION ALL
SELECT 'cancelled', cancelled, COUNT(*) FROM fact_events GROUP BY cancelled
UNION ALL
SELECT 'is_multiday', is_multiday, COUNT(*) FROM fact_events GROUP BY is_multiday
UNION ALL
SELECT 'has_registration_url', has_registration_url, COUNT(*) FROM fact_events GROUP BY has_registration_url
UNION ALL
SELECT 'has_attendance_data', has_attendance_data, COUNT(*) FROM fact_events GROUP BY has_attendance_data;

SELECT COUNT(*) AS total_rows FROM fact_events;

-- Same category summary as before, to confirm the joins work.
SELECT c.category_name, COUNT(*) AS n_events, ROUND(AVG(f.total_attending), 1) AS avg_attendance
FROM fact_events f
JOIN dim_category c ON f.category_key = c.category_key
GROUP BY c.category_name
ORDER BY n_events DESC;
