#!/usr/bin/env bash
set -euo pipefail

SELF="$(readlink -f "$0")"
REPO_DIR="$(cd "$(dirname "$SELF")/.." && pwd)"
AGENTS_DIR="$REPO_DIR/agents"
COMMANDS_DIR="$REPO_DIR/commands"
SKILLS_DIR="$REPO_DIR/skills"

SHARED_AGENT_TARGETS=(
  "$HOME/.agents/agents"
)

SHARED_COMMAND_TARGETS=(
  "$HOME/.agents/commands"
)

SHARED_SKILL_TARGETS=(
  "$HOME/.agents/skills"
)

CLAUDE_AGENT_TARGETS=(
  "$HOME/.claude/agents"
)

CLAUDE_COMMAND_TARGETS=(
  "$HOME/.claude/commands"
)

OLD_TARGETS=(
  "$HOME/.pi/agent/agents"
  "$HOME/.config/opencode/agent"
  "$HOME/.config/opencode/commands"
)

linked=0
backed_up=0
skipped=0
removed=0

link_md_dir() {
  local source_dir="$1"
  shift
  local targets=("$@")

  for source_file in "$source_dir"/*.md; do
    [ -f "$source_file" ] || continue
    local name
    name=$(basename "$source_file")

    for target_dir in "${targets[@]}"; do
      mkdir -p "$target_dir"
      local target="$target_dir/$name"

      if [ -L "$target" ] && [ "$(readlink "$target")" = "$source_file" ]; then
        skipped=$((skipped + 1))
        continue
      fi

      if [ -e "$target" ] && [ ! -L "$target" ]; then
        mv "$target" "${target}.bak"
        backed_up=$((backed_up + 1))
      fi

      [ -L "$target" ] && rm -f "$target"
      ln -s "$source_file" "$target"
      linked=$((linked + 1))
    done
  done
}

link_skill_dir() {
  local source_dir="$1"
  shift
  local targets=("$@")

  for skill_dir in "$source_dir"/*; do
    [ -d "$skill_dir" ] || continue
    local name
    name=$(basename "$skill_dir")

    for target_root in "${targets[@]}"; do
      mkdir -p "$target_root"
      local target="$target_root/$name"

      if [ -L "$target" ] && [ "$(readlink "$target")" = "$skill_dir" ]; then
        skipped=$((skipped + 1))
        continue
      fi

      if [ -e "$target" ] && [ ! -L "$target" ]; then
        mv "$target" "${target}.bak"
        backed_up=$((backed_up + 1))
      fi

      [ -L "$target" ] && rm -f "$target"
      ln -s "$skill_dir" "$target"
      linked=$((linked + 1))
    done
  done
}

remove_stale_links() {
  for stale_dir in "${OLD_TARGETS[@]}"; do
    [ -d "$stale_dir" ] || continue
    while IFS= read -r -d '' entry; do
      local resolved
      resolved=$(readlink -f "$entry" || true)
      case "$resolved" in
        "$REPO_DIR"/*)
          rm -f "$entry"
          removed=$((removed + 1))
          ;;
      esac
    done < <(find "$stale_dir" -maxdepth 1 -type l -print0)
  done
}

link_md_dir "$AGENTS_DIR" "${SHARED_AGENT_TARGETS[@]}" "${CLAUDE_AGENT_TARGETS[@]}"
link_md_dir "$COMMANDS_DIR" "${SHARED_COMMAND_TARGETS[@]}" "${CLAUDE_COMMAND_TARGETS[@]}"
link_skill_dir "$SKILLS_DIR" "${SHARED_SKILL_TARGETS[@]}"

# OpenCode compatibility alias in shared commands
mkdir -p "$HOME/.agents/commands"
if [ -f "$COMMANDS_DIR/review.md" ]; then
  REVIEW_ALIAS_TARGET="$HOME/.agents/commands/my-review.md"
  if [ -L "$REVIEW_ALIAS_TARGET" ] && [ "$(readlink "$REVIEW_ALIAS_TARGET")" = "$COMMANDS_DIR/review.md" ]; then
    skipped=$((skipped + 1))
  else
    if [ -e "$REVIEW_ALIAS_TARGET" ] && [ ! -L "$REVIEW_ALIAS_TARGET" ]; then
      mv "$REVIEW_ALIAS_TARGET" "${REVIEW_ALIAS_TARGET}.bak"
      backed_up=$((backed_up + 1))
    fi
    [ -L "$REVIEW_ALIAS_TARGET" ] && rm -f "$REVIEW_ALIAS_TARGET"
    ln -s "$COMMANDS_DIR/review.md" "$REVIEW_ALIAS_TARGET"
    linked=$((linked + 1))
  fi
fi

remove_stale_links

echo "armor init: linked $linked, backed up $backed_up, already current $skipped, removed stale $removed"
