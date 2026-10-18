#!/usr/bin/env bash
# Register a new API in Restish v2's config. Refuses if the name already
# exists — use update-api.sh for that.
#
# Uses `restish api connect`, which is the v2 way to do this: it pins the spec,
# discovers the operation list, and reports which operations need credentials.
# `--spec` points at a local file, so no network discovery happens (the base URL
# is never contacted during setup).
#
# When the spec declares a global bearer scheme, `connect` refuses to finish
# without a token. Pass --bearer-env to satisfy it with an unresolved `env:VAR`
# reference (the secret stays out of the config file). Without it, fall back to
# writing the minimal API entry directly, which registers every operation and
# leaves auth to per-request `-H authorization:...`.
set -euo pipefail

self="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$self/lib.sh"

usage() {
  cat >&2 <<EOF
Usage: $0 --name <name> --spec <path> [--base <url>] [--bearer-env <VAR>]

  --name         short kebab-case nickname for the API (e.g. "acme")
  --spec         path to OpenAPI 3.x JSON or YAML (local file; also accepts http(s))
  --base         base URL; defaults to the first servers[].url in the spec
  --bearer-env   name of an env var holding the bearer token, stored as env:<VAR>
                 (needed when the spec's security is a global default)
EOF
  exit 2
}

NAME=""; SPEC=""; BASE=""; TOKEN_ENV=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --spec) SPEC="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --bearer-env) TOKEN_ENV="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done
[[ -z "$NAME" || -z "$SPEC" ]] && usage

case "$SPEC" in
  http://*|https://*) SPEC_REF="$SPEC" ;;
  *)
    SPEC_REF=$(rsh_abs "$SPEC") || { echo "spec not found: $SPEC" >&2; exit 1; }
    ;;
esac

if rsh_has_api "$NAME"; then
  echo "API '$NAME' is already registered — use update-api.sh instead" >&2
  restish api inspect "$NAME" >&2 || true
  exit 1
fi

if [[ -z "$BASE" ]]; then
  case "$SPEC_REF" in
    http://*|https://*)
      echo "cannot infer a base URL from a remote spec; pass --base" >&2
      exit 1
      ;;
    *.yaml|*.yml)
      command -v yq >/dev/null || { echo "yaml spec needs yq, or pass --base" >&2; exit 1; }
      BASE=$(yq -r '.servers[0].url // ""' "$SPEC_REF")
      ;;
    *)
      command -v jq >/dev/null || { echo "json spec needs jq, or pass --base" >&2; exit 1; }
      BASE=$(jq -r '.servers[0].url // ""' "$SPEC_REF")
      ;;
  esac
fi

if [[ -z "$BASE" ]]; then
  echo "no usable base URL: spec servers[] was empty or relative — pass --base https://host" >&2
  exit 1
fi
if [[ "$BASE" == /* ]]; then
  cat >&2 <<EOF
error: spec servers[].url is "$BASE" — a relative path, not an origin.
Restish needs scheme + host. Pass --base https://<host>.
EOF
  exit 1
fi
if [[ "$BASE" == http://* ]]; then
  echo "warning: base is plain http ($BASE). Load balancers often 301 to https," >&2
  echo "         and clients that follow a 301 with a GET drop the POST body — which" >&2
  echo "         shows up as a spurious 401 on endpoints that need no auth." >&2
fi

cfg=$(rsh_ensure_config)

SETUP=()
SCHEME=""
if [[ -n "$TOKEN_ENV" ]]; then
  SCHEME=$(rsh_bearer_scheme "$SPEC_REF")
  if [[ -z "$SCHEME" ]]; then
    echo "--bearer-env needs exactly one http-bearer securityScheme in the spec." >&2
    echo "Found none or several; pass the scheme explicitly to 'restish api connect'" >&2
    echo "as prompt.credentials.<scheme>.token:env:$TOKEN_ENV" >&2
    exit 1
  fi
  SETUP+=("prompt.credentials.$SCHEME.token:env:$TOKEN_ENV")
fi

# ${arr[@]+...} keeps an empty array from tripping `set -u` on bash 3.2 (macOS).
if out=$(restish api connect "$NAME" "$BASE" --spec "$SPEC_REF" ${SETUP[@]+"${SETUP[@]}"} --yes 2>&1); then
  echo "connected '$NAME' -> $BASE" >&2
  printf '%s\n' "$out" | grep -E '^(Connected|.*operations)' >&2 || true
else
  if ! printf '%s\n' "$out" | grep -qi 'missing required auth'; then
    printf '%s\n' "$out" >&2
    echo "restish api connect failed for '$NAME'" >&2
    exit 1
  fi
  # Spec requires credentials up front. Register without auth instead; generated
  # commands still work and take `-H authorization: Bearer <t>` per request.
  command -v jq >/dev/null || {
    echo "jq is required for the no-auth fallback registration" >&2; exit 1; }
  echo "note: spec demands a bearer token at connect time — registering without auth." >&2
  if [[ -n "$SCHEME" ]]; then
    echo "      (scheme: $SCHEME)" >&2
  else
    SCHEME=$(rsh_bearer_scheme "$SPEC_REF")
  fi
  echo "      Rerun with --bearer-env <VAR> to store it as env:<VAR>, or pass" >&2
  echo "      -H \"authorization: Bearer <token>\" on each generated command." >&2
  tmp=$(mktemp)
  jq --arg n "$NAME" --arg b "$BASE" --arg s "$SPEC_REF" \
    '.apis[$n] = {base_url: $b, spec_files: [$s]}' "$cfg" > "$tmp"
  mv "$tmp" "$cfg"
  chmod 600 "$cfg" 2>/dev/null || true
fi

# base_url writes reset the cached operation list until a sync; always sync.
restish api sync "$NAME" >&2 || true

ops=$(rsh_verify "$NAME" "$SPEC_REF")
echo "  spec: $SPEC_REF" >&2
echo "  operations: $ops" >&2
echo "  config: $cfg" >&2
restish api auth inspect "$NAME" >&2 || true
