#!/usr/bin/env python3
"""Entry point for running the backend server."""

import uvicorn
from app.main import run

if __name__ == "__main__":
    run()
