#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v cloudflared >/dev/null 2>&1; then
  printf 'Erreur : cloudflared est introuvable. Installez-le puis relancez ce script.\n' >&2
  exit 1
fi

if [[ ! -d dist ]]; then
  printf 'Erreur : le site de production n’est pas compilé. Lancez d’abord : npm run build\n' >&2
  exit 1
fi

# Charge les paramètres locaux de production (DB_PATH, etc.). APP_ORIGIN sera
# remplacée par l’adresse temporaire du tunnel juste avant le démarrage du site.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

port="${PORT:-3000}"
host="${HOST:-127.0.0.1}"
if [[ "$host" != 127.0.0.1 && "$host" != ::1 ]]; then
  printf 'Erreur : HOST doit rester sur la boucle locale (127.0.0.1 ou ::1).\n' >&2
  exit 1
fi

log_file="$(mktemp)"
tunnel_pid=""
cleanup() {
  if [[ -n "$tunnel_pid" ]]; then
    kill "$tunnel_pid" 2>/dev/null || true
    wait "$tunnel_pid" 2>/dev/null || true
  fi
  rm -f "$log_file"
}
trap cleanup EXIT INT TERM

printf 'Démarrage du tunnel Cloudflare…\n'
cloudflared tunnel --url "http://${host}:${port}" --no-autoupdate >"$log_file" 2>&1 &
tunnel_pid=$!

site_url=""
for _ in $(seq 1 90); do
  if ! kill -0 "$tunnel_pid" 2>/dev/null; then
    cat "$log_file" >&2
    printf 'Erreur : cloudflared s’est arrêté avant de fournir une URL.\n' >&2
    exit 1
  fi
  site_url="$(sed -nE 's#.*(https://[[:alnum:]-]+\.trycloudflare\.com).*#\1#p' "$log_file" | head -n 1)"
  [[ -n "$site_url" ]] && break
  sleep 1
done

if [[ -z "$site_url" ]]; then
  cat "$log_file" >&2
  printf 'Erreur : aucune URL Cloudflare reçue après 90 secondes.\n' >&2
  exit 1
fi

export NODE_ENV=production
export HOST="$host"
export PORT="$port"
export APP_ORIGIN="$site_url"
export TRUST_PROXY=loopback

printf '\nSite disponible : \033]8;;%s\a%s\033]8;;\a\n' "$site_url" "$site_url"
printf 'Arrêtez le site et le tunnel avec Ctrl+C.\n\n'
npm start
