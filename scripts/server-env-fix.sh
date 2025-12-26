#!/usr/bin/env bash
set -euo pipefail

# Fix duplicate env keys, remove insecure TLS override, and set isolation keys.
# Usage:
#   PROJECT_DIR=/www/wwwroot/AstraLinks NEW_KEY=... bash scripts/server-env-fix.sh
#   or: bash scripts/server-env-fix.sh

PROJECT_DIR="${PROJECT_DIR:-/www/wwwroot/AstraLinks}"
ENV_FILE="$PROJECT_DIR/server/.env"
FRONT_ENV="$PROJECT_DIR/.env.production"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

cd "$PROJECT_DIR"

timestamp=$(date +%F_%H%M%S)
cp "$ENV_FILE" "$ENV_FILE.bak.$timestamp"

echo "Duplicate keys in server/.env:"
dup_keys=$(awk -F= '!/^#/ && $1{print $1}' "$ENV_FILE" | sort | uniq -d || true)
if [ -n "$dup_keys" ]; then
  echo "$dup_keys"
else
  echo "none"
fi

# Remove insecure TLS override
sed -i '/^NODE_TLS_REJECT_UNAUTHORIZED=0$/d' "$ENV_FILE"

dedupe_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return
  fi
  awk -F= '
    NR==FNR {
      line=$0
      if (line ~ /^[[:space:]]*#/ || line ~ /^[[:space:]]*$/) { next }
      key=$1
      gsub(/[[:space:]]+/, "", key)
      if (key != "") last[key]=FNR
      next
    }
    {
      line=$0
      if (line ~ /^[[:space:]]*#/ || line ~ /^[[:space:]]*$/) { print; next }
      key=$1
      gsub(/[[:space:]]+/, "", key)
      if (key == "" || last[key]==FNR) print
    }
  ' "$file" "$file" > "$file.tmp"
  mv "$file.tmp" "$file"
}

touch "$FRONT_ENV"
dedupe_file "$ENV_FILE"
dedupe_file "$FRONT_ENV"

if [ -z "${NEW_KEY:-}" ]; then
  if command -v openssl >/dev/null 2>&1; then
    NEW_KEY=$(openssl rand -base64 32)
  elif command -v python3 >/dev/null 2>&1; then
    NEW_KEY=$(python3 - <<'PY'
import base64, os
print(base64.b64encode(os.urandom(32)).decode())
PY
)
  else
    echo "No openssl/python3 available to generate NEW_KEY"
    exit 1
  fi
fi

if grep -q '^ISOLATION_ENCRYPTION_KEY=' "$ENV_FILE"; then
  sed -i "s|^ISOLATION_ENCRYPTION_KEY=.*|ISOLATION_ENCRYPTION_KEY=$NEW_KEY|" "$ENV_FILE"
else
  echo "ISOLATION_ENCRYPTION_KEY=$NEW_KEY" >> "$ENV_FILE"
fi

if grep -q '^VITE_ISOLATION_ENCRYPTION_KEY=' "$FRONT_ENV"; then
  sed -i "s|^VITE_ISOLATION_ENCRYPTION_KEY=.*|VITE_ISOLATION_ENCRYPTION_KEY=$NEW_KEY|" "$FRONT_ENV"
else
  echo "VITE_ISOLATION_ENCRYPTION_KEY=$NEW_KEY" >> "$FRONT_ENV"
fi

echo "Done."
echo "Hint: run ./deploy.sh to rebuild and restart."
