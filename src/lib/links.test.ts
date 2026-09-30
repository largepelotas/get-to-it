import { describe, expect, it } from 'vitest';
import { isSafeUrl, normalizeUrl } from './links';

describe('links', () => {
  it('only opens web and email links', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com/a?b=1')).toBe(true);
    expect(isSafeUrl('mailto:sam@example.com')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('example.com')).toBe(false);
  });

  it('completes typed addresses', () => {
    expect(normalizeUrl(' example.com ')).toBe('https://example.com');
    expect(normalizeUrl('example.com/path?q=1')).toBe('https://example.com/path?q=1');
    expect(normalizeUrl('localhost:3000')).toBe('https://localhost:3000');
    expect(normalizeUrl('//example.com')).toBe('https://example.com');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeUrl('sam@example.com')).toBe('mailto:sam@example.com');
    expect(normalizeUrl('mailto:sam@example.com')).toBe('mailto:sam@example.com');
  });

  it('rejects what it will not open', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('two words')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('file:///etc/passwd')).toBeNull();
  });
});
