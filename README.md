# Conference Pulse

Analytics dashboard for IEEE conferences. A MySQL star-schema warehouse feeds a Flask API and a React frontend with an embedded Power BI report, an AI data assistant, and a search-driven recommendation explorer.

## Features

- **Home** - live KPI cards (conference count, locations, average duration, virtual rate), attendance by format, top countries and hosts, and the embedded Power BI dashboard with a fullscreen option.
- **Ask the Assistant** - chat assistant (Groq) that answers from aggregates computed live from the warehouse: categories, countries, cities, hosts, formats, attendance by month, day of week and year. Chat history is saved in the browser and shown in a sidebar.
- **Explore & Recommend** - search by category, country, host or conference keyword. Each result gets a match score, and selecting one shows which hosts, countries or categories most often appear alongside it, with a co-occurrence percentage.

## Tech stack

| Layer | Tools |
|---|---|
| Database | MySQL (star schema: `fact_events` + date, location, category, host and format dimensions) |
| Backend | Python, Flask, flask-cors, mysql-connector-python, Groq SDK |
| Frontend | React 19, Vite |
| BI | Power BI (published report embedded via iframe) |

## Project structure

```
backend/     Flask API (app.py), requirements.txt, .env.example
frontend/    React + Vite app (src/pages, src/components, src/lib)
db/          build_star_schema_mysql_FINAL.sql (warehouse build script)
```

## Getting started

### 1. Build the database

1. Open `db/build_star_schema_mysql_FINAL.sql` in MySQL Workbench.
2. Change the CSV path in the `LOAD DATA LOCAL INFILE` statement to where your cleaned conferences CSV lives (the CSV is not included in this repo).
3. Run the script. It creates the `ieee_conferences_dw` database, the staging table, the dimensions and `fact_events`.

### 2. Run the backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then fill in your real values
python app.py
```

`.env` needs:

```
GROQ_API_KEY=your_groq_key        # free at https://console.groq.com/keys
MYSQL_PASSWORD=your_mysql_password
```

The API runs on `http://localhost:5000`.

### 3. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Notes

- The Power BI embed URL is set in `frontend/src/pages/HomePage.jsx`. Replace it with your own "Publish to web" link.
- The API address is set in `frontend/src/lib/api.js`.
- Attendance averages only include conferences where `has_attendance_data = 1`.
- Never commit `.env`. It is listed in `.gitignore`.
