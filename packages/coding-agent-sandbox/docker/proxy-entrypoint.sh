#!/usr/bin/env bash
# Renders the session's tinyproxy configuration from SANDBOX_PROXY_* and execs
# tinyproxy. The configuration is written once here and never mutated, so a
# session's egress policy is fixed for the life of its proxy container.
set -euo pipefail

readonly CONF=/tmp/tinyproxy.conf
readonly FILTER=/tmp/tinyproxy.filter
readonly MODE="${SANDBOX_PROXY_MODE:-strict}"
readonly PORT="${SANDBOX_PROXY_PORT:-8888}"

case "$MODE" in
  strict | open) ;;
  *)
    printf 'Unsupported SANDBOX_PROXY_MODE: %s\n' "$MODE" >&2
    exit 1
    ;;
esac

# ConnectPort 443 is the whole SSH story: without it tinyproxy tunnels CONNECT
# to any port. LogLevel Connect puts one line per hostname on stdout, which is
# what `open` mode delivers instead of prevention.
cat >"$CONF" <<EOF
Port $PORT
Timeout 600
MaxClients 100
ConnectPort 443
LogLevel Connect
DisableViaHeader Yes
EOF

if [ "$MODE" = strict ]; then
  printf '%s\n' "${SANDBOX_PROXY_ALLOW:-}" | grep -v '^[[:space:]]*$' >"$FILTER" || true

  if [ ! -s "$FILTER" ]; then
    printf 'strict mode needs a non-empty SANDBOX_PROXY_ALLOW allowlist\n' >&2
    exit 1
  fi

  # FilterDefaultDeny turns the list into an allowlist. The host patterns are
  # anchored by the caller, because tinyproxy matches filters unanchored.
  # FilterType ere is required: the default is basic regex, where the grouping
  # and `+` in a wildcard pattern would be read as literal characters. The path
  # must be quoted, and both filter defaults we rely on - matching domains
  # rather than URLs, and case-insensitivity - apply only while unset.
  cat >>"$CONF" <<EOF
Filter "$FILTER"
FilterDefaultDeny Yes
FilterType ere
EOF

  printf 'egress: strict, %s host patterns allowed\n' "$(wc -l <"$FILTER")" >&2
else
  printf 'egress: open, every hostname is logged\n' >&2
fi

exec tinyproxy -d -c "$CONF"
