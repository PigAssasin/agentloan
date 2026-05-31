#!/bin/bash
# Blocks destructive shell commands before execution

COMMAND="$1"

BLOCKED_PATTERNS=(
  "rm -rf"
  "git push --force"
  "git push -f"
  "git reset --hard"
  "DROP TABLE"
  "format c:"
  "> /dev/null && rm"
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qi "$pattern"; then
    echo "BLOCKED: Dangerous command detected: '$pattern'"
    echo "Command: $COMMAND"
    exit 1
  fi
done

exit 0
