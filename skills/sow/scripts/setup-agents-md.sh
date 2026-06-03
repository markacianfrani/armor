#!/usr/bin/env bash
# Normalize a repo's agent-instructions file so AGENTS.md is the canonical file
# and CLAUDE.md is a symlink to it, then ensure the dependency policy is present.
#
# Safe to run repeatedly. Refuses to clobber when both files exist with
# different content — that case needs a human.
#
# Usage: setup-agents-md.sh [dir]   (defaults to the current directory)
set -euo pipefail

# Resolve the policy file relative to this script BEFORE changing directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_FILE="$SCRIPT_DIR/../assets/dependency-policy.md"

cd "${1:-.}"

CLAUDE="CLAUDE.md"
AGENTS="AGENTS.md"
MARKER="<!-- sow:dependency-policy -->"

info() { printf '  %s\n' "$1"; }
warn() { printf 'warning: %s\n' "$1" >&2; }
die()  { printf 'error: %s\n' "$1" >&2; exit 1; }

is_symlink() { [ -L "$1" ]; }
is_regular() { [ -f "$1" ] && [ ! -L "$1" ]; }
exists()     { [ -e "$1" ] || [ -L "$1" ]; }  # -e is false for a broken symlink

# End state: AGENTS.md is a regular file; CLAUDE.md is a symlink to AGENTS.md.
normalize() {
  # Reversed: AGENTS.md links to a real CLAUDE.md. Flip it.
  if is_symlink "$AGENTS" && is_regular "$CLAUDE"; then
    info "AGENTS.md links to CLAUDE.md (reversed) — flipping so AGENTS.md is canonical."
    rm "$AGENTS"; mv "$CLAUDE" "$AGENTS"; ln -s "$AGENTS" "$CLAUDE"
    return
  fi

  # Both are real files.
  if is_regular "$AGENTS" && is_regular "$CLAUDE"; then
    if diff -q "$AGENTS" "$CLAUDE" >/dev/null 2>&1; then
      info "AGENTS.md and CLAUDE.md are identical — replacing CLAUDE.md with a symlink."
      rm "$CLAUDE"; ln -s "$AGENTS" "$CLAUDE"
    else
      die "AGENTS.md and CLAUDE.md both exist with different content. Merge by hand into AGENTS.md, delete CLAUDE.md, then re-run."
    fi
    return
  fi

  # CLAUDE.md is the only real file. Rename it; link back.
  if is_regular "$CLAUDE" && ! exists "$AGENTS"; then
    info "Renaming CLAUDE.md -> AGENTS.md; linking CLAUDE.md -> AGENTS.md."
    mv "$CLAUDE" "$AGENTS"; ln -s "$AGENTS" "$CLAUDE"
    return
  fi

  # AGENTS.md is the only real file. Just link.
  if is_regular "$AGENTS" && ! exists "$CLAUDE"; then
    info "Linking CLAUDE.md -> AGENTS.md."
    ln -s "$AGENTS" "$CLAUDE"
    return
  fi

  # AGENTS.md real, CLAUDE.md already a symlink.
  if is_regular "$AGENTS" && is_symlink "$CLAUDE"; then
    if [ "$(readlink "$CLAUDE")" = "$AGENTS" ]; then
      info "Already normalized (CLAUDE.md -> AGENTS.md)."
    else
      warn "CLAUDE.md points to '$(readlink "$CLAUDE")', not AGENTS.md — repointing."
      rm "$CLAUDE"; ln -s "$AGENTS" "$CLAUDE"
    fi
    return
  fi

  # Nothing here. Create the canonical file and link.
  if ! exists "$AGENTS" && ! exists "$CLAUDE"; then
    info "No agent instructions file — creating AGENTS.md; linking CLAUDE.md -> AGENTS.md."
    : > "$AGENTS"; ln -s "$AGENTS" "$CLAUDE"
    return
  fi

  die "Unhandled CLAUDE.md / AGENTS.md state — inspect manually:
$(ls -ld "$AGENTS" "$CLAUDE" 2>&1 || true)"
}

append_policy() {
  if grep -qF "$MARKER" "$AGENTS" 2>/dev/null; then
    info "Dependency policy already present — leaving it."
    return
  fi
  [ -f "$POLICY_FILE" ] || die "Policy file not found: $POLICY_FILE"
  # Guarantee a trailing newline before appending.
  if [ -s "$AGENTS" ] && [ -n "$(tail -c1 "$AGENTS")" ]; then printf '\n' >> "$AGENTS"; fi
  { printf '\n%s\n' "$MARKER"; cat "$POLICY_FILE"; } >> "$AGENTS"
  info "Appended dependency policy (assets/dependency-policy.md) to AGENTS.md."
}

normalize
append_policy
printf 'done — AGENTS.md is canonical; CLAUDE.md links to it.\n'
