import { describe, it, expect } from 'vitest';
import { assertSafeTargetUrl, UnsafeUrlError } from '../url-guard.js';

describe('assertSafeTargetUrl', () => {
  it('accepts ordinary http(s) hosts', () => {
    expect(assertSafeTargetUrl('https://paperless.example.com').hostname).toBe(
      'paperless.example.com',
    );
    expect(assertSafeTargetUrl('http://example.org:8000/api').protocol).toBe('http:');
  });

  it('accepts private/LAN hosts (the normal self-hosted deployment)', () => {
    // RFC1918 and localhost are legitimate Paperless targets and must remain allowed.
    expect(() => assertSafeTargetUrl('http://192.168.1.50:8000')).not.toThrow();
    expect(() => assertSafeTargetUrl('http://10.0.0.5')).not.toThrow();
    expect(() => assertSafeTargetUrl('http://localhost:8000')).not.toThrow();
    expect(() => assertSafeTargetUrl('http://127.0.0.1:8000')).not.toThrow();
  });

  it('rejects non-http(s) schemes (protocol smuggling / local file read)', () => {
    expect(() => assertSafeTargetUrl('file:///etc/passwd')).toThrow(UnsafeUrlError);
    expect(() => assertSafeTargetUrl('gopher://evil/_')).toThrow(UnsafeUrlError);
    expect(() => assertSafeTargetUrl('ftp://host/x')).toThrow(UnsafeUrlError);
  });

  it('rejects embedded credentials in the URL', () => {
    expect(() => assertSafeTargetUrl('http://user:pass@example.com')).toThrow(UnsafeUrlError);
    expect(() => assertSafeTargetUrl('http://user@example.com')).toThrow(UnsafeUrlError);
  });

  it('rejects cloud-metadata / link-local and unspecified addresses', () => {
    expect(() => assertSafeTargetUrl('http://169.254.169.254/latest/meta-data/')).toThrow(
      UnsafeUrlError,
    );
    expect(() => assertSafeTargetUrl('http://169.254.0.1')).toThrow(UnsafeUrlError);
    expect(() => assertSafeTargetUrl('http://0.0.0.0:8000')).toThrow(UnsafeUrlError);
    expect(() => assertSafeTargetUrl('http://[::]:8000')).toThrow(UnsafeUrlError);
    expect(() => assertSafeTargetUrl('http://[fe80::1]')).toThrow(UnsafeUrlError);
  });

  it('rejects malformed URLs', () => {
    expect(() => assertSafeTargetUrl('not a url')).toThrow(UnsafeUrlError);
    expect(() => assertSafeTargetUrl('')).toThrow(UnsafeUrlError);
  });
});
