#!/usr/bin/env bash
# Backup diário da mesa: o banco e os uploads, fora do repositório.
# Rode de dentro da pasta do servidor (C:\Users\Usuario\MesaServer):
#   bash deploy/mesa/backup.sh
# A tarefa agendada "Mesa - Backup" (install-backup-task.ps1) roda isto todo dia.
set -euo pipefail

# O Git Bash não acha o docker sem isto; sem docker, o backup.sh do backend
# tentaria usar DATABASE_URL em vez do contêiner do banco.
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"

MESA_BACKUP_DIR="${MESA_BACKUP_DIR:-/c/Users/Usuario/MesaBackups}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
LOG="$MESA_BACKUP_DIR/backup.log"
mkdir -p "$MESA_BACKUP_DIR/db" "$MESA_BACKUP_DIR/uploads"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
trap 'log "FALHOU (linha $LINENO)"' ERR

# 1. O banco, de dentro do contêiner; o próprio script apaga os antigos.
BACKUP_DIR="$MESA_BACKUP_DIR/db" BACKUP_RETAIN_DAYS="$BACKUP_RETAIN_DAYS" ./backend/scripts/backup.sh

# 2. Os uploads.
STAMP=$(date +%Y%m%d_%H%M%S)
tar -czf "$MESA_BACKUP_DIR/uploads/uploads_$STAMP.tar.gz" -C backend uploads

# 3. Os uploads antigos.
find "$MESA_BACKUP_DIR/uploads" -maxdepth 1 -type f -name 'uploads_*.tar.gz' -mtime +"$BACKUP_RETAIN_DAYS" -delete

log "OK banco e uploads ($STAMP)"
