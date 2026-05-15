#!/usr/bin/env bash
# Verify restish is installed; install via brew on macOS, otherwise print
# install instructions and exit non-zero.
set -euo pipefail

if command -v restish >/dev/null 2>&1; then
  restish --version
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
