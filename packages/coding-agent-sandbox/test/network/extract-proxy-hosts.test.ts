import { describe, expect, it } from 'vitest';
import { extractProxyHosts } from '../../src/network/extract-proxy-hosts';

const CONNECT_LINE = 'PROXY CONNECT registry.npmjs.org:443 104.16.0.35';
const HTTP_LINE = 'PROXY HTTP example.com:80 93.184.216.34';
const REJECTED_LINE =
  'PROXY REJECTED play.googleapis.com:443 Host play.googleapis.com is not on the strict allowlist.';

describe('extractProxyHosts', () => {
  it('should read the hostname out of an established tunnel', () => {
    expect(extractProxyHosts(CONNECT_LINE).reached).toContain('registry.npmjs.org');
  });

  it('should read the hostname out of a plain HTTP request', () => {
    expect(extractProxyHosts(HTTP_LINE).reached).toContain('example.com');
  });

  it('should report refused hosts separately, so denials are auditable too', () => {
    const audit = extractProxyHosts(REJECTED_LINE);

    expect(audit.blocked).toEqual(['play.googleapis.com']);
    expect(audit.reached).toEqual([]);
  });

  it('should not report a host as blocked once it was also reached', () => {
    const audit = extractProxyHosts(
      [
        'PROXY REJECTED registry.npmjs.org:443 CONNECT port is not 443',
        CONNECT_LINE,
      ].join('\n'),
    );

    expect(audit.blocked).toEqual([]);
    expect(audit.reached).toEqual(['registry.npmjs.org']);
  });

  it('should report each host once regardless of how often it appears', () => {
    const log = [CONNECT_LINE, CONNECT_LINE, HTTP_LINE].join('\n');

    expect(extractProxyHosts(log).reached).toEqual(['example.com', 'registry.npmjs.org']);
  });

  it('should sort the hosts so the audit is stable between runs', () => {
    const audit = extractProxyHosts([HTTP_LINE, CONNECT_LINE].join('\n'));

    expect(audit.reached).toEqual([...audit.reached].sort());
  });

  it('should ignore lines that name no destination', () => {
    expect(extractProxyHosts('PROXY READY strict:8080 6 strict host pattern(s)')).toEqual(
      { reached: [], blocked: [] },
    );
  });

  it('should return nothing for a log with no traffic', () => {
    expect(extractProxyHosts('')).toEqual({ reached: [], blocked: [] });
  });
});
