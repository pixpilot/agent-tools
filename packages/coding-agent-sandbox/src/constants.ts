/**
 * Shared constants for the sandbox: default locations, container paths and
 * the Docker labels used to recognise containers owned by this CLI.
 */
import os from 'node:os';
import path from 'node:path';

/** Canonical location of the shared skills/prompts repository. */
export const DEFAULT_SKILLS_DIR = path.join(
  os.homedir(),
  '.coding-agent-sandbox',
  'skills',
);

/** Agent selected when neither a flag nor the guided setup names one. */
export const DEFAULT_AGENT = 'claude';

export const IMAGE_REPOSITORY = 'coding-agent-sandbox';
export const PROXY_IMAGE_REPOSITORY = 'coding-agent-sandbox-proxy';
export const PROXY_DOCKERFILE = 'Dockerfile.proxy';
export const PROXY_PORT = 8888;
export const CONTAINER_PREFIX = 'coding-agent-sandbox';

export const SANDBOX_LABEL = 'com.pixpilot.sandbox';
export const AGENT_LABEL = `${SANDBOX_LABEL}.agent`;
export const WORKTREE_LABEL = `${SANDBOX_LABEL}.worktree`;
export const REPO_LABEL = `${SANDBOX_LABEL}.repo`;
export const PRUNABLE_VOLUME_LABEL = `${SANDBOX_LABEL}.prunable`;

export const CONTAINER_HOME = '/home/node';
export const CONTAINER_WORKSPACE = '/workspace';
export const CONTAINER_GIT_DIR = '/repo/.git';
export const CONTAINER_SKILLS_SRC = '/coding-agent-sandbox/skills';
export const CONTAINER_SKILLS_WORK = '/coding-agent-sandbox/work';
export const CONTAINER_STATE_ROOT = '/agent-state';

/**
 * Hosts the container bootstrap needs before any agent exists: every supported
 * agent CLI and the skills repository install through npm.
 */
export const BOOTSTRAP_EGRESS_HOSTS: readonly string[] = ['registry.npmjs.org'];

export const NPM_GLOBAL_VOLUME = 'coding-agent-sandbox-npm-global';
export const HOME_CACHE_VOLUME = 'coding-agent-sandbox-cache-home';
export const PACKAGE_CACHE_VOLUME = 'coding-agent-sandbox-package-cache';

export const EXIT_CODE_ERROR = 1;
