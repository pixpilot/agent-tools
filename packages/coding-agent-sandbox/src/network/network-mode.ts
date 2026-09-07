/**
 * How much of the network a session gets.
 *
 * - `strict`: only the agent's provider and the active adapters' registries.
 * - `open`: any hostname, every one of them logged by the session proxy.
 * - `none`: no networking at all, and the network-dependent bootstrap is skipped.
 */
export type NetworkMode = 'strict' | 'open' | 'none';

export const NETWORK_MODES: readonly NetworkMode[] = ['strict', 'open', 'none'];

/** Safe by default, because `--full-access` already defaults to true. */
export const DEFAULT_NETWORK_MODE: NetworkMode = 'strict';

/** Parses a `--network` value, rejecting anything that is not a known mode. */
export function parseNetworkMode(value: string): NetworkMode {
  const mode = value.trim().toLowerCase();

  if (!isNetworkMode(mode)) {
    throw new Error(
      `Unknown --network mode ${JSON.stringify(value)}. Expected ${NETWORK_MODES.join(', ')}.`,
    );
  }

  return mode;
}

/** True when the session routes through the per-session proxy sidecar. */
export function usesProxy(mode: NetworkMode): boolean {
  return mode !== 'none';
}

function isNetworkMode(value: string): value is NetworkMode {
  return (NETWORK_MODES as readonly string[]).includes(value);
}
