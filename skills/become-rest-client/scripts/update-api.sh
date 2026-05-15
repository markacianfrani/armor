#!/usr/bin/env bash
# Update an existing restish API entry. Only touches spec_files and/or base.
# Profiles, auth, tls, and any other keys are preserved verbatim.
set -euo pipefail

usage() {
  cat >&2 <<EOF
Usage: $0 --name <name> [--spec <path>] [--base <url>]

  --name    short nickname of an already-registered API
  --spec    new path to OpenAPI 3.x JSON or YAML (replaces spec_files)
  --base    new base URL (replaces base)

  At least one of --spec or --base is required.
EOF
  exit 2
}

NAME=""; SPEC=""; BASE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --spec) SPEC="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done
[[ -z "$NAME" ]] && usage
[[ -z "$SPEC" && -z "$BASE" ]] && usage

case "$(uname -s)" in
  Darwin) APIS="$HOME/Library/Application Support/restish/apis.json" ;;
  Linux)  APIS="${XDG_CONFIG_HOME:-$HOME/.config}/restish/apis.json" ;;
  *) echo "unsupported OS for apis.json path resolution" >&2; exit 1 ;;
esac

[[ -f "$APIS" ]] || { echo "no apis.json at $APIS — use init-api.sh first" >&2; exit 1; }

if ! jq -e --arg n "$NAME" 'has($n)' "$APIS" >/dev/null; then
  echo "entry '$NAME' not found in $APIS — use init-api.sh instead" >&2
  exit 1
fi

FILTER='.'
ARGS=(--arg n "$NAME")

if [[ -n "$SPEC" ]]; then
  [[ -f "$SPEC" ]] || { echo "spec not found: $SPEC" >&2; exit 1; }
  SPEC_ABS="$(cd "$(dirname "$SPEC")" && pwd)/$(basename "$SPEC")"
  ARGS+=(--arg s "$SPEC_ABS")
  FILTER="$FILTER | .[\$n].spec_files = [\$s]"
fi

if [[ -n "$BASE" ]]; then
  ARGS+=(--arg b "$BASE")
  FILTER="$FILTER | .[\$n].base = \$b"
fi

TMP=$(mktemp)
jq "${ARGS[@]}" "$FILTER" "$APIS" > "$TMP"
mv "$TMP" "$APIS"

echo "updated '$NAME':" >&2
[[ -n "$BASE" ]] && echo "  base -> $BASE" >&2
[[ -n "$SPEC" ]] && echo "  spec -> $SPEC_ABS" >&2

if ! restish "$NAME" --help >/dev/null 2>&1; then
  echo "warning: 'restish $NAME --help' failed — spec may be malformed" >&2
  exit 1
fi
