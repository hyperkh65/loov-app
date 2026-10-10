import crypto from 'crypto';

// In-memory one-time token store for internal background jobs
// Works because NAS runs a persistent Node.js process (not serverless)
const _tokens = new Map<string, string>(); // token → userId

export function createJobToken(userId: string): string {
  const token = crypto.randomUUID();
  _tokens.set(token, userId);
  // Auto-expire after 60s
  setTimeout(() => _tokens.delete(token), 60_000);
  return token;
}

export function consumeJobToken(token: string): string | null {
  const userId = _tokens.get(token) ?? null;
  if (userId) _tokens.delete(token);
  return userId;
}
