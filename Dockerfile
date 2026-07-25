# ── Stage 1: Build the React frontend ──────────────────────────────────────────
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# Use the web-only vite config (no Electron plugin) for a clean production build
RUN npx vite build --config vite.dev.config.ts

# ── Stage 2: Python backend + bundled frontend ──────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Build tools needed for some pip packages
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source
COPY backend ./backend

# Copy the pre-built frontend dist so FastAPI can serve it
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Render injects PORT; default to 10000 for local runs
ENV PORT=10000
EXPOSE 10000

WORKDIR /app/backend
# sys.path already includes /app/backend so config.py is importable
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}
