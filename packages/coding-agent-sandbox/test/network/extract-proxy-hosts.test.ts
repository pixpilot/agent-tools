import { describe, expect, it } from 'vitest';
import { extractProxyHosts } from '../../src/network/extract-proxy-hosts';

const CONNECT_LINE =
  'CONNECT   Sep 07 19:59:55.165 [1]: Request (file descriptor 5): CONNECT example.com:443 HTTP/1.1';
const ESTABLISHED_LINE =
  'CONNECT   Sep 07 19:59:55.231 [1]: Established connection to host "registry.npmjs.org" using file descriptor 6.';
const FILTERED_LINE =
  'NOTICE    Sep 07 19:59:56.001 [1]: Proxying refused on filtered domain "evil.example"';

describe('extractProxyHosts', () => {
  it('should read the hostname out of a CONNECT request', () => {
    expect(extractProxyHosts(CONNECT_LINE)).toContain('example.com');
  });

  it('should read the hostname out of an established tunnel', () => {
    expect(extractProxyHosts(ESTABLISHED_LINE)).toContain('registry.npmjs.org');
  });

  it('should include hosts that were refused, so denials are auditable too', () => {
    expect(extractProxyHosts(FILTERED_LINE)).toContain('evil.example');
  });

  it('should report each host once regardless of how often it appears', () => {
    const log = [CONNECT_LINE, CONNECT_LINE, ESTABLISHED_LINE].join('\n');

    expect(extractProxyHosts(log).filter((host) => host === 'example.com')).toHaveLength(
      1,
    );
  });

  it('should sort the hosts so the audit is stable between runs', () => {
    const hosts = extractProxyHosts(
      [FILTERED_LINE, CONNECT_LINE, ESTABLISHED_LINE].join('\n'),
    );

    expect(hosts).toEqual([...hosts].sort());
  });

  it('should return nothing for a log with no traffic', () => {
    expect(extractProxyHosts('NOTICE Initializing tinyproxy ...')).toEqual([]);
  });
});
