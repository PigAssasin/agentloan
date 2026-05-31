#!/bin/bash
# Auto-format files after Claude edits them

FILE="$1"

if [ -z "$FILE" ]; then
  exit 0
fi

EXT="${FILE##*.}"

case "$EXT" in
  ts|tsx)
    if command -v prettier &>/dev/null; then
      prettier --write "$FILE" --silent
    fi
    ;;
  sol)
    if command -v forge &>/dev/null; then
      forge fmt "$FILE" 2>/dev/null
    fi
    ;;
  json)
    if command -v prettier &>/dev/null; then
      prettier --write "$FILE" --silent
    fi
    ;;
esac

exit 0
