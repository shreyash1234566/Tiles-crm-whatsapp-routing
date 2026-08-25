// Unit tests must not depend on a developer's or deployment's real secrets.
process.env.ENCRYPTION_KEY = '00'.repeat(32);
process.env.META_APP_SECRET = 'vitest-meta-app-secret';
