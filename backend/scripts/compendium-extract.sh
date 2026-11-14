#!/usr/bin/env bash
# Extract the text of the compendium's three books, on the host (Git Bash),
# where pdftotext is; the backend container has none.
#   bash backend/scripts/compendium-extract.sh "materiais/D&D 5E" materiais/.compendio
# Writes <outDir>/raw/{phb,mm,dmg}.txt. The text stays out of git.
set -euo pipefail

PDF_DIR="${1:?Usage: compendium-extract.sh <pdfDir> <outDir>}"
OUT_DIR="${2:?Usage: compendium-extract.sh <pdfDir> <outDir>}"
mkdir -p "$OUT_DIR/raw"

extract() {
  local pdf="$PDF_DIR/$1" out="$OUT_DIR/raw/$2.txt"
  if [[ ! -f "$pdf" ]]; then
    echo "Missing: $pdf" >&2
    exit 1
  fi
  pdftotext -enc UTF-8 "$pdf" "$out"
  echo "$2: $(wc -l < "$out") lines"
}

extract "D&D 5E - Livro do Jogador (Impressão Ecônomica - Sem Imagens) - Biblioteca Élfica.pdf" phb
extract "D&D 5E - Manual dos Monstros (D&D Beyond 2.1) - Biblioteca Élfica.pdf" mm
extract "D&D 5E - Guia do Mestre - Biblioteca Élfica.pdf" dmg
