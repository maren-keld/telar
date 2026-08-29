#!/usr/bin/env python3
"""Detach a local HTTP server for landing/ so Cursor background shells can die without killing it."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LANDING = ROOT / "landing"
HOST = "127.0.0.1"
PORT = 8765
PID_FILE = Path("/tmp/telar-landing-8765.pid")
LOG_FILE = Path("/tmp/telar-landing-8765.log")


def already_up() -> bool:
    if not PID_FILE.exists():
        return False
    try:
        pid = int(PID_FILE.read_text().strip())
    except ValueError:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def daemonize() -> None:
    if os.fork() > 0:
        raise SystemExit(0)
    os.setsid()
    if os.fork() > 0:
        raise SystemExit(0)
    os.chdir(LANDING)
    sys.stdin.close()
    log = open(LOG_FILE, "a", buffering=1)
    os.dup2(log.fileno(), 1)
    os.dup2(log.fileno(), 2)


def main() -> None:
    if already_up():
        print(f"already running pid {PID_FILE.read_text().strip()} http://{HOST}:{PORT}/index2.html")
        return
    daemonize()
    PID_FILE.write_text(str(os.getpid()))
    os.execv(
        sys.executable,
        [sys.executable, "-m", "http.server", str(PORT), "--bind", HOST],
    )


if __name__ == "__main__":
    main()
