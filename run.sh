#!/usr/bin/env bash
# One-command local launcher for the Interactive AI Learning App.
set -e

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "Installing dependencies..."
pip install -q -r requirements.txt

echo ""
echo "Starting server at http://127.0.0.1:8000"
echo "(No GEMINI_API_KEY? No problem — the app runs in offline/mock mode.)"
echo ""
python3 server.py
