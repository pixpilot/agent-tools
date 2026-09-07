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
    // Load-bearing, not future-proofing: without this Node's fetch resolves DNS
    // itself and dies with EAI_AGAIN on the internal network. Measured on
    // node:22-bookworm-slim (v22.23.2), which backports undici's
    // EnvHttpProxyAgent. This is what makes MCP servers and WebFetch work.
    NODE_USE_ENV_PROXY: '1',
  };
}
