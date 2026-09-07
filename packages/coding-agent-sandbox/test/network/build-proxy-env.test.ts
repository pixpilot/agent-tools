import { describe, expect, it } from 'vitest';
import { buildProxyEnv } from '../../src/network/build-proxy-env';

const PROXY_URL = 'http://coding-agent-sandbox-proxy-abc123def456:8888';

describe('buildProxyEnv', () => {
  it('should set both cases of every proxy variable, because tool support varies', () => {
    const env = buildProxyEnv(PROXY_URL);

    expect(env['HTTP_PROXY']).toBe(PROXY_URL);
    expect(env['http_proxy']).toBe(PROXY_URL);
    expect(env['HTTPS_PROXY']).toBe(PROXY_URL);
    expect(env['https_proxy']).toBe(PROXY_URL);
  });

  it('should bypass the proxy only for the loopback interface', () => {
    const env = buildProxyEnv(PROXY_URL);

    expect(env['NO_PROXY']).toBe('localhost,127.0.0.1');
    expect(env['no_proxy']).toBe('localhost,127.0.0.1');
  });

  it('should opt Node into honouring the proxy for fetch where supported', () => {
    expect(buildProxyEnv(PROXY_URL)['NODE_USE_ENV_PROXY']).toBe('1');
  });
});
