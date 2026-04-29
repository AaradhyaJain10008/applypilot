#!/bin/bash
# Job Applier — launcher
# Double-click this file in Finder (macOS) to start the Flask server.
# Closes the old server (if any) on the configured port, then boots a fresh one.

cd "$(dirname "$0")" || exit 1

# Read FLASK_PORT from .env if present; default to 5001.
if [ -f ".env" ]; then
    PORT=$(grep -E '^FLASK_PORT=' .env | tail -n1 | cut -d= -f2 | tr -d ' "')
fi
PORT="${PORT:-5001}"

echo "======================================================"
echo " Job Applier — starting Flask server"
echo " Project: $(pwd)"
echo " Port:    $PORT"
echo "======================================================"
echo ""

OLD_PID=$(lsof -ti:"$PORT" 2>/dev/null)
if [ -n "$OLD_PID" ]; then
    echo "Stopping previous server (pid $OLD_PID) on port $PORT..."
    kill -9 "$OLD_PID" 2>/dev/null
    sleep 1
fi

if [ -x ".venv/bin/python" ]; then
    PY=".venv/bin/python"
else
    PY="python3"
fi

echo "Using interpreter: $PY"
echo "Starting server — open http://localhost:$PORT in your browser."
echo "Press Ctrl-C in this window to stop the server."
echo ""

exec "$PY" app.py
