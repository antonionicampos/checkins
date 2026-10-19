#!/usr/bin/env bash
# Atualiza a API de produção: baixa o código, instala dependências, compila e reinicia o serviço.
#   sudo /opt/checkins/deploy/update.sh            # última versão da main
#   sudo /opt/checkins/deploy/update.sh <commit>   # uma versão específica (por exemplo, para voltar atrás)
# Tudo no repositório roda como o usuário "checkins"; só o restart do serviço precisa de root.
set -euo pipefail

REPO=/opt/checkins
APP_USER=checkins
APP_HOME=/var/lib/checkins
SERVICE=checkins-api

# Roda como o usuário da API, com a pasta dele como HOME (cache do npm).
as_app() { runuser -u "$APP_USER" -- env HOME="$APP_HOME" "$@"; }

# Tudo dentro de main: o git checkout troca este arquivo enquanto ele roda, e o bash lê scripts aos poucos.
main() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Rode com sudo: sudo $0 $*" >&2
    exit 1
  fi
  cd "$REPO"

  local ref="${1:-origin/main}"
  local previous
  previous="$(as_app git rev-parse --short HEAD)"

  echo "==> Baixando o código"
  as_app git fetch --prune origin
  as_app git checkout --quiet --detach "$ref"
  local current
  current="$(as_app git rev-parse --short HEAD)"
  echo "    $previous -> $current"
  as_app git log --oneline --no-decorate -1

  echo "==> Instalando dependências (só API e shared, sem o app)"
  as_app npm ci --no-audit --no-fund -w @checkins/api -w @checkins/shared --include-workspace-root

  echo "==> Compilando"
  as_app npm run build -w @checkins/shared
  as_app npm run build -w @checkins/api

  echo "==> Reiniciando $SERVICE"
  systemctl restart "$SERVICE"

  local port
  port="$(sed -n 's/^PORT=//p' "$REPO/.env" | tail -n1)"
  port="${port:-3000}"
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
      echo "==> API no ar: $(curl -fsS "http://127.0.0.1:$port/health")"
      exit 0
    fi
    sleep 1
  done

  echo "A API não respondeu em /health depois de 30 s. Últimas linhas do log:" >&2
  journalctl -u "$SERVICE" -n 30 --no-pager >&2 || true
  echo >&2
  echo "Para voltar à versão anterior: sudo $0 $previous" >&2
  exit 1
}

main "$@"
exit
