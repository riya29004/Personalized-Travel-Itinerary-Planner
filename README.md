# Personalized Travel Itinerary Planner

A full-stack planner for solo, couple, and group trips. It generates practical day-by-day itineraries in INR, supports guest trips in browser storage, and lets authenticated users save itineraries to Supabase.

## Stack

- React + Vite frontend
- Python + FastAPI backend
- Supabase PostgreSQL and Auth
- Groq for itinerary generation
- Google Maps search links for generated itinerary locations (no Maps API key required)

## Prerequisites

- Node.js 20+
- Python 3.11+
- A Supabase project and a Groq API key

## Setup

1. Copy `backend/.env.example` to `backend/.env` and fill in the API values. Never commit this file.
2. In Supabase SQL Editor, run `supabase/migrations/001_create_trips.sql`.
3. Copy `frontend/.env.example` to `frontend/.env` and fill in the public Supabase and Google Maps values.
4. Start the backend:

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

5. In another terminal, start the frontend:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

## Test

```powershell
cd backend
pytest
```

## API credentials

- `GROQ_API_KEY`: server-only Groq key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only; never expose it to the browser.
- `VITE_SUPABASE_ANON_KEY`: browser-safe Supabase publishable/anon key.

The application builds Google Maps search links from Groq's generated place queries. It does not call the Google Maps API or require a Google Maps API key. If Groq is not configured, the app reports a clear configuration error instead of silently returning fabricated data.
