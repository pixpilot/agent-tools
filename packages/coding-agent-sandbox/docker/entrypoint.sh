#!/usr/bin/env bash
# Container-side session bootstrap. Everything is driven by SANDBOX_* env vars
# so that a single shared image can serve every agent.
set -uo pipefail

readonly ESC=$'\033'
step() { printf '%s[36m> %s%s[0m\n' "$ESC" "$1" "$ESC"; }
note() { printf '%s[90m  %s%s[0m\n' "$ESC" "$1" "$ESC"; }
warn() { printf '%s[33m! %s%s[0m\n' "$ESC" "$1" "$ESC" >&2; }
die() { printf '\n%s[31mx %s%s[0m\n' "$ESC" "$1" "$ESC" >&2; exit 1; }

STATE_ROOT="${SANDBOX_STATE_ROOT:-/agent-state}"
AGENT_LABEL="${SANDBOX_AGENT_LABEL:-coding agent}"
SRC="${SANDBOX_SKILLS_SRC:-/coding-agent-sandbox/skills}"
WORK="${SANDBOX_SKILLS_WORK:-/coding-agent-sandbox/work}"

# The bind-mounted worktree belongs to the host user, not to `node`.
git config --global --add safe.directory /workspace >/dev/null 2>&1 || true

# --- 1. Persist agent state in the per-agent Docker volume -------------------
# Refuse empty/root homes and traversal before replacing any state paths.
case "${HOME:-}" in
  /*) [ "$(realpath -m -- "$HOME")" != / ] || die "HOME must not be /" ;;
  *) die "HOME must be an absolute directory" ;;
esac

validate_state_path() {
  case "/$1/" in
    *'//'*|*'/../'*|*'/./'*) die "Invalid relative agent state path: $1" ;;
  esac
}

link_state_dir() {
  validate_state_path "$1"
  local src="$STATE_ROOT/$1" dst="$HOME/$1"
  mkdir -p "$src" "$(dirname "$dst")" || return 1
  rm -rf "$dst" && ln -s "$src" "$dst"
}

link_state_file() {
  validate_state_path "$1"
  local src="$STATE_ROOT/$1" dst="$HOME/$1"
  mkdir -p "$(dirname "$src")" "$(dirname "$dst")" || return 1
  [ -e "$src" ] || : >"$src"
  rm -rf "$dst" && ln -s "$src" "$dst"
}

while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  link_state_dir "$rel" || die "Could not link agent state directory ~/$rel"
done <<<"${SANDBOX_STATE_DIRS:-}"

while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  link_state_file "$rel" || die "Could not link agent state file ~/$rel"
done <<<"${SANDBOX_STATE_FILES:-}"

# --- 2. Agent CLI ------------------------------------------------------------
if [ "${SANDBOX_OFFLINE:-0}" = "1" ]; then
  command -v "${SANDBOX_AGENT_BIN:-}" >/dev/null 2>&1 \
    || die "Offline mode requires an installed $AGENT_LABEL CLI; run online first"
elif [ -n "${SANDBOX_AGENT_INSTALL:-}" ]; then
  if [ "${SANDBOX_AGENT_UPDATE:-0}" = "1" ] || ! command -v "${SANDBOX_AGENT_BIN:-}" >/dev/null 2>&1; then
    step "Installing $AGENT_LABEL"
    eval "$SANDBOX_AGENT_INSTALL" || die "Failed to install the $AGENT_LABEL CLI"
  else
    note "$AGENT_LABEL already installed (pass --update-agent to upgrade)"
  fi
fi

# --- 3. Shared skills and prompts -------------------------------------------
# Sync utilities are written for the Windows host, so two shims make them run
# unchanged here: placeholder config files they expect to already exist, and a
# "<Drive>:/Users/<host user>" symlink tree that redirects host profile paths
# into the container home.
seed_file() {
  local rel="$1" contents="$2" dst="$HOME/$1"
  [ -s "$dst" ] && return 0
  mkdir -p "$(dirname "$dst")" || return 1
  printf '%s' "$contents" >"$dst"
}

seed_placeholders() {
  local rel
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    seed_file "$rel" '{}' || return 1
  done <<<"${SANDBOX_SEED_JSON:-}"

  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    seed_file "$rel" '' || return 1
  done <<<"${SANDBOX_SEED_EMPTY:-}"

  return 0
}

link_windows_profile() {
  local user="${SANDBOX_HOST_USER:-}" letter
  [ -n "$user" ] || return 0
  for letter in {A..Z}; do
    mkdir -p "$WORK/$letter:/Users" || return 1
    ln -sfn "$HOME" "$WORK/$letter:/Users/$user" || return 1
  done
  return 0
}

# Catches sync utilities that wrote to a profile the shim did not cover.
rehome_windows_profile_paths() {
  local drive profile
  shopt -s nullglob
  for drive in "$WORK"/?:; do
    [ -d "$drive" ] || continue
    for profile in "$drive"/Users/*; do
      # Shimmed profiles already point at $HOME - copying them would recurse.
      [ -L "$profile" ] && continue
      [ -d "$profile" ] || continue
      cp -a "$profile/." "$HOME/" || return 1
    done
    rm -rf "$drive"
  done
  shopt -u nullglob
  return 0
}

if [ "${SANDBOX_OFFLINE:-0}" != "1" ] && [ "${SANDBOX_SKILLS_ENABLED:-1}" = "1" ]; then
  step "Provisioning shared skills and prompts"
  [ -d "$SRC" ] || die "Skills source is not mounted at $SRC"
  rm -rf "$WORK" && mkdir -p "$WORK" || die "Could not prepare the skills work directory"
  cp -a "$SRC/." "$WORK/" || die "Could not copy the skills repository into $WORK"
  seed_placeholders || die "Could not seed placeholder configuration files"
  link_windows_profile || die "Could not prepare host profile path shims"
  cd "$WORK" || die "Could not enter $WORK"
  if [ -f package.json ] && [ ! -d node_modules ]; then
    note "Installing skills repository dependencies"
    npm install --ignore-scripts --no-audit --no-fund --loglevel=error \
      || die "Skills repository dependencies failed to install"
  fi
  eval "${SANDBOX_SKILLS_SYNC_CMD:-node sync.js}" \
    || die "The skills sync utility failed - refusing to launch $AGENT_LABEL"
  rehome_windows_profile_paths || die "Could not re-home synced configuration into $HOME"
  cd /workspace || die "Could not enter /workspace"
  if [ -n "${SANDBOX_POST_SYNC_CMD:-}" ]; then
    eval "$SANDBOX_POST_SYNC_CMD" || die "Post-sync setup for $AGENT_LABEL failed"
  fi
else
  warn "Skills provisioning is disabled for this session"
fi

# --- 4. Project dependencies -------------------------------------------------
# Non-fatal: a broken install is something the agent can investigate and fix.
if [ "${SANDBOX_OFFLINE:-0}" != "1" ] && [ -n "${SANDBOX_DEPS_INSTALL:-}" ]; then
  package_manager="$(node -e 'try { process.stdout.write(JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).packageManager ?? "") } catch {}' 2>/dev/null || true)"
  if [ -f pnpm-lock.yaml ] || [[ "$package_manager" == pnpm@* ]]; then
    # Let the selected pnpm version write its own global config format. This
    # keeps the shared store out of the worktree and leaves project config intact.
    pnpm config set --global store-dir /cache/pnpm \
      || warn "Could not configure the persistent pnpm store"
  fi
  # Yarn Modern uses YARN_GLOBAL_FOLDER and retains a repository's local-cache
  # configuration. Yarn Classic needs its separate cache-folder setting.
  if [ -f yarn.lock ]; then
    case "$package_manager" in
      yarn@1.*) export YARN_CACHE_FOLDER=/cache/yarn-classic ;;
      yarn@*) ;;
      *)
        if [ ! -f .yarnrc.yml ]; then
          yarn_version="$(yarn --version 2>/dev/null || true)"
          case "$yarn_version" in
            1.*) export YARN_CACHE_FOLDER=/cache/yarn-classic ;;
          esac
        fi
        ;;
    esac
  fi
  step "Installing project dependencies (${SANDBOX_ENV_LABEL:-project})"
  eval "$SANDBOX_DEPS_INSTALL" || warn "Dependency installation failed - continuing anyway"
fi

# --- 5. Authentication -------------------------------------------------------
authenticated() {
  [ -z "${SANDBOX_AUTH_PROBE:-}" ] && return 0
  eval "$SANDBOX_AUTH_PROBE" >/dev/null 2>&1
}

if [ "${SANDBOX_OFFLINE:-0}" = "1" ]; then
  note "Offline mode: skipping authentication"
elif [ "${SANDBOX_FORCE_LOGIN:-0}" = "1" ] || ! authenticated; then
  if [ -n "${SANDBOX_LOGIN_CMD:-}" ]; then
    step "Signing in to $AGENT_LABEL"
    eval "$SANDBOX_LOGIN_CMD" || die "$AGENT_LABEL login failed"
    authenticated || die "$AGENT_LABEL is still not authenticated - aborting"
  else
    warn "$AGENT_LABEL is not authenticated yet."
    [ -n "${SANDBOX_AUTH_HINT:-}" ] && note "$SANDBOX_AUTH_HINT"
    note "Credentials persist in the ${SANDBOX_AUTH_VOLUME:-agent} Docker volume and are reused next time."
  fi
fi

# --- 6. Hand the terminal to the agent ---------------------------------------
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

step "Launching $AGENT_LABEL in /workspace"
exec bash -c "${SANDBOX_AGENT_CMD:?SANDBOX_AGENT_CMD is required}"
