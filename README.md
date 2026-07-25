# Telegram Document Downloader

A production-ready, cross-platform desktop application for downloading all documents from your Telegram chats. Uses Telegram's official MTProto API via Telethon — no third-party servers, no credentials leaving your machine.

## Features

- **Full Telegram Authentication** — API ID, API Hash, Phone Number, OTP, and 2FA support. Sessions are encrypted and stored locally.
- **Automatic Chat Discovery** — Discovers every dialog you have access to: private chats, groups, supergroups, channels, and forums.
- **Document Scanning** — Asynchronously scans entire chat history (100k+ messages supported) to find all downloadable documents: PDFs, Office files, archives, media, EPUB, APK, and any Telegram document type.
- **Powerful Search & Filters** — Search chats by name/username. Filter documents by extension, size range, date, sender, and filename.
- **Concurrent Downloads** — Configurable parallel downloads with bandwidth limiting, retry logic with exponential backoff, and FloodWait handling.
- **Persistent Queue** — SQLite-backed download queue that survives crashes and restarts. Pause, resume, cancel, retry individual or all failed downloads.
- **Download History** — Complete history with SHA-256 verification. Export to CSV, JSON, or SQLite.
- **Modern Dark UI** — Electron + React + TypeScript + Tailwind CSS with real-time progress, speed, ETA, and queue management.
- **Fully Local** — All operations happen on your machine. No data is sent to any external server.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Electron Shell                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │         React + TypeScript + Tailwind             │   │
│  │         (Frontend UI)                             │   │
│  └───────────────────────┬──────────────────────────┘   │
│                          │ HTTP (localhost:8899)         │
│  ┌───────────────────────▼──────────────────────────┐   │
│  │         Python FastAPI Backend                     │   │
│  │  Auth │ Scanner │ Downloader │ History │ Export   │   │
│  └───────────────────────┬──────────────────────────┘   │
│                          │                               │
│  ┌───────────────────────▼──────────────────────────┐   │
│  │  Telethon (MTProto API) │ SQLite │ Local Storage │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm or yarn
- Telegram API credentials from https://my.telegram.org/apps

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd telegram-document-downloader

# Setup Python backend
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt
cd ..

# Setup frontend
cd frontend
npm install
cd ..
```

### Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```
API_ID=your_api_id
API_HASH=your_api_hash
```

## Running

### Development mode (two terminals):

**Terminal 1 — Backend:**
```bash
cd backend
python run.py
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

### Production build:

```bash
cd frontend
npm run electron:build
```

The compiled application will be in `frontend/release/`.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `API_ID` | — | Telegram API ID (from my.telegram.org) |
| `API_HASH` | — | Telegram API Hash |
| `SESSION_PATH` | `sessions/` | Directory for encrypted session files |
| `DOWNLOAD_DIRECTORY` | `downloads/` | Default download location |
| `DATABASE_PATH` | `data/app.db` | SQLite database path |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `MAX_CONCURRENT_DOWNLOADS` | `5` | Maximum parallel downloads |
| `HOST` | `127.0.0.1` | Backend host |
| `PORT` | `8899` | Backend port |

## Security

- **Credentials never leave your machine** — API ID, API Hash, and phone number are only used to authenticate via Telegram's MTProto protocol
- **Sessions are encrypted** — Telethon encrypts session files using PBKDF2 + AES-256
- **No external servers** — The application is fully self-contained. All communication is directly with Telegram's servers
- **File permissions** — The application only accesses chats and files your account is already authorized to view

## Building for Distribution

```bash
cd frontend

# Windows
npm run electron:build -- --win

# macOS
npm run electron:build -- --mac

# Linux
npm run electron:build -- --linux
```

## License

MIT
