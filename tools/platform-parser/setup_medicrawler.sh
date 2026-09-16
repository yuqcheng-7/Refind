#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MC_ROOT="${MEDIACRAWLER_ROOT:-$ROOT/MediaCrawler}"

if [[ ! -f "$MC_ROOT/main.py" ]]; then
  echo "MediaCrawler not found at $MC_ROOT"
  echo "Run: git submodule update --init tools/MediaCrawler"
  exit 1
fi

cd "$MC_ROOT"

if command -v uv >/dev/null 2>&1; then
  uv sync
  uv run playwright install chromium
  echo "MediaCrawler ready (uv)."
  exit 0
fi

python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
python3 -m pip install -U pip
python3 -m pip install -e .
python3 -m playwright install chromium
echo "MediaCrawler ready (venv + pip)."
