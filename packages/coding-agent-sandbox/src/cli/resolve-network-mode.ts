import type { NetworkMode } from '../network/network-mode';
import { DEFAULT_NETWORK_MODE } from '../network/network-mode';
import { warn } from '../utils/logger';

/** The `--network` and deprecated `--offline` inputs, before resolution. */
export interface NetworkModeInput {
  network?: NetworkMode | undefined;
  offline?: boolean | undefined;
}

/**
 * Resolves the session network mode, honouring the deprecated `--offline`
 * alias and refusing a contradictory combination of the two.
 */
export function resolveNetworkMode(options: NetworkModeInput): NetworkMode {
  if (options.offline !== true) {
    return options.network ?? DEFAULT_NETWORK_MODE;
  }

  if (options.network != null && options.network !== 'none') {
    throw new Error(
      `--offline is an alias for --network none and cannot be combined with --network ${options.network}.`,
    );
  }

  warn('--offline is deprecated and will be removed. Use --network none instead.');
  return 'none';
}
