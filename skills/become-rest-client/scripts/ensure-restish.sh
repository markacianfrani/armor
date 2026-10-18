#!/usr/bin/env bash
# Verify restish is installed and new enough; install via brew on macOS,
# otherwise print install instructions and exit non-zero.
#
# Requires Restish v2. v1 kept each API in its own `apis.json` under
# ~/Library/Application Support/restish (macOS); v2 uses a single
# ~/.config/restish/restish.json and migrates v1 away on first run, so the
# v1-era paths are not just unused but actively misleading.
set -euo pipefail

self="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$self/lib.sh"

if command -v restish >/dev/null 2>&1; then
  ver=$(restish --version 2>&1 | head -1)
  echo "$ver"
  major=$(rsh_major)
  if [[ -n "$major" && "$major" -lt 2 ]]; then
    cat >&2 <<EOF
warning: restish $ver detected, but these scripts target v2 (the config layout
and the \`restish api\` command group changed between v1 and v2). Upgrade:
  brew upgrade rest-sh/tap/restish        # macOS
  go install github.com/rest-sh/restish@latest
EOF
  fi
  exit 0
fi

case "$(uname -s)" in
  Darwin)
    if command -v brew >/dev/null 2>&1; then
      echo "restish not found — installing via brew" >&2
      brew install rest-sh/tap/restish
      exit 0
    fi
    cat >&2 <<'EOF'
restish is not installed. Install it with:
  brew install rest-sh/tap/restish
EOF
    exit 1
    ;;
  Linux)
    cat >&2 <<'EOF'
restish is not installed. Install it with one of:
  nix-env --install --attr nixpkgs.restish
  go install github.com/rest-sh/restish@latest
  https://github.com/rest-sh/restish/releases (download binary into $PATH)
EOF
    exit 1
    ;;
  *)
    echo "restish is not installed. See https://rest.sh/#/guide" >&2
    exit 1
    ;;
esac
