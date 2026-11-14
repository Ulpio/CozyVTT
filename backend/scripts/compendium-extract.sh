#!/usr/bin/env bash
# Extract the text of the compendium's three books, on the host (Git Bash),
# where pdftotext is; the backend container has none. The PDFs are named on
# the command line, so their file names stay out of git:
#   bash backend/scripts/compendium-extract.sh materiais/.compendio \
#     "<Player's Handbook>.pdf" "<Monster Manual>.pdf" "<Dungeon Master's Guide>.pdf"
# Writes <outDir>/raw/{phb,mm,dmg}.txt. The text stays out of git.
set -euo pipefail

USAGE="Usage: compendium-extract.sh <outDir> <phb.pdf> <mm.pdf> <dmg.pdf>"
OUT_DIR="${1:?$USAGE}"
PHB="${2:?$USAGE}"
MM="${3:?$USAGE}"
DMG="${4:?$USAGE}"
mkdir -p "$OUT_DIR/raw"

extract() {
  local pdf="$1" out="$OUT_DIR/raw/$2.txt"
  if [[ ! -f "$pdf" ]]; then
    echo "Missing: $pdf" >&2
    exit 1
  fi
  pdftotext -enc UTF-8 "$pdf" "$out"
  echo "$2: $(wc -l < "$out") lines"
}

extract "$PHB" phb
extract "$MM" mm
extract "$DMG" dmg
