import { describe, expect, it } from 'vitest';
import { isAllowedPublicUrl } from '../../../supabase/functions/parse-material/urlSafety.js';

describe('isAllowedPublicUrl', () => {
  it('allows public HTTP(S) URLs only', () => {
    expect(isAllowedPublicUrl('https://example.com/article')).toBe(true);
    expect(isAllowedPublicUrl('http://8.8.8.8/')).toBe(true);
    expect(isAllowedPublicUrl('file:///etc/passwd')).toBe(false);
  });

  it('blocks localhost, private, link-local, and metadata addresses', () => {
    for (const url of [
      'http://localhost/',
      'http://127.0.0.1/',
      'http://10.0.0.1/',
      'http://172.16.0.1/',
      'http://192.168.1.1/',
      'http://169.254.169.254/',
      'http://[::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:7f00:1]/',
    ]) {
      expect(isAllowedPublicUrl(url)).toBe(false);
    }
  });
});
