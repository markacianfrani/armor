#!/bin/bash

input=$(cat)

model_name=$(echo "$input" | jq -r '.model.display_name')
current_dir=$(echo "$input" | jq -r '.workspace.current_dir')

# Context window size — fall back to inferring from the model name
context_size=$(echo "$input" | jq -r '.context_window.context_window_size // empty')
current_usage=$(echo "$input" | jq '.context_window.current_usage')

if [ -z "$context_size" ] || [ "$context_size" = "null" ]; then
    if echo "$model_name" | grep -qi "1M"; then
        context_size=1000000
    else
        context_size=200000
    fi
fi

if [ "$current_usage" != "null" ]; then
    current_tokens=$(echo "$current_usage" | jq '.input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens')
    context_percent=$((current_tokens * 100 / context_size))
else
    context_percent=0
fi

# Progress bar
bar_width=10
filled=$((context_percent * bar_width / 100))
empty=$((bar_width - filled))
bar=""
for ((i=0; i<filled; i++)); do bar+="█"; done
for ((i=0; i<empty; i++)); do bar+="░"; done

dir_name=$(basename "$current_dir")

cd "$current_dir" 2>/dev/null || cd /
branch=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    branch=$(git branch --show-current 2>/dev/null || echo "detached")
fi

GRAY='\033[0;90m'
GREEN='\033[0;32m'
NC='\033[0m'
DOT=" ${GRAY}·${NC} "

out="${GRAY}${bar}${NC} ${GREEN}${context_percent}%${NC}${DOT}${GRAY}${dir_name}${NC}"
[ -n "$branch" ] && out="${out}${DOT}${GRAY}${branch}${NC}"
out="${out}${DOT}${GRAY}${model_name}${NC}"

echo -e "$out"
