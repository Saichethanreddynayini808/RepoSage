#!/usr/bin/env bash
# start.sh — One-command launcher for RepoSage
# Starts both the FastAPI backend and Vite frontend, cleans up on Ctrl+C.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}▶${RESET} $*"; }
success() { echo -e "${GREEN}✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET} $*"; }
error()   { echo -e "${RED}✗${RESET} $*"; }

echo ""
echo -e "${BOLD}🔍 RepoSage${RESET}"
echo "─────────────────────────────"
echo ""

# ── Requirement checks ────────────────────────────────────────────────────────
MISSING=0

# Python 3.9+
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
  error "Python 3.9+ is required but not found."
  echo "  Install it from: https://python.org/downloads"
  MISSING=1
else
  PYTHON_CMD=$(command -v python3 || command -v python)
  PY_VERSION=$("$PYTHON_CMD" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
  PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
  PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
  if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 9 ]; }; then
    error "Python 3.9+ required (found $PY_VERSION)."
    MISSING=1
  else
    success "Python $PY_VERSION"
  fi
fi

# Node 18+
if ! command -v node &>/dev/null; then
  error "Node.js 18+ is required but not found."
  echo "  Install it from: https://nodejs.org"
  MISSING=1
else
  NODE_VERSION=$(node -v | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$NODE_MAJOR" -lt 18 ]; then
    error "Node.js 18+ required (found $NODE_VERSION)."
    MISSING=1
  else
    success "Node.js $NODE_VERSION"
  fi
fi

# npm
if ! command -v npm &>/dev/null; then
  error "npm is required but not found."
  MISSING=1
else
  success "npm $(npm -v)"
fi

# uvicorn (Python)
if ! "$PYTHON_CMD" -m uvicorn --version &>/dev/null 2>&1; then
  warn "uvicorn not found — installing backend dependencies..."
  pip install -r "$SCRIPT_DIR/backend/requirements.txt" --quiet
fi

# npm install if node_modules missing
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
  info "Installing frontend dependencies..."
  npm --prefix "$SCRIPT_DIR/frontend" install --silent
fi

# Abort if hard requirements missing
if [ "$MISSING" -eq 1 ]; then
  echo ""
  error "Please install the missing requirements above and re-run start.sh"
  exit 1
fi

echo ""
# ── Start services ────────────────────────────────────────────────────────────
info "Starting backend  (FastAPI  → http://localhost:${BACKEND_PORT})"
cd "$SCRIPT_DIR/backend"
"$PYTHON_CMD" -m uvicorn main:app --reload --port "$BACKEND_PORT" \
  --log-level warning &
BACKEND_PID=$!

sleep 1  # Give uvicorn a moment to bind the port

info "Starting frontend (Vite     → http://localhost:${FRONTEND_PORT})"
cd "$SCRIPT_DIR/frontend"
npm run dev -- --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}${BOLD}✅ RepoSage is running!${RESET}"
echo -e "   Open: ${CYAN}http://localhost:${FRONTEND_PORT}${RESET}"
echo ""
echo "   Press Ctrl+C to stop."
echo ""

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  info "Stopping servers..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  success "Stopped."
  exit 0
}
trap cleanup INT TERM

wait
