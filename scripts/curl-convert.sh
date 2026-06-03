#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title curl-convert
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 🔁
# @raycast.packageName curl-convert

# Documentation:
# @raycast.description convert curl to curlie
# @raycast.author wang0122xl
# @raycast.authorURL https://raycast.com/wang0122xl

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

INPUT="$(pbpaste)"

if [ -z "$INPUT" ]; then
  echo "No curl command provided."
  exit 1
fi

if ! command -v curlie >/dev/null 2>&1; then
  echo "curlie is not installed or not in PATH."
  exit 1
fi

if [[ ! "$INPUT" =~ ^[[:space:]]*curl([[:space:]]|$) ]]; then
  echo "Input must start with curl."
  exit 1
fi

REPLACEMENT="curlie --pretty"
if [[ ! "$INPUT" =~ (^|[[:space:]])(-X[^[:space:]]*|--request([=[:space:]]|$)|-d|--data|--data-raw|--data-binary|-F|--form|-T|--upload-file|-I|--head|-V|--version|-h|--help|-M|--manual)([=[:space:]]|$) ]]; then
  REPLACEMENT="curlie --pretty GET"
fi

COMMAND="$(printf '%s' "$INPUT" | sed -E "1s/^([[:space:]]*)curl([[:space:]]|$)/\\1${REPLACEMENT}\\2/")"
OUTPUT="$(/bin/zsh -lc "$COMMAND" 2>&1)"
EXIT_CODE=$?

printf 'Command:\n%s\n\n---\n\n' "$COMMAND"
printf '%s\n' "$OUTPUT"
exit "$EXIT_CODE"
