#!/usr/bin/env bash
set -e

echo "=== Building frontend ==="
cd frontend
npm ci --include=dev
npx vite build --config vite.dev.config.ts
cd ..

echo "=== Installing backend deps ==="
pip install -r backend/requirements.txt

echo "=== Build complete ==="
