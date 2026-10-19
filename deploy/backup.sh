#!/usr/bin/env bash
# Backup do MongoDB (mongodump) e da pasta de fotos e cardápios, com os mais antigos apagados.
# Roda pelo checkins-backup.service, que carrega o .env de produção. Variáveis:
#   MONGO_URL         banco da API (obrigatório)
#   MEDIA_DIR         pasta de mídia (obrigatório)
#   BACKUP_DIR        onde guardar (padrão /var/lib/checkins/backups)
#   BACKUP_KEEP_DAYS  quantos dias manter (padrão 14)
set -euo pipefail

: "${MONGO_URL:?MONGO_URL não definido}"
: "${MEDIA_DIR:?MEDIA_DIR não definido}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/checkins/backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

stamp="$(date +%Y-%m-%d_%H%M)"
target="$BACKUP_DIR/$stamp"
umask 077
mkdir -p "$target"

# Se algo falhar no meio, não deixa um backup pela metade com cara de completo.
trap 'rm -rf "$target"' ERR

echo "MongoDB -> $target/mongo.archive.gz"
mongodump --uri="$MONGO_URL" --archive="$target/mongo.archive.gz" --gzip --quiet

echo "Mídia ($MEDIA_DIR) -> $target/media.tar.gz"
if [ -d "$MEDIA_DIR" ]; then
  tar -czf "$target/media.tar.gz" -C "$(dirname "$MEDIA_DIR")" "$(basename "$MEDIA_DIR")"
else
  echo "Aviso: $MEDIA_DIR não existe ainda (nenhuma foto enviada?)"
fi

trap - ERR
du -sh "$target"

# Apaga backups com mais de BACKUP_KEEP_DAYS dias (só pastas no formato AAAA-MM-DD_HHMM).
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '????-??-??_????' \
  -mtime "+$BACKUP_KEEP_DAYS" -print -exec rm -rf {} +
