#!/usr/bin/env python3
"""Telegram Document Downloader - Backend launcher."""

import os
import sys

# Ensure the backend package is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import run

if __name__ == "__main__":
    run()
