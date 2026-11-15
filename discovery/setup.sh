#!/usr/bin/env bash
# One-time setup. Run in your Mac Terminal:  bash setup.sh
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
echo
echo "Done. Each new Terminal window, run:  source .venv/bin/activate"
