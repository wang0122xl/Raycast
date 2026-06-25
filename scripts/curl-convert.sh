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

BOLD=$'\033[1m'
TITLE_BLUE=$'\033[38;5;39m'
RESET=$'\033[0m'

redact_sensitive() {
  sed -E "s/(authorization: Bearer )[A-Za-z0-9._-]+/\\1[REDACTED]/Ig; s/(Authorization: Bearer )[A-Za-z0-9._-]+/\\1[REDACTED]/g"
}

soften_colors() {
  LC_ALL=C LANG=C perl -pe 's/\e\[31m/\e[38;5;196m/g; s/\e\[33m/\e[38;5;214m/g; s/\e\[34m/\e[38;5;27m/g; s/\e\[94m/\e[38;5;27m/g; s/\e\[36m/\e[38;5;31m/g; s/\e\[96m/\e[38;5;31m/g; s/\e\[37m/\e[38;5;15m/g'
}

compact_indent() {
  LC_ALL=C LANG=C perl -pe 's/^( +)/" " x (length($1) >> 1)/e'
}

clean_tty_output() {
  LC_ALL=C LANG=C perl -pe 's/\^D\x08\x08//g; s/\r$//'
}

INPUT="$(pbpaste)"

if [ -z "$INPUT" ]; then
  printf 'No curl command provided.\n'
  exit 1
fi

if ! command -v curlie >/dev/null 2>&1; then
  printf 'curlie is not installed or not in PATH.\n'
  exit 1
fi

if [[ ! "$INPUT" =~ ^[[:space:]]*curl([[:space:]]|$) ]]; then
  printf 'Input must start with curl.\n'
  exit 1
fi

REPLACEMENT="curlie --pretty --connect-timeout 10 --max-time 60"
if [[ ! "$INPUT" =~ (^|[[:space:]])(-X[^[:space:]]*|--request([=[:space:]]|$)|-d|--data|--data-raw|--data-binary|-F|--form|-T|--upload-file|-I|--head|-V|--version|-h|--help|-M|--manual)([=[:space:]]|$) ]]; then
  REPLACEMENT="curlie --pretty --connect-timeout 10 --max-time 60 GET"
fi

COMMAND="$(printf '%s' "$INPUT" | sed -E "1s/^([[:space:]]*)curl([[:space:]]|$)/\\1${REPLACEMENT}\\2/")"
DISPLAY_COMMAND="$(printf '%s\n' "$COMMAND" | redact_sensitive)"

printf '%b%s%b\n' "$TITLE_BLUE$BOLD" "Command" "$RESET"
printf '%s\n\n' "$DISPLAY_COMMAND"
printf '%s\n\n' "----------------------------------------"
printf '%b%s%b\n' "$TITLE_BLUE$BOLD" "Response" "$RESET"
if command -v script >/dev/null 2>&1; then
  OUTPUT="$(script -q /dev/null /bin/zsh -lc "$COMMAND" </dev/null 2>&1)"
else
  OUTPUT="$(/bin/zsh -lc "$COMMAND" </dev/null 2>&1)"
fi
EXIT_CODE=$?
printf '%s\n' "$OUTPUT" | clean_tty_output | compact_indent | soften_colors
exit "$EXIT_CODE"
