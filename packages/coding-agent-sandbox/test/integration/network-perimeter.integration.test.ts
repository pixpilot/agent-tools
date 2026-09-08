import type { SessionNetworkNames } from '../../src/network/session-network-names';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureProxyImage } from '../../src/docker/ensure-proxy-image';
import { ensureSessionNetwork } from '../../src/docker/ensure-session-network';
import { removeSessionNetwork } from '../../src/docker/remove-session-network';
import { sessionNetworkNames } from '../../src/network/session-network-names';
import {
  docker,
  DOCKER_TESTS_ENABLED,
  gatewayOf,
  NODE_PROBE_IMAGE,
  nodeProbe,
  probe,
  PROBE_IMAGE,
} from './docker-probe';

const SETUP_TIMEOUT = 300_000;
const CASE_TIMEOUT = 120_000;
const ALLOWED_HOST = 'registry.npmjs.org';
const BLOCKED_HOST = 'example.com';

const labels = {
  agentId: 'claude',
  worktreePath: '/tmp/csbx-integration',
  repositoryRoot: '/tmp/csbx-integration',
};

function startSession(key: string, mode: 'strict' | 'open'): SessionNetworkNames {
  const names = sessionNetworkNames(`csbx-integration-${mode}-${key}`);
  ensureSessionNetwork({
    names,
    mode,
    allowHosts: [ALLOWED_HOST],
    labels,
    proxyImage: ensureProxyImage(),
  });
  return names;
}

describe.skipIf(!DOCKER_TESTS_ENABLED)('strict mode perimeter', () => {
  let names: SessionNetworkNames;

  beforeAll(() => {
    docker(['pull', PROBE_IMAGE]);
    docker(['pull', NODE_PROBE_IMAGE]);
    names = startSession('a', 'strict');
  }, SETUP_TIMEOUT);

  afterAll(() => {
    removeSessionNetwork(names);
  });

  it(
    'should block direct access to the internet',
    () => {
      const out = probe(
        names.internal,
        `curl -s --noproxy '*' --max-time 5 https://${BLOCKED_HOST}/ >/dev/null && echo LEAK || echo BLOCKED`,
      );

      expect(out).toContain('BLOCKED');
    },
    CASE_TIMEOUT,
  );

  it(
    'should block the LAN',
    () => {
      const out = probe(
        names.internal,
        "curl -s --noproxy '*' --max-time 5 http://192.168.1.1/ >/dev/null && echo LEAK || echo BLOCKED",
      );

      expect(out).toContain('BLOCKED');
    },
    CASE_TIMEOUT,
  );

  it(
    'should block the cloud metadata address',
    () => {
      const out = probe(
        names.internal,
        "curl -s --noproxy '*' --max-time 5 http://169.254.169.254/ >/dev/null && echo LEAK || echo BLOCKED",
      );

      expect(out).toContain('BLOCKED');
    },
    CASE_TIMEOUT,
  );

  it(
    'should leave the network gateway unreachable, so host services are not exposed',
    () => {
      // A default route and a gateway address still exist on an --internal
      // network; inhibit_ipv4 is what makes the gateway itself unreachable.
      const gateway = gatewayOf(names.internal);
      const out = probe(
        names.internal,
        `ping -c1 -W2 ${gateway} >/dev/null 2>&1 && echo REACHABLE || echo UNREACHABLE`,
      );

      expect(gateway).not.toBe('');
      expect(out).toContain('UNREACHABLE');
    },
    CASE_TIMEOUT,
  );

  it(
    'should not resolve or reach host.docker.internal',
    () => {
      const out = probe(
        names.internal,
        "getent hosts host.docker.internal >/dev/null 2>&1 && (curl -s --noproxy '*' --max-time 5 http://host.docker.internal/ >/dev/null && echo LEAK || echo UNREACHABLE) || echo UNRESOLVABLE",
      );

      expect(out).toMatch(/UNRESOLVABLE|UNREACHABLE/u);
    },
    CASE_TIMEOUT,
  );

  it(
    'should not let an allowed host be reached while bypassing the proxy',
    () => {
      const out = probe(
        names.internal,
        `curl -s --noproxy '*' --max-time 5 https://${ALLOWED_HOST}/ >/dev/null && echo LEAK || echo BLOCKED`,
      );

      expect(out).toContain('BLOCKED');
    },
    CASE_TIMEOUT,
  );

  it(
    'should reach an allowed host through the proxy',
    () => {
      const out = probe(
        names.internal,
        `curl -s -o /dev/null -w '%{http_code}' --max-time 30 https://${ALLOWED_HOST}/`,
        { HTTPS_PROXY: names.proxyUrl },
      );

      expect(out.trim()).toBe('200');
    },
    CASE_TIMEOUT,
  );

  it(
    'should refuse a host that is not on the allowlist',
    () => {
      const out = probe(
        names.internal,
        `curl -s -o /dev/null -w '%{http_code}' --max-time 20 https://${BLOCKED_HOST}/ || echo REJECTED`,
        { HTTPS_PROXY: names.proxyUrl },
      );

      expect(out).not.toContain('200');
    },
    CASE_TIMEOUT,
  );

  it(
    'should refuse CONNECT to a port other than 443, which is what blocks SSH',
    () => {
      const out = probe(
        names.internal,
        "curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://github.com:22/ || echo REJECTED",
        { HTTPS_PROXY: names.proxyUrl },
      );

      expect(out).not.toContain('200');
    },
    CASE_TIMEOUT,
  );

  it(
    'should reject metadata requests that go through the proxy',
    () => {
      const out = probe(
        names.internal,
        "curl -s -o /dev/null -w '%{http_code}' --max-time 15 --proxy http://$PROXY http://169.254.169.254/ || true",
        { PROXY: names.proxyUrl.replace('http://', '') },
      );

      expect(out.trim()).toBe('502');
      expect(docker(['logs', names.proxy])).toContain(
        'PROXY REJECTED http://169.254.169.254/',
      );
    },
    CASE_TIMEOUT,
  );

  it(
    'should reject a TLS SNI that differs from the strict CONNECT host',
    () => {
      const out = nodeProbe(
        names.internal,
        `
          const net = require('node:net');
          const tls = require('node:tls');
          const client = net.connect(8888, ${JSON.stringify(names.proxy)});
          let response = '';
          const fail = (message) => { console.log(message); process.exit(message === 'REJECTED' ? 0 : 1); };
          const timer = setTimeout(() => fail('TIMEOUT'), 10_000);
          client.on('connect', () => client.write('CONNECT registry.npmjs.org:443 HTTP/1.1\\r\\nHost: registry.npmjs.org:443\\r\\n\\r\\n'));
          client.on('data', (chunk) => {
            response += chunk;
            if (!response.includes('\\r\\n\\r\\n')) return;
            if (!response.startsWith('HTTP/1.1 200')) fail('CONNECT_FAILED');
            client.removeAllListeners('data');
            const tunnel = tls.connect({ socket: client, servername: 'example.com', rejectUnauthorized: false });
            tunnel.once('secureConnect', () => fail('LEAK'));
            tunnel.once('error', () => fail('REJECTED'));
          });
          client.once('error', () => fail('REJECTED'));
          client.once('close', () => { clearTimeout(timer); });
        `,
      );

      expect(out).toContain('REJECTED');
    },
    CASE_TIMEOUT,
  );
});

describe.skipIf(!DOCKER_TESTS_ENABLED)('open mode perimeter', () => {
  let names: SessionNetworkNames;

  beforeAll(() => {
    docker(['pull', PROBE_IMAGE]);
    names = startSession('b', 'open');
  }, SETUP_TIMEOUT);

  afterAll(() => {
    removeSessionNetwork(names);
  });

  it(
    'should reach an arbitrary host and log its hostname',
    () => {
      const out = probe(
        names.internal,
        `curl -s -o /dev/null -w '%{http_code}' --max-time 30 https://${BLOCKED_HOST}/`,
        { HTTPS_PROXY: names.proxyUrl },
      );

      expect(out.trim()).toBe('200');
      expect(docker(['logs', names.proxy])).toContain(BLOCKED_HOST);
    },
    CASE_TIMEOUT,
  );

  it(
    'should still block the paths that do not go through the proxy',
    () => {
      const out = probe(
        names.internal,
        "curl -s --noproxy '*' --max-time 5 http://169.254.169.254/ >/dev/null && echo LEAK || echo BLOCKED",
      );

      expect(out).toContain('BLOCKED');
    },
    CASE_TIMEOUT,
  );

  it(
    'should reject metadata requests even when the proxy permits public hosts',
    () => {
      const out = probe(
        names.internal,
        "curl -s -o /dev/null -w '%{http_code}' --max-time 15 --proxy http://$PROXY http://169.254.169.254/ || true",
        { PROXY: names.proxyUrl.replace('http://', '') },
      );

      expect(out.trim()).toBe('502');
      expect(docker(['logs', names.proxy])).toContain(
        'Destination 169.254.169.254 is not a public IPv4 address.',
      );
    },
    CASE_TIMEOUT,
  );
});

describe.skipIf(!DOCKER_TESTS_ENABLED)('none mode', () => {
  beforeAll(() => {
    docker(['pull', PROBE_IMAGE]);
  }, SETUP_TIMEOUT);

  it(
    'should give the container no network at all',
    () => {
      const out = probe(
        'none',
        `ip -o link show | awk -F': ' '{print $2}'; curl -s --max-time 5 https://${BLOCKED_HOST}/ >/dev/null && echo LEAK || echo NO_NETWORK`,
      );

      expect(out).toContain('NO_NETWORK');
      expect(out).not.toMatch(/eth\d/u);
    },
    CASE_TIMEOUT,
  );
});
