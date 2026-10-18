#!/usr/bin/env bash
# Update an existing Restish v2 API entry: base URL, spec file, and/or a bearer
# token for a profile. Everything else in the profile is left alone.
#
# Two v2 quirks this script handles for you:
#   * `api set base_url: ...` clears the cached operation list, so it reports
#     "0 operations" until you sync. Always sync at the end.
#   * `spec_files[]: x` APPENDS to the list. Replacing the list needs the array
#     form `spec_files: [x]`.
set -euo pipefail

self="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$self/lib.sh"

usage() {
  cat >&2 <<EOF
Usage: $0 --name <name> [--spec <path>] [--base <url>] [--bearer-env <VAR>]
          [--profile <name>] [--scheme <name>]

  --name        nickname of an already-registered API
  --spec        new OpenAPI spec path or URL (replaces, not appends)
  --base        new base URL
  --bearer-env  env var holding the bearer token, stored as env:<VAR>
  --profile     profile to write auth into (default: "default")
  --scheme      securityScheme name for --bearer-env (default: the spec's http
                bearer scheme, when there is exactly one)

At least one of --spec, --base, --bearer-env is required.
EOF
  exit 2
}

NAME=""; SPEC=""; BASE=""; TOKEN_ENV=""; PROFILE="default"; SCHEME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --spec) SPEC="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --bearer-env) TOKEN_ENV="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --scheme) SCHEME="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done
[[ -z "$NAME" ]] && usage
[[ -z "$SPEC" && -z "$BASE" && -z "$TOKEN_ENV" ]] && usage

rsh_has_api "$NAME" || {
  echo "API '$NAME' is not registered — use init-api.sh instead" >&2
  exit 1
}

PATCHES=()

# Resolve the spec this API points at — either the new one, or whatever is
# already registered. Needed for scheme inference and for verifying afterwards.
cfg=$(rsh_config_path)
EFFECTIVE_SPEC="${SPEC_REF:-}"
if [[ -z "$EFFECTIVE_SPEC" ]]; then
  EFFECTIVE_SPEC=$(jq -r --arg n "$NAME" '(.apis[$n].spec_files // [])[0] // ""' "$cfg" 2>/dev/null || true)
fi

if [[ -n "$SPEC" ]]; then
  case "$SPEC" in
    http://*|https://*) SPEC_REF="$SPEC" ;;
    *) SPEC_REF=$(rsh_abs "$SPEC") || { echo "spec not found: $SPEC" >&2; exit 1; } ;;
  esac
  PATCHES+=("spec_files: [$SPEC_REF]")
fi

if [[ -n "$BASE" ]]; then
  [[ "$BASE" == http://* || "$BASE" == https://* ]] || {
    echo "base must be an absolute origin (https://host), got: $BASE" >&2; exit 1; }
  [[ "$BASE" == http://* ]] && echo "warning: plain http base — see the 301/POST-body caveat in init-api.sh" >&2
  PATCHES+=("base_url: $BASE")
fi

if [[ -n "$TOKEN_ENV" ]]; then
  if [[ -z "$SCHEME" ]]; then
    # No --spec on this call: infer the scheme from whatever spec the API is
    # already registered against.
    SCHEME=$(rsh_bearer_scheme "$EFFECTIVE_SPEC")
    if [[ -z "$SCHEME" ]]; then
      echo "could not infer a single http-bearer securityScheme" >&2
      echo "  looked in: ${EFFECTIVE_SPEC:-<no local spec registered for '$NAME'>}" >&2
      echo "  pass --scheme <name> (see components.securitySchemes in the spec)" >&2
      exit 1
    fi
  fi
  PATCHES+=("profiles.$PROFILE.auth.type: bearer" \
            "profiles.$PROFILE.auth.params.token:env:$TOKEN_ENV")
fi

for p in ${PATCHES[@]+"${PATCHES[@]}"}; do
  restish api set "$NAME" "$p" || { echo "failed to apply patch: $p" >&2; exit 1; }
done

# Required: base_url/spec changes invalidate the cached operations.
restish api sync "$NAME" >&2 || true

ops=$(rsh_verify "$NAME" "$EFFECTIVE_SPEC")
echo "updated '$NAME':" >&2
[[ -n "$BASE" ]] && echo "  base -> $BASE" >&2
[[ -n "$SPEC" ]] && echo "  spec -> $SPEC_REF" >&2
[[ -n "$TOKEN_ENV" ]] && echo "  auth -> env:$TOKEN_ENV (profile '$PROFILE', scheme '$SCHEME')" >&2
echo "  operations: $ops" >&2
