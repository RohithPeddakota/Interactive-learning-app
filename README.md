# Interactive AI Learning Lab

An interactive, 3D, browser-based learning app covering **Biology** (Cell Explorer), **Physics** (Orbit Lab), and **Chemistry** (Molecule Builder). Click on any part of a 3D model to get an AI-generated, richly formatted explanation of what it is and how it works.

- **Frontend:** Vanilla JS (ES modules) + [Three.js](https://threejs.org/) for the 3D scenes, no build step required.
- **Backend:** [FastAPI](https://fastapi.tiangolo.com/) serving the static frontend and a small `/api/explain` proxy endpoint.
- **AI:** Google Gemini (`gemini-1.5-flash`) when an API key is configured. **Without a key, the app works out of the box** using a built-in library of hand-written mock explanations, so it's fully runnable offline/for free.

## Features

- 🧬 **Cell Explorer** — interactive 3D cell with clickable organelles (nucleus, mitochondria, ribosomes, ER, Golgi apparatus, cell membrane).
- 🌍 **Orbit Lab** — adjustable orbital simulation (radius, star mass, velocity) demonstrating circular, elliptical, collapsing, and escape trajectories.
- ⚛️ **Molecule Builder** — build and inspect simple molecules (methane, ammonia, oxygen gas, and more).
- 🤖 Optional live AI explanations via Gemini, with automatic graceful fallback to offline content if no key is set or the API call fails.

## Project structure

```
.
├── server.py              # FastAPI backend (serves static/ and /api/explain)
├── requirements.txt        # Python dependencies
├── run.sh                  # One-command local launcher
├── .env.example             # Template for optional GEMINI_API_KEY
└── static/
    ├── index.html
    ├── css/
    │   └── styles.css
    └── js/
        ├── app.js           # App entry point / UI wiring
        ├── api.js            # Backend calls + markdown parser
        ├── three-setup.js     # Shared Three.js scene helper
        └── modules/
            ├── cell-explorer.js
            ├── orbit-simulator.js
            └── molecule-builder.js
```

## Getting started

### Requirements
- Python 3.9+

### Quick start

```bash
git clone https://github.com/<your-username>/Interactive-learning-app.git
cd Interactive-learning-app
./run.sh
```

Then open **http://127.0.0.1:8000** in your browser.

`run.sh` creates a virtual environment, installs dependencies, and starts the server. On Windows, or if you'd rather do it manually:

```bash
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python3 server.py
```

### Enabling live AI explanations (optional)

By default, the app runs in **offline "sandbox mode"** with curated mock explanations — no key needed.

To use live Gemini-generated explanations:
1. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Either:
   - Copy `.env.example` to `.env` and set `GEMINI_API_KEY=your-key-here`, **or**
   - Paste the key directly into the app's Settings panel (stored only in your browser's `localStorage`).
3. Restart the server if you used the `.env` approach.

If the Gemini call ever fails (bad key, rate limit, offline), the app automatically falls back to the offline mock content so it never breaks.

## Deployment

The app is a single FastAPI process serving both the API and static files, so it deploys easily to any Python host (Render, Railway, Fly.io, a VPS, etc.):

```bash
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port $PORT
```

Set `GEMINI_API_KEY` as an environment variable on the host if you want live AI mode in production.

## Tech notes

- CORS is open (`allow_origins=["*"]`) for ease of local development — tighten this before deploying publicly with sensitive data.
- The frontend never talks to Gemini directly; all requests go through the `/api/explain` backend proxy, so an API key entered in the UI is only ever sent to your own server, not exposed in client-side network calls to Google.

## License

See [LICENSE](LICENSE).
https://interactive-learning-app-ls2e.onrender.com/

