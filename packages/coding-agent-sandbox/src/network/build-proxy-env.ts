import { NO_PROXY_HOSTS } from '../constants';

/**
 * Proxy variables for the agent container. Both cases of each name are set
 * because tool coverage is inconsistent; npm, Git and curl honour them
 * natively, so no per-tool proxy configuration is needed.
 */
export function buildProxyEnv(proxyUrl: string): Record<string, string> {
  return {
    HTTP_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    https_proxy: proxyUrl,
    NO_PROXY: NO_PROXY_HOSTS,
    no_proxy: NO_PROXY_HOSTS,
    // Inert on Node 22, correct on Node 24+, where fetch honours it.
    NODE_USE_ENV_PROXY: '1',
  };
}
