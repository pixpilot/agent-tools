import type { NetworkMode } from '../network/network-mode';
import type { SessionNetworkNames } from '../network/session-network-names';
import type { SandboxLabelSource } from './build-sandbox-labels';
import { PROXY_PORT } from '../constants';
import { detail, step } from '../utils/logger';
import { runOrThrow } from '../utils/run-command';
import { buildSandboxLabels } from './build-sandbox-labels';
import { removeSessionNetwork } from './remove-session-network';

const PROXY_PIDS_LIMIT = 64;

/**
 * `--internal` alone is not enough: such a network still has a gateway address,
 * and that gateway is the Docker host. `inhibit_ipv4` leaves the bridge without
 * an address, so there is nothing on-link for the agent to reach.
 */
const INTERNAL_NETWORK_OPTS = [
  '--internal',
  '--opt',
  'com.docker.network.bridge.inhibit_ipv4=true',
];

export interface SessionNetworkOptions {
  names: SessionNetworkNames;
  /** `none` never reaches here; the caller skips the proxy entirely. */
  mode: Exclude<NetworkMode, 'none'>;
  /** Allowlist for `strict`; ignored in `open`. */
  allowHosts: readonly string[];
  labels: SandboxLabelSource;
  proxyImage: string;
}

/**
 * Brings up one session's egress path: an internal network the agent joins, an
 * egress network only the proxy sees, and the proxy bridging the two. Created,
 * connected and only then started, so the proxy never runs without egress.
 */
export function ensureSessionNetwork(options: SessionNetworkOptions): void {
  const { names, mode, labels, proxyImage } = options;

  // A crashed session may have left these behind under the same deterministic
  // names; never adopt a proxy whose allowlist we did not just write.
  removeSessionNetwork(names);

  step(`Starting the ${mode} egress proxy for this session`);
  const labelArgs = buildSandboxLabels(labels);

  runOrThrow('docker', [
    'network',
    'create',
    ...INTERNAL_NETWORK_OPTS,
    ...labelArgs,
    names.internal,
  ]);
  runOrThrow('docker', ['network', 'create', ...labelArgs, names.egress]);

  runOrThrow('docker', [
    'create',
    '--name',
    names.proxy,
    '--network',
    names.internal,
    ...labelArgs,
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--pids-limit',
    String(PROXY_PIDS_LIMIT),
    '-e',
    `SANDBOX_PROXY_MODE=${mode}`,
    '-e',
    `SANDBOX_PROXY_PORT=${PROXY_PORT}`,
    '-e',
    `SANDBOX_PROXY_ALLOW=${buildAllowList(options)}`,
    proxyImage,
  ]);

  runOrThrow('docker', ['network', 'connect', names.egress, names.proxy]);
  runOrThrow('docker', ['start', names.proxy]);

  if (mode === 'strict') {
    detail(`allowed hosts: ${options.allowHosts.join(', ')}`);
  } else {
    detail('every hostname is allowed and logged; the audit trail is the deliverable');
  }
}

/** Raw allowlist entries; the proxy applies exact/wildcard host matching itself. */
function buildAllowList({ mode, allowHosts }: SessionNetworkOptions): string {
  return mode === 'strict' ? allowHosts.join('\n') : '';
}
