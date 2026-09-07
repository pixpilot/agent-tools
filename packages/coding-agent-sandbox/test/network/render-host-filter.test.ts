import { describe, expect, it } from 'vitest';
import { renderHostFilter } from '../../src/network/render-host-filter';

/** Matches the way tinyproxy applies a filter line to a requested hostname. */
function matches(host: string, requested: string): boolean {
  return new RegExp(renderHostFilter(host), 'u').test(requested);
}

describe('renderHostFilter', () => {
  it('should anchor and escape an exact host', () => {
    expect(renderHostFilter('registry.npmjs.org')).toBe('^registry\\.npmjs\\.org$');
  });

  it('should match the host it allows', () => {
    expect(matches('registry.npmjs.org', 'registry.npmjs.org')).toBe(true);
  });

  it('should not match a suffix attack on an allowed host', () => {
    expect(matches('registry.npmjs.org', 'registry.npmjs.org.attacker.example')).toBe(
      false,
    );
  });

  it('should not match a prefix attack on an allowed host', () => {
    expect(matches('registry.npmjs.org', 'evil-registry.npmjs.org')).toBe(false);
  });

  it('should treat dots as literals rather than wildcards', () => {
    expect(matches('registry.npmjs.org', 'registryxnpmjs.org')).toBe(false);
  });

  it('should match subdomains for a wildcard host', () => {
    expect(matches('*.githubusercontent.com', 'objects.githubusercontent.com')).toBe(
      true,
    );
    expect(matches('*.githubusercontent.com', 'a.b.githubusercontent.com')).toBe(true);
  });

  it('should not let a wildcard host match the bare domain or another domain', () => {
    expect(matches('*.githubusercontent.com', 'githubusercontent.com')).toBe(false);
    expect(matches('*.githubusercontent.com', 'githubusercontent.com.evil.example')).toBe(
      false,
    );
  });

  it('should normalise case and surrounding whitespace', () => {
    expect(renderHostFilter('  Registry.NPMJS.org ')).toBe('^registry\\.npmjs\\.org$');
  });

  it.each([
    ['a bare regex', '.*'],
    ['an embedded wildcard', 'registry.*.org'],
    ['a trailing wildcard', 'npmjs.*'],
    ['an alternation', 'npmjs.org|evil.example'],
    ['a URL rather than a host', 'https://npmjs.org'],
    ['a path', 'npmjs.org/packages'],
    ['a port', 'npmjs.org:443'],
    ['an internal wildcard label', 'a.*.npmjs.org'],
    ['a single label', 'localhost'],
    ['an empty host', ''],
    ['a leading dot', '.npmjs.org'],
    ['whitespace inside the host', 'npm js.org'],
  ])('should reject %s', (_description, host) => {
    expect(() => renderHostFilter(host)).toThrow(/Invalid egress host/u);
  });
});
