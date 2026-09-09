import type { ProxyAudit } from '../network/extract-proxy-hosts';
import type { SessionNetworkNames } from '../network/session-network-names';
import { SANDBOX_LABEL } from '../constants';
import { extractProxyHosts } from '../network/extract-proxy-hosts';
import { detail, plain, warn } from '../utils/logger';
import { runCapture } from '../utils/run-command';

/**
 * Unique hostnames the session's proxy saw. Read before teardown, because
 * removing the container discards its log.
 */
export function readProxyHosts(names: SessionNetworkNames): ProxyAudit {
  const logs = runCapture('docker', ['logs', names.proxy]);

  return logs.status === 0
    ? extractProxyHosts(`${logs.stdout}\n${logs.stderr}`)
    : { reached: [], blocked: [] };
}

/**
 * Removes a session's proxy and networks. Best-effort throughout: a stuck
 * Docker object must never fail a session whose work is already on disk.
 */
export function removeSessionNetwork(names: SessionNetworkNames): void {
  if (ownedByThisCli(names.proxy)) {
    runCapture('docker', ['rm', '-f', names.proxy]);
  }

  for (const network of [names.egress, names.internal]) {
    const removed = runCapture('docker', ['network', 'rm', network]);

    // Absent is the normal case; only a present-but-unremovable network matters.
    if (removed.status !== 0 && networkExists(network)) {
      warn(`Could not remove the session network ${network}: ${removed.stderr}`);
    }
  }
}

/** Prints the hostnames the session reached, and the ones it was refused. */
export function printProxyAudit(audit: ProxyAudit): void {
  plain();

  if (audit.reached.length === 0) {
    detail('egress audit: the session reached no hosts through the proxy.');
  } else {
    detail(`egress audit: ${audit.reached.length} host(s) seen by the session proxy`);

    for (const host of audit.reached) {
      plain(`  ${host}`);
    }
  }

  if (audit.blocked.length === 0) {
    return;
  }

  plain();
  warn(`${audit.blocked.length} host(s) were refused by the network policy:`);

  for (const host of audit.blocked) {
    plain(`  ${host}`);
  }

  detail('Add the ones you trust with --allow-hosts, or rerun with --network open.');
}

function ownedByThisCli(container: string): boolean {
  const inspect = runCapture('docker', [
    'inspect',
    '--format',
    `{{index .Config.Labels "${SANDBOX_LABEL}"}}`,
    container,
  ]);

  return inspect.status === 0 && inspect.stdout === '1';
}

function networkExists(network: string): boolean {
  return runCapture('docker', ['network', 'inspect', network]).status === 0;
}
