# Multi-stage Dockerfile for Render deployment
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build:web

FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

ENV PORT=10000
EXPOSE 10000

WORKDIR /app/backend
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}
