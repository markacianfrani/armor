#!/usr/bin/env bash
# Shared helpers for the become-rest-client scripts.
#
# Restish v2 stores registered APIs in a single config file (v1's per-directory
# `apis.json` is gone; v2 migrates it away and leaves `restish.bak.v1` behind).
# The path is the same shape on every platform:
#
#   $RSH_CONFIG                     explicit override, must point at an existing
#                                 file containing valid JSON — v2 does NOT fall back
#                                 to the default config when it is set
#   $XDG_CONFIG_HOME/restish/restish.json
#   $HOME/.config/restish/restish.json   (default, macOS included)
#
# `~/Library/Application Support/restish/` is the v1 location. Do not write there.

# Resolve the config file path restish will actually use.
rsh_config_path() {
  if [[ -n "${RSH_CONFIG:-}" ]]; then
    printf '%s\n' "$RSH_CONFIG"
  else
    printf '%s\n' "${XDG_CONFIG_HOME:-$HOME/.config}/restish/restish.json"
  fi
}

# Print the major component of `restish --version`, e.g. "2".
rsh_major() {
  restish --version 2>/dev/null | grep -oE '[0-9]+' | head -1
}

# True when NAME is already registered.
rsh_has_api() {
  restish api inspect "$1" >/dev/null 2>&1
}

# Absolute path to a local file, or empty if it does not exist.
rsh_abs() {
  [[ -f "$1" ]] && (cd "$(dirname "$1")" && printf '%s/%s\n' "$(pwd)" "$(basename "$1")")
}

# Operation count as displayed by `api list`. Caveat: this is a cached value that
# can still read 0 immediately after a sync, so treat it as advisory — gate
# correctness on rsh_verify, not on this alone.
rsh_op_count() {
  restish api list 2>/dev/null \
    | awk -v n="$1" '$1==n{print $3; found=1} END{if(!found)print 0}'
}

# Operations declared in a local spec file — what the client should have.
rsh_spec_op_count() {
  local spec="${1:-}" tool=''
  [[ -f "$spec" ]] || { printf '0\n'; return; }
  case "$spec" in
    *.yaml|*.yml) tool=yq ;;
    *)            tool=jq ;;
  esac
  command -v "$tool" >/dev/null || { printf '0\n'; return; }
  "$tool" -r '[(.paths // {})[] | keys[]
            | select(. == "get" or . == "post" or . == "put" or . == "patch"
                 or . == "delete" or . == "head" or . == "options")] | length' \
    "$spec" 2>/dev/null || printf '0\n'
}

# Confirm NAME is registered and its operations are callable, then print the
# count. Exits non-zero only if they are genuinely missing.
#
# `api sync` returns before the generated commands are visible: right after a
# sync, `api list` and even `<name> --help` can briefly report nothing. So poll
# a few times, and corroborate against the spec file (which states the true
# operation count) before declaring failure.
rsh_verify() {
  local name="$1" spec="${2:-}" listed declared i
  declared=$(rsh_spec_op_count "$spec")

  for i in 1 2 3 4 5; do
    listed=$(rsh_op_count "$name")
    [[ "$listed" != "0" ]] && { printf '%s\n' "$listed"; return; }
    if [[ "$declared" != "0" ]] && restish "$name" --help >/dev/null 2>&1; then
      printf '%s\n' "$declared"
      return
    fi
    sleep 0.4
  done

  echo "error: 'restish $name' loaded no operations - the spec did not parse" >&2
  [[ "$declared" != "0" ]] && echo "       (the spec declares $declared operations)" >&2
  echo "       check the file, then run: restish api sync $name" >&2
  exit 1
}

# Name of the spec's single http-bearer securityScheme, or empty if there is not
# exactly one (or the spec is remote/unreadable). Restish keys credentials by
# scheme name, so this has to be read out of the document.
rsh_bearer_scheme() {
  local spec="${1:-}"
  [[ -f "$spec" ]] || { printf '\n'; return; }
  command -v jq >/dev/null || { printf '\n'; return; }
  jq -r '[ (.components.securitySchemes // {}) | to_entries[]
          | select(.value.type == "http" and (.value.scheme // "") == "bearer")
          | .key ]
         | if length == 1 then .[0] else "" end' "$spec" 2>/dev/null || printf '\n'
}

# Make sure the config file exists and is private; restish warns on 644.
rsh_ensure_config() {
  local cfg; cfg=$(rsh_config_path)
  mkdir -p "$(dirname "$cfg")"
  [[ -s "$cfg" ]] || printf '{"apis":{},"cache":{}}\n' > "$cfg"
  chmod 600 "$cfg" 2>/dev/null || true
  printf '%s\n' "$cfg"
}
