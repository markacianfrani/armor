#!/usr/bin/env bash
# Register a new API in restish's apis.json. Refuses if the entry already
# exists — use update-api.sh for that.
set -euo pipefail

usage() {
  cat >&2 <<EOF
Usage: $0 --name <name> --spec <path> [--base <url>]

  --name    short kebab-case nickname for the API (e.g. "saui")
  --spec    path to OpenAPI 3.x JSON or YAML
  --base    base URL; defaults to first servers[].url in the spec
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
[[ -z "$NAME" || -z "$SPEC" ]] && usage
[[ -f "$SPEC" ]] || { echo "spec not found: $SPEC" >&2; exit 1; }

SPEC_ABS="$(cd "$(dirname "$SPEC")" && pwd)/$(basename "$SPEC")"

case "$(uname -s)" in
  Darwin) APIS="$HOME/Library/Application Support/restish/apis.json" ;;
  Linux)  APIS="${XDG_CONFIG_HOME:-$HOME/.config}/restish/apis.json" ;;
  *) echo "unsupported OS for apis.json path resolution" >&2; exit 1 ;;
esac

mkdir -p "$(dirname "$APIS")"
[[ -f "$APIS" ]] || echo '{"$schema":"https://rest.sh/schemas/apis.json"}' > "$APIS"

if jq -e --arg n "$NAME" 'has($n)' "$APIS" >/dev/null; then
  echo "entry '$NAME' already exists in $APIS — use update-api.sh instead" >&2
  exit 1
fi

if [[ -z "$BASE" ]]; then
  case "$SPEC_ABS" in
    *.yaml|*.yml)
      command -v yq >/dev/null || { echo "yaml spec needs yq, or pass --base" >&2; exit 1; }
      BASE=$(yq -r '.servers[0].url // ""' "$SPEC_ABS")
      ;;
    *)
      BASE=$(jq -r '.servers[0].url // ""' "$SPEC_ABS")
      ;;
  esac
  [[ -z "$BASE" ]] && { echo "could not read base URL from spec; pass --base" >&2; exit 1; }
fi

TMP=$(mktemp)
jq --arg n "$NAME" --arg b "$BASE" --arg s "$SPEC_ABS" \
  '.[$n] = {base: $b, spec_files: [$s]}' "$APIS" > "$TMP"
mv "$TMP" "$APIS"

echo "registered '$NAME' -> $BASE" >&2
echo "  spec: $SPEC_ABS" >&2

if ! restish "$NAME" --help >/dev/null 2>&1; then
  echo "warning: 'restish $NAME --help' failed — spec may be malformed" >&2
  exit 1
fi
