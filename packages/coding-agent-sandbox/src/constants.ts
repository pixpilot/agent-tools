/**
 * Shared constants for the sandbox: default locations, container paths and
 * the Docker labels used to recognise containers owned by this CLI.
 */
/** Agent selected when neither a flag nor the guided setup names one. */
export const DEFAULT_AGENT = 'claude';

export const IMAGE_REPOSITORY = 'coding-agent-sandbox';
export const PROXY_IMAGE_REPOSITORY = 'coding-agent-sandbox-proxy';
export const PROXY_DOCKERFILE = 'Dockerfile.proxy';
export const PROXY_PORT = 8888;
export const CONTAINER_PREFIX = 'coding-agent-sandbox';
export const NETWORK_PREFIX = `${CONTAINER_PREFIX}-net`;
export const EGRESS_NETWORK_PREFIX = `${CONTAINER_PREFIX}-egress`;
export const PROXY_CONTAINER_PREFIX = `${CONTAINER_PREFIX}-proxy`;

/** Hosts the container must never send to the proxy. */
export const NO_PROXY_HOSTS = 'localhost,127.0.0.1';

/** Prefix for host temporary directories, so a leftover names its creator. */
export const TEMP_DIRECTORY_PREFIX = `${CONTAINER_PREFIX}-`;
/** Marker that exempts a temporary directory kept for recovery from sweeps. */
export const TEMP_DIRECTORY_KEEP_MARKER = '.keep-for-recovery';

export const SANDBOX_LABEL = 'com.pixpilot.sandbox';
export const AGENT_LABEL = `${SANDBOX_LABEL}.agent`;
export const WORKTREE_LABEL = `${SANDBOX_LABEL}.worktree`;
export const REPO_LABEL = `${SANDBOX_LABEL}.repo`;
export const PRUNABLE_VOLUME_LABEL = `${SANDBOX_LABEL}.prunable`;

export const CONTAINER_HOME = '/home/node';
export const CONTAINER_WORKSPACE = '/workspace';
export const CONTAINER_GIT_DIR = '/repo/.git';
export const CONTAINER_CONFIGS_SRC = '/coding-agent-sandbox/configs';
export const CONTAINER_STATE_ROOT = '/agent-state';

/**
 * Hosts the container bootstrap needs before any agent exists: every supported
 * agent CLI installs through npm.
 */
export const BOOTSTRAP_EGRESS_HOSTS: readonly string[] = ['registry.npmjs.org'];

export const NPM_GLOBAL_VOLUME = 'coding-agent-sandbox-npm-global';
export const HOME_CACHE_VOLUME = 'coding-agent-sandbox-cache-home';
export const PACKAGE_CACHE_VOLUME = 'coding-agent-sandbox-package-cache';

export const EXIT_CODE_ERROR = 1;
