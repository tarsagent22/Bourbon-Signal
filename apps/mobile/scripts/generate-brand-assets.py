#!/usr/bin/env python
"""Compatibility entry point for native icon packaging (requires root npm install)."""
from pathlib import Path
import subprocess

subprocess.run(["node", str(Path(__file__).with_name("generate-app-icons.mjs"))], check=True)
