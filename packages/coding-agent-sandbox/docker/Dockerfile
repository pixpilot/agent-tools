# One shared development image for every agent and every project type.
# Agent CLIs are installed at session start into a persistent npm-global volume,
# so this image never needs to be rebuilt per agent.
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    jq \
    less \
    procps \
    python3 \
    ripgrep \
    unzip \
  && rm -rf /var/lib/apt/lists/*

# Installed with the default (root-owned) prefix so it survives even when the
# runtime npm-global volume is empty or stale.
RUN npm install -g @antfu/ni@latest && corepack enable

# NI_DEFAULT_AGENT and COREPACK_ENABLE_DOWNLOAD_PROMPT keep dependency installs
# non-interactive: `ni` otherwise prompts for a package manager in projects with
# no lockfile, and corepack asks before downloading pnpm/yarn.
ENV HOME=/home/node \
    SHELL=/bin/bash \
    NPM_CONFIG_PREFIX=/home/node/.npm-global \
    NPM_CONFIG_CACHE=/cache/npm \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    BUN_INSTALL_CACHE_DIR=/cache/bun \
    COREPACK_HOME=/cache/corepack \
    YARN_GLOBAL_FOLDER=/cache/yarn \
    NI_DEFAULT_AGENT=npm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PATH=/home/node/.npm-global/bin:/usr/local/bin:/usr/bin:/bin

# Pre-creating these with `node` ownership makes Docker initialise the named
# volumes mounted over them as writable by the unprivileged user.
RUN mkdir -p \
    /home/node/.npm-global/bin \
    /home/node/.cache \
    /cache/bun \
    /cache/corepack \
    /cache/npm \
    /cache/pnpm \
    /cache/yarn \
    /workspace/node_modules \
    /agent-state \
    /coding-agent-sandbox/skills \
    /coding-agent-sandbox/work \
  && chown -R node:node /home/node /cache /workspace /agent-state /coding-agent-sandbox

COPY --chown=node:node entrypoint.sh /usr/local/bin/sandbox-entrypoint
# Strip CR in case the script was checked out or packed on a Windows host.
RUN sed -i 's/\r$//' /usr/local/bin/sandbox-entrypoint \
  && chmod 0755 /usr/local/bin/sandbox-entrypoint

USER node
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/sandbox-entrypoint"]
