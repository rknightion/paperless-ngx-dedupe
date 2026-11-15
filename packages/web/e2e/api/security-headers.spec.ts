import { test, expect } from '../fixtures/test-app';

for (const path of ['/api/v1/health', '/']) {
  test(`${path} carries the response security policy`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'x-frame-options': 'SAMEORIGIN',
      'content-security-policy': "frame-ancestors 'self'",
    });
  });
}

test('CORS preflight carries the response security policy', async ({ request }) => {
  const response = await request.fetch('/api/v1/health', { method: 'OPTIONS' });
  expect(response.status()).toBe(204);
  expect(response.headers()).toMatchObject({
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    'x-frame-options': 'SAMEORIGIN',
    'content-security-policy': "frame-ancestors 'self'",
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
});
