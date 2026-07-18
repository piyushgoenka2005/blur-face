#!/usr/bin/env python3
"""Entry point for running the backend server."""

import sys


def _require_insightface() -> None:
    """Fail fast — Haar fallback is too weak for reliable blur."""
    try:
        import insightface  # noqa: F401
    except ImportError:
        print(
            "\nERROR: insightface is not installed for this Python:\n"
            f"  {sys.executable}\n\n"
            "Without it the API falls back to OpenCV Haar and faces stay at 0 "
            "(no blur on dark / shake / distance).\n\n"
            "Fix (use the same Python you start the server with):\n"
            "  py -3.10 -m pip install -r requirements.txt\n"
            "  py -3.10 run.py\n"
            "or:\n"
            "  python -m pip install -r requirements.txt\n"
            "  python run.py\n",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    _require_insightface()
    from app.main import run

    run()
